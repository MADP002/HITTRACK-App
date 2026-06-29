import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
   ActivityIndicator, Alert, Animated, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import {
  doc, getDoc, updateDoc, setDoc, addDoc, collection, getDocs,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { getLevelLabel, getNextLevel, getLevelStars } from '../../lib/trainingPrograms';

// ── Cloudinary config — fill these in from your Cloudinary dashboard ──────
// Dashboard → Settings → Upload → Upload Presets (create one as Unsigned)
const CLOUDINARY_CLOUD_NAME   = 'dthdcmisj';    // e.g. 'hittrack'
const CLOUDINARY_UPLOAD_PRESET = 'hittrack_videos'; // e.g. 'hittrack_videos'

import { C } from '../../lib/theme';

// ── Save session + mark training complete in Firestore ────────────
async function completeTraining({ uid, trainingId, level, properReps, duration, requiredReps }) {
  try {
    console.log(`[completeTraining] called with trainingId="${trainingId}" level="${level}" properReps=${properReps}`);
    const workRef  = doc(db, 'workouts', uid);
    const workSnap = await getDoc(workRef);
    if (!workSnap.exists()) { console.log('[completeTraining] workouts doc does not exist!'); return { leveledUp: false }; }

    const data    = workSnap.data();
    const program = data.trainingProgram ? [...data.trainingProgram] : [];
    console.log(`[completeTraining] program has ${program.length} trainings. ids:`, program.map(t => t.id));

    // SAFETY GUARD: never proceed if the read came back with an empty/missing
    // program. Writing back an empty array here would silently wipe every
    // completed level for the member — better to fail loudly and skip the
    // write than risk destroying real progress on a transient bad read.
    if (program.length === 0) {
      console.error('[completeTraining] !!! trainingProgram was empty on read — ABORTING to avoid wiping progress. This training will not be marked complete; please retry. !!!');
      return { leveledUp: false };
    }

    // RESUME: accumulate reps across sessions. Each session's reps add to a
    // running tally (repProgress) for this training+level; the level only
    // completes once the CUMULATIVE total reaches the target. So a member can
    // chip away over several sittings instead of needing the whole target in
    // one go — which the strict camera detection makes nearly impossible.
    let reachedTarget = false;
    const idx = program.findIndex(t => t.id === trainingId);
    if (idx !== -1) {
      const completed    = program[idx].completedLevels || [];
      const prevProgress = program[idx].repProgress?.[level] || 0;
      const newProgress  = prevProgress + (properReps || 0);
      reachedTarget = (requiredReps || 0) > 0 && newProgress >= requiredReps;
      program[idx] = {
        ...program[idx],
        // keep the running tally; reset to 0 once the level is complete
        repProgress: { ...(program[idx].repProgress || {}), [level]: reachedTarget ? 0 : newProgress },
      };
      console.log(`[completeTraining] ${trainingId}/${level}: +${properReps} reps -> ${reachedTarget ? 'COMPLETE' : `${newProgress}/${requiredReps}`}`);
      if (reachedTarget && !completed.includes(level)) {
        program[idx] = { ...program[idx], completedLevels: [...completed, level] };
        if (idx + 1 < program.length) {
          program[idx + 1] = { ...program[idx + 1], unlocked: true };
        }
      }
    } else {
      console.log(`[completeTraining] !!! trainingId "${trainingId}" NOT FOUND in program !!!`);
    }

    // Check if all trainings are complete at this level
    const allDone = program.every(t => (t.completedLevels || []).includes(level));
    let nextLevel = level;
    let newStars  = getLevelStars(level);
    let leveledUp = false;

    if (allDone) {
      const next = getNextLevel(level);
      if (next) {
        nextLevel = next;
        newStars  = getLevelStars(next);
        leveledUp = true;
        // Reset unlock state for new level — only first unlocked
        program.forEach((t, i) => {
          program[i] = { ...t, unlocked: i === 0 };
        });
      }
    }

    await updateDoc(workRef, {
      trainingProgram:      program,
      trainingCurrentLevel: nextLevel,
      trainingLevelStars:   newStars,
    });

    // Save session record
    const userSnap   = await getDoc(doc(db, 'users', uid));
    const memberName = userSnap.exists() ? (userSnap.data().name || 'Member') : 'Member';

    await addDoc(collection(db, 'trainingSessions'), {
      uid, memberName, trainingId, level,
      properReps: properReps || 0,
      duration:   duration   || 0,
      completedAt: serverTimestamp(),
    });

    // ── Calculate real stats ─────────────────────────────────────
    // Load current user data for streak + weekly progress
    const userSnap2   = await getDoc(doc(db, 'users', uid));
    const uData2      = userSnap2.exists() ? userSnap2.data() : {};
    const curStreak   = uData2.streak || 0;
    const lastTrained = uData2.lastTrainedAt;
    const daysPerWeek = uData2.daysPerWeek || 3;
    const newTotal    = (uData2.totalWorkouts || 0) + 1;

    // Streak: same day = keep, yesterday = +1, else = reset to 1
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    let newStreak = 1;
    if (lastTrained?.seconds) {
      const lastDate = new Date(lastTrained.seconds * 1000);
      lastDate.setHours(0,0,0,0);
      if (lastDate.getTime() === today.getTime())     newStreak = curStreak;       // already trained today
      else if (lastDate.getTime() === yesterday.getTime()) newStreak = curStreak + 1; // consecutive day
      // else newStreak = 1 — missed a day, reset
    }

    // Weekly progress: count unique days trained this week (Mon–Sun)
    const monday = new Date(today);
    const dow = monday.getDay();
    monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
    let weekDays = new Set([today.toDateString()]); // include today
    try {
      const weekSnap = await getDocs(
        query(collection(db, 'trainingSessions'), where('uid', '==', uid))
      );
      weekSnap.docs.forEach(d => {
        const ts = d.data().completedAt?.seconds;
        if (!ts) return;
        const dt = new Date(ts * 1000);
        if (dt >= monday) { dt.setHours(0,0,0,0); weekDays.add(dt.toDateString()); }
      });
    } catch (_) {}
    const weeklyPct = Math.min(Math.round((weekDays.size / Math.max(daysPerWeek, 1)) * 100), 100);

    // Update users/{uid} — home screen reads from here
    try {
      await updateDoc(doc(db, 'users', uid), {
        totalWorkouts: newTotal,
        streak:        newStreak,
        weeklyPct,
        lastTrainedAt: serverTimestamp(),
      });
    } catch (_) {}

    // Update stats/{uid} — leaderboard + achievements read from here
    try {
      await setDoc(doc(db, 'stats', uid), {
        uid,
        totalWorkouts:         newTotal,
        totalTrainingSessions: (uData2.totalTrainingSessions || 0) + 1,
        totalProperReps:       (uData2.totalProperReps || 0) + (properReps || 0),
        streak:                newStreak,
        weeklyPct,
        trainingLevel:         nextLevel,
        lastTrainedAt:         serverTimestamp(),
      }, { merge: true });
    } catch (_) {}

    return { leveledUp, nextLevel };
  } catch (e) {
    console.error('completeTraining error:', e);
    return { leveledUp: false };
  }
}

export default function TrainingCompleteScreen() {
  const router = useRouter();
  const {
    trainingId, level,
    properReps:  properRepsParam,
    requiredReps: requiredRepsParam,
    duration:    durationParam,
    recordingUri,
    trainingName,
    avgQualityPct, paceRepsPerMin, consistencyPct, bestStreak,
  } = useLocalSearchParams();

  const properReps   = parseInt(properRepsParam  || '0',  10);
  const requiredReps = parseInt(requiredRepsParam || '50', 10);
  const duration     = parseInt(durationParam    || '0',  10);
  const hasRecording = !!recordingUri && recordingUri !== 'null';

  const [coaches,       setCoaches]       = useState([]);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [showPicker,    setShowPicker]    = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [leveledUp,     setLeveledUp]     = useState(false);
  const [nextLevel,     setNextLevel]     = useState(level);
  const [saving,        setSaving]        = useState(true);

  // Entrance animation
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale   = useRef(new Animated.Value(0.6)).current;
  const cardOpacity  = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(40)).current;

  // Guard so completeTraining only ever fires once per screen visit,
  // even though the useEffect now watches [trainingId, level] deps and
  // could re-run if Expo Router delivers params in two renders.
  const hasCompletedRef = useRef(false);

  // Entrance animation — runs once on mount, independent of params.
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(titleScale,   { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity,     { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(cardTranslateY,  { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    // Save training progress + load coaches
    const user = auth.currentUser;
    if (!user) return;

    // Guard: Expo Router can return undefined on the very first synchronous
    // render before params are hydrated. If trainingId or level is missing
    // here, completeTraining's findIndex will return -1 and silently skip
    // marking the training complete. Bail out — the useEffect that watches
    // [trainingId, level] below will re-run once the params resolve.
    if (!trainingId || !level) {
      console.warn(`[TrainingComplete] params not ready yet — trainingId="${trainingId}" level="${level}" — skipping completeTraining, will retry when params resolve`);
      setSaving(false);
      return;
    }

    // Prevent double-fire: if params arrive across two renders (first render
    // undefined, second render with real values), the dep-array change would
    // trigger a second run. hasCompletedRef ensures we only save once.
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;

    Promise.all([
      completeTraining({ uid: user.uid, trainingId, level, properReps, duration, requiredReps }),
      getDocs(collection(db, 'users')),
    ]).then(([result, usersSnap]) => {
      setLeveledUp(result.leveledUp);
      setNextLevel(result.nextLevel || level);

      const coachs = usersSnap.docs
        .filter(d => d.data().role === 'coach')
        .map(d => ({ uid: d.id, name: d.data().name || 'Coach' }));
      setCoaches(coachs);
      setSaving(false);
    });
  }, [trainingId, level]);

  const handleSubmitRecording = async () => {
    if (!selectedCoach) {
      Alert.alert('Select a Coach', 'Please select a coach to send your session to.');
      return;
    }
    setUploading(true);
    try {
      const user       = auth.currentUser;
      const userSnap   = await getDoc(doc(db, 'users', user.uid));
      const memberName = userSnap.exists() ? userSnap.data().name : 'Member';

      let recordingUrl = null;

      // Upload video to Cloudinary if a recording exists
      if (hasRecording && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME') {
        try {
          const formData = new FormData();
          formData.append('file', {
            uri:  recordingUri,
            type: 'video/mp4',
            name: `training_${trainingId}_${Date.now()}.mp4`,
          });
          formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
          formData.append('folder', `hittrack/${user.uid}`);

          const cloudRes = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
            { method: 'POST', body: formData }
          );
          const cloudData = await cloudRes.json();
          recordingUrl = cloudData.secure_url || null;
        } catch (uploadErr) {
          console.warn('Cloudinary upload failed, saving session without video:', uploadErr);
        }
      }

      // Save session report to Firestore
      await addDoc(collection(db, 'trainingRecordings'), {
        uid:          user.uid,
        memberName,
        coachUid:     selectedCoach.uid,
        coachName:    selectedCoach.name,
        trainingId,
        trainingName: trainingName || trainingId,
        level,
        properReps,
        duration,
        recordingUrl,
        // Performance breakdown — derived from real per-rep data captured
        // during the session, not estimates. Blank string params (when a
        // metric couldn't be computed, e.g. only 1 rep total) are
        // normalized to null rather than saved as empty strings.
        avgQualityPct:  avgQualityPct  !== '' ? Number(avgQualityPct)  : null,
        paceRepsPerMin: paceRepsPerMin !== '' ? Number(paceRepsPerMin) : null,
        consistencyPct: consistencyPct !== '' ? Number(consistencyPct) : null,
        bestStreak:     bestStreak     !== '' ? Number(bestStreak)     : null,
        submittedAt:  serverTimestamp(),
        viewed:       false,
      });

      setSubmitted(true);
    } catch (e) {
      console.error(e);
      Alert.alert('Submit failed', 'Could not send your session report. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleProceed = () => {
    router.replace('/(member)/training-lab');
  };

  const fmtDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── TRAINING COMPLETE TITLE ── */}
        <Animated.View style={[s.titleSection, { opacity: titleOpacity, transform: [{ scale: titleScale }] }]}>
          <Text style={s.completeEmoji}>🏆</Text>
          <Text style={s.completeTitle}>TRAINING</Text>
          <Text style={s.completeTitleRed}>COMPLETE</Text>
          {saving && <ActivityIndicator size="small" color={C.gold} style={{ marginTop: 12 }} />}
        </Animated.View>

        <Animated.View style={[s.animatedCard, { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }]}>

          {/* ── LEVEL UP BANNER ── */}
          {leveledUp && (
            <View style={s.levelUpCard}>
              <Text style={{ fontSize: 32 }}>⭐</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.levelUpTitle}>Level Up!</Text>
                <Text style={s.levelUpSub}>
                  You've completed all {getLevelLabel(level)} trainings.{'\n'}
                  You are now at <Text style={{ color: C.gold, fontWeight: '800' }}>{getLevelLabel(nextLevel)}</Text> level!
                </Text>
              </View>
            </View>
          )}

          {/* ── STATS ── */}
          <View style={s.statsCard}>
            <Text style={s.statsTitle}>Session Results</Text>
            <View style={s.statsRow}>
              {[
                { icon: '🥊', label: 'Proper Reps',  val: properReps,        color: C.green },
                { icon: '🎯', label: 'Required',     val: requiredReps,      color: C.gold  },
                { icon: '⏱️', label: 'Duration',     val: fmtDuration(duration), color: C.blue },
              ].map((st, i) => (
                <View key={i} style={[s.statItem, { borderColor: st.color + '33' }]}>
                  <Text style={{ fontSize: 22 }}>{st.icon}</Text>
                  <Text style={[s.statVal, { color: st.color }]}>{st.val}</Text>
                  <Text style={s.statLabel}>{st.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── PERFORMANCE BREAKDOWN ── */}
          {avgQualityPct !== '' && (
            <View style={s.statsCard}>
              <Text style={s.statsTitle}>Performance Breakdown</Text>
              <View style={s.statsRow}>
                {[
                  avgQualityPct  !== '' && { icon: '✨', label: 'Form Quality',  val: `${avgQualityPct}%`,  color: C.gold },
                  paceRepsPerMin !== '' && { icon: '⚡', label: 'Pace',          val: `${paceRepsPerMin}/min`, color: C.blue },
                  consistencyPct !== '' && { icon: '📊', label: 'Consistency',  val: `${consistencyPct}%`, color: C.green },
                  bestStreak     !== '' && { icon: '🔥', label: 'Best Streak',  val: bestStreak,           color: C.red },
                ].filter(Boolean).map((st, i) => (
                  <View key={i} style={[s.statItem, { borderColor: st.color + '33' }]}>
                    <Text style={{ fontSize: 22 }}>{st.icon}</Text>
                    <Text style={[s.statVal, { color: st.color }]}>{st.val}</Text>
                    <Text style={s.statLabel}>{st.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── RECORDING SUBMISSION ── */}
          {!submitted ? (
            <View style={s.recordingCard}>
              <Text style={s.recordingTitle}>
                {hasRecording && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME' ? '📹 Submit Recording to Coach' : '📋 Submit Session Report'}
              </Text>
              <Text style={s.recordingBody}>
                {hasRecording && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME'
                  ? 'Your training video will be uploaded to Cloudinary and sent to your coach.'
                  : 'Your session stats (reps, level, duration) will be sent to your coach.'
                }
              </Text>

              {/* Coach picker */}
              <TouchableOpacity
                style={s.coachPicker}
                onPress={() => setShowPicker(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="person-outline" size={18} color={selectedCoach ? C.blue : C.gray} />
                <Text style={[s.coachPickerText, selectedCoach && { color: C.white }]}>
                  {selectedCoach ? `🥊 ${selectedCoach.name}` : 'Select a coach...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={C.gray} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.submitRecordingBtn, (!selectedCoach || uploading) && { opacity: 0.5 }]}
                onPress={handleSubmitRecording}
                disabled={!selectedCoach || uploading}
                activeOpacity={0.85}
              >
                {uploading
                  ? <ActivityIndicator color={C.white} />
                  : <>
                      <Ionicons name="send-outline" size={18} color={C.white} />
                      <Text style={s.submitRecordingBtnText}>
                        {hasRecording && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME' ? 'Submit Recording' : 'Send Session Report'}
                      </Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.submittedCard}>
              <Ionicons name="checkmark-circle" size={32} color={C.green} />
              <View style={{ flex: 1 }}>
                <Text style={s.submittedTitle}>Submitted to {selectedCoach?.name}</Text>
                <Text style={s.submittedSub}>Your coach will review your session shortly.</Text>
              </View>
            </View>
          )}

          {/* ── VIEW TRAINING REPORT ── */}
          <TouchableOpacity
            style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#1E1E1E', borderWidth:1, borderColor:'#2A2A2A', borderRadius:14, paddingVertical:14, marginBottom:10 }}
            onPress={() => router.push('/(member)/training-report')} activeOpacity={0.85}>
            <Ionicons name="bar-chart-outline" size={18} color="#F5C842" />
            <Text style={{ fontSize:14, fontWeight:'800', color:'#F5C842' }}>View Training Report</Text>
          </TouchableOpacity>

          {/* ── PROCEED BUTTON ── */}
          <TouchableOpacity style={s.proceedBtn} onPress={handleProceed} activeOpacity={0.85}>
            <Text style={s.proceedBtnText}>Back to Training Lab</Text>
            <Ionicons name="arrow-forward" size={18} color={C.white} />
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>

      {/* ── COACH PICKER MODAL ── */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select a Coach</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Ionicons name="close" size={22} color={C.gray} />
              </TouchableOpacity>
            </View>
            {coaches.length === 0 ? (
              <Text style={{ color: C.gray, textAlign: 'center', padding: 24 }}>No coaches found.</Text>
            ) : (
              coaches.map(coach => (
                <TouchableOpacity
                  key={coach.uid}
                  style={[s.coachRow, selectedCoach?.uid === coach.uid && s.coachRowSelected]}
                  onPress={() => { setSelectedCoach(coach); setShowPicker(false); }}
                  activeOpacity={0.8}
                >
                  <View style={s.coachAvatar}>
                    <Text style={s.coachAvatarText}>{coach.name[0].toUpperCase()}</Text>
                  </View>
                  <Text style={s.coachName}>{coach.name}</Text>
                  {selectedCoach?.uid === coach.uid && (
                    <Ionicons name="checkmark-circle" size={20} color={C.green} />
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 50, gap: 20 },

  // Title section
  titleSection: { alignItems: 'center', paddingVertical: 20, gap: 4 },
  completeEmoji:   { fontSize: 64, marginBottom: 8 },
  completeTitle:   { fontSize: 48, fontWeight: '900', color: C.white, letterSpacing: 4, lineHeight: 52 },
  completeTitleRed:{ fontSize: 48, fontWeight: '900', color: C.red,   letterSpacing: 4, lineHeight: 52, textShadowColor: C.red, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 },

  animatedCard: { gap: 16 },

  // Level up
  levelUpCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.gold + '18', borderRadius: 18, borderWidth: 1.5, borderColor: C.gold + '55', padding: 18 },
  levelUpTitle:{ fontSize: 18, fontWeight: '900', color: C.gold, marginBottom: 4 },
  levelUpSub:  { fontSize: 13, color: C.gray, lineHeight: 20 },

  // Stats
  statsCard:  { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, gap: 14 },
  statsTitle: { fontSize: 14, fontWeight: '800', color: C.white },
  statsRow:   { flexDirection: 'row', gap: 10 },
  statItem:   { flex: 1, backgroundColor: C.inputBg, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 6 },
  statVal:    { fontSize: 24, fontWeight: '900' },
  statLabel:  { fontSize: 9, color: C.gray, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

  // Recording
  recordingCard:  { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, gap: 14 },
  recordingTitle: { fontSize: 15, fontWeight: '800', color: C.white },
  recordingBody:  { fontSize: 13, color: C.gray, lineHeight: 20 },

  coachPicker:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 50 },
  coachPickerText: { flex: 1, fontSize: 14, color: C.gray },

  submitRecordingBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.blue, borderRadius: 12, height: 50 },
  submitRecordingBtnText: { fontSize: 14, fontWeight: '800', color: C.white },

  // Submitted
  submittedCard:  { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.green + '12', borderRadius: 18, borderWidth: 1, borderColor: C.green + '44', padding: 18 },
  submittedTitle: { fontSize: 14, fontWeight: '800', color: C.white, marginBottom: 3 },
  submittedSub:   { fontSize: 12, color: C.gray },

  // Proceed
  proceedBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.red, borderRadius: 14, height: 56, shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  proceedBtnText: { fontSize: 15, fontWeight: '800', color: C.white },

  // Coach picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border, gap: 4 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 18, fontWeight: '900', color: C.white },
  coachRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, marginBottom: 4 },
  coachRowSelected:{ backgroundColor: C.green + '12', borderWidth: 1, borderColor: C.green + '33' },
  coachAvatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: C.blue + '22', borderWidth: 1.5, borderColor: C.blue + '55', justifyContent: 'center', alignItems: 'center' },
  coachAvatarText: { fontSize: 16, fontWeight: '900', color: C.blue },
  coachName:       { flex: 1, fontSize: 15, fontWeight: '700', color: C.white },
});