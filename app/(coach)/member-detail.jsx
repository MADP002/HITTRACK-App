import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
  Modal, Dimensions, Linking, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import {
  doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  collection, query, where, serverTimestamp, setDoc,
  onSnapshot, orderBy,
} from 'firebase/firestore';
import { buildSchedule } from '../../lib/scheduleBuilder';
import { logActivity } from '../../lib/activityLog';

const { width: SW } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  blue: '#42a5f5', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842', red: '#E63946',
  purple: '#c084fc',
};
const LEVEL_COLORS = { Beginner:'#fb923c', Intermediate:'#F5C842', Advanced:'#4ade80' };
const LEVEL_ICONS  = { Beginner:'🥊', Intermediate:'⚡', Advanced:'🔥' };
const LEVELS       = ['Beginner', 'Intermediate', 'Advanced'];

export default function MemberDetailScreen() {
  const router = useRouter();
  const { uid } = useLocalSearchParams();

  const [member,       setMember]       = useState(null);
  const [coachProfile, setCoachProfile] = useState({ name: 'Coach' });
  const [loading,      setLoading]      = useState(true);
  const [feedbackList, setFeedbackList] = useState([]);
  const [fbText,       setFbText]       = useState('');
  const [fbRating,     setFbRating]     = useState(0);
  const [fbDay,        setFbDay]        = useState(null); // selected workout day index or null = general
  const [submitting,   setSubmitting]   = useState(false);
  const [workoutRows,  setWorkoutRows]  = useState([]);
  const [showLevel,    setShowLevel]    = useState(false);
  const [showMsg,      setShowMsg]      = useState(false);
  const [msgText,      setMsgText]      = useState('');
  const [msgThread,    setMsgThread]    = useState([]);
  const [sendingMsg,   setSendingMsg]   = useState(false);
  const msgEndRef = useRef(null);
  const [recordings,  setRecordings]  = useState([]);
  const [showCert,    setShowCert]    = useState(false);
  const [certLoading, setCertLoading] = useState(false);

  // Load coach profile
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(s => { if (s.exists()) setCoachProfile(s.data()); })
      .catch(console.error);
  }, []);

  // Load member + workout data
  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      try {
        const [userSnap, statsSnap, workoutSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          getDoc(doc(db, 'stats', uid)).catch(() => null),
          getDoc(doc(db, 'workouts', uid)).catch(() => null),
        ]);
        if (!userSnap.exists()) { setLoading(false); return; }
        const userData  = userSnap.data();
        const statsData = statsSnap?.exists() ? statsSnap.data() : {};
        const merged    = { uid, ...userData, ...statsData };
        setMember(merged);

        // Build workout schedule for this member
        const schedule  = buildSchedule(merged, new Date());
        const wData     = workoutSnap?.exists() ? workoutSnap.data() : {};
        const checked   = wData?.dayChecked        || {};
        const generated = wData?.generatedWorkouts || {};

        const rows = schedule
          .filter(d => d.isWorkout || generated[d.idx])
          .slice(0, 14)
          .map(d => {
            const workout  = generated[d.idx] || d.workout;
            const ch       = checked[d.idx]   || [];
            const exCount  = workout?.exercises?.length || 0;
            const done     = exCount > 0 && ch.length >= exCount && ch.slice(0, exCount).every(Boolean);
            return {
              idx:   d.idx,
              label: d.idx === 0 ? 'Today' : `${d.dayName} · ${d.dateStr}`,
              title: workout?.title || `Session ${d.idx + 1}`,
              duration: workout?.duration || '',
              exercises: (workout?.exercises || []).map(e => typeof e === 'string' ? e : e?.name || ''),
              done,
              isToday: d.idx === 0,
            };
          });
        setWorkoutRows(rows);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [uid]);

  // Load training recordings sent to this coach by this member
  useEffect(() => {
    if (!uid) return;
    const coachUid = auth.currentUser?.uid;
    if (!coachUid) return;
    const q = query(
      collection(db, 'trainingRecordings'),
      where('uid',      '==', uid),
      where('coachUid', '==', coachUid)
    );
    const unsub = onSnapshot(q, snap => {
      const recs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      setRecordings(recs);
    }, console.error);
    return () => unsub();
  }, [uid]);

  // Load feedback (real-time)
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'feedback'), where('memberId', '==', uid));
    const unsub = onSnapshot(q, (snap) => {
      const fbs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setFeedbackList(fbs);
    }, console.error);
    return () => unsub();
  }, [uid]);

  // Load message thread (real-time)
  useEffect(() => {
    if (!uid || !showMsg) return;
    const coachUid = auth.currentUser?.uid;
    if (!coachUid) return;
    const q = query(
      collection(db, 'messages'),
      where('participants', 'array-contains', coachUid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const all    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const thread = all
        .filter(m => m.participants?.includes(uid))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMsgThread(thread);
    }, console.error);
    return () => unsub();
  }, [uid, showMsg]);

  const submitFeedback = async () => {
    if (!fbText.trim() || fbRating === 0 || !member) return;
    setSubmitting(true);
    try {
      const row = fbDay !== null ? workoutRows.find(r => r.idx === fbDay) : null;
      await addDoc(collection(db, 'feedback'), {
        memberId:       uid,
        memberName:     member.name || 'Member',
        coachId:        auth.currentUser?.uid,
        coachName:      coachProfile.name || 'Coach',
        text:           fbText.trim(),
        rating:         fbRating,
        workoutDayIndex: fbDay,
        workoutDayLabel: row ? `${row.title} — ${row.label}` : 'General',
        workoutExercises: row?.exercises || [],
        createdAt:      serverTimestamp(),
      });
      setFbText('');
      setFbRating(0);
      setFbDay(null);
      Alert.alert('Sent!', 'Feedback posted successfully.');
    } catch (e) {
      Alert.alert('Error', 'Could not post feedback.');
      console.error(e);
    } finally { setSubmitting(false); }
  };

  const deleteFeedback = async (fbId) => {
    Alert.alert('Delete Feedback?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteDoc(doc(db, 'feedback', fbId)); }
          catch (e) { Alert.alert('Error', 'Could not delete feedback.'); }
        },
      },
    ]);
  };

  const changeLevel = async (newLevel) => {
    if (!member || newLevel === member.experience) return;
    const oldLevel = member.experience || 'Beginner';
    try {
      const me = auth.currentUser;
      await updateDoc(doc(db, 'users', uid), { experience: newLevel });
      try { await setDoc(doc(db, 'stats', uid), { experience: newLevel }, { merge: true }); } catch (_) {}
      await addDoc(collection(db, 'notifications'), {
        title:        `🎚 Level Updated: ${newLevel}`,
        message:      `Coach ${coachProfile.name || 'Coach'} ${LEVELS.indexOf(newLevel) > LEVELS.indexOf(oldLevel) ? 'promoted' : 'moved'} you to ${newLevel}. Your training plan and leaderboard division have been updated.`,
        audience:     'member',
        targetUserId: uid,
        type:         'level_change',
        oldLevel, newLevel,
        from:         coachProfile.name || 'Coach',
        createdAt:    serverTimestamp(),
      });
      await addDoc(collection(db, 'levelChanges'), {
        memberId:      uid,
        memberName:    member.name || 'Member',
        oldLevel, newLevel,
        changedBy:     me?.uid || '',
        changedByName: coachProfile.name || 'Coach',
        changedByRole: 'coach',
        createdAt:     serverTimestamp(),
      });
      logActivity({
        type: 'level_change', actorId: me?.uid || '',
        actorName: coachProfile.name || 'Coach', actorRole: 'coach',
        payload: { memberId: uid, memberName: member.name, oldLevel, newLevel, isPromote: LEVELS.indexOf(newLevel) > LEVELS.indexOf(oldLevel) },
      });
      setMember(prev => ({ ...prev, experience: newLevel }));
      setShowLevel(false);
      Alert.alert('Done!', `${member.name} moved to ${newLevel}.`);
    } catch (e) { Alert.alert('Error', 'Could not change level.'); console.error(e); }
  };

  const sendMessage = async () => {
    if (!msgText.trim() || sendingMsg) return;
    setSendingMsg(true);
    const coachUid = auth.currentUser?.uid;
    try {
      await addDoc(collection(db, 'messages'), {
        participants: [coachUid, uid],
        from: coachUid, fromName: coachProfile.name || 'Coach',
        to: uid, toName: member?.name || 'Member',
        text: msgText.trim(), createdAt: serverTimestamp(),
      });
      setMsgText('');
    } catch (e) { Alert.alert('Error', 'Could not send message.'); }
    setSendingMsg(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.blue} /></View>
      </SafeAreaView>
    );
  }
  if (!member) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ color: COLORS.gray }}>Member not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: COLORS.blue }}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const lc      = LEVEL_COLORS[member.experience] || COLORS.gold;
  const li      = LEVEL_ICONS[member.experience]  || '🥊';
  const initial = (member.name || '?')[0].toUpperCase();
  const selRow  = fbDay !== null ? workoutRows.find(r => r.idx === fbDay) : null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── LEVEL CONTROL MODAL ── */}
      <Modal visible={showLevel} transparent animationType="slide" onRequestClose={() => setShowLevel(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎚 Level Control</Text>
              <TouchableOpacity onPress={() => setShowLevel(false)}>
                <Ionicons name="close" size={22} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Move <Text style={{ color: COLORS.white, fontWeight: '800' }}>{member.name}</Text> to a new level
            </Text>
            <View style={{ gap: 10, marginTop: 16 }}>
              {LEVELS.map(level => {
                const tc       = LEVEL_COLORS[level] || COLORS.gold;
                const isCurrent = level === member.experience;
                const isPromote = LEVELS.indexOf(level) > LEVELS.indexOf(member.experience);
                return (
                  <TouchableOpacity
                    key={level}
                    style={[styles.levelOption, { borderColor: tc + '44', backgroundColor: tc + '11' }, isCurrent && styles.levelOptionCurrent]}
                    onPress={() => !isCurrent && changeLevel(level)}
                    disabled={isCurrent}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 22 }}>{LEVEL_ICONS[level]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.levelOptionName, { color: isCurrent ? COLORS.gray : tc }]}>{level}</Text>
                      <Text style={styles.levelOptionSub}>
                        {isCurrent ? 'Current level' : isPromote ? '⬆ Promote — harder workouts' : '⬇ Move down — lighter workouts'}
                      </Text>
                    </View>
                    {!isCurrent && (
                      <View style={[styles.levelArrow, { backgroundColor: tc + '22', borderColor: tc + '44' }]}>
                        <Text style={[{ fontSize: 10, fontWeight: '800', color: tc }]}>{isPromote ? 'UP →' : 'DOWN →'}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MESSAGE MODAL ── */}
      <Modal visible={showMsg} transparent animationType="slide" onRequestClose={() => setShowMsg(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💬 Message {member.name?.split(' ')[0]}</Text>
              <TouchableOpacity onPress={() => setShowMsg(false)}>
                <Ionicons name="close" size={22} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
              {msgThread.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 30, gap: 8 }}>
                  <Text style={{ fontSize: 36 }}>💬</Text>
                  <Text style={{ color: COLORS.gray, fontSize: 13 }}>Start a conversation with {member.name?.split(' ')[0]}</Text>
                </View>
              ) : (
                msgThread.map((m, i) => {
                  const isMe = m.from === auth.currentUser?.uid;
                  return (
                    <View key={m.id || i} style={[styles.msgBubbleWrap, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                      <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleThem]}>
                        <Text style={styles.msgText}>{m.text}</Text>
                        <Text style={styles.msgMeta}>{isMe ? 'You' : m.fromName}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.msgInputRow}>
              <TextInput
                style={styles.msgInput}
                value={msgText}
                onChangeText={setMsgText}
                placeholder={`Message ${member.name?.split(' ')[0] || ''}...`}
                placeholderTextColor={COLORS.gray}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!msgText.trim() || sendingMsg) && { opacity: 0.4 }]}
                onPress={sendMessage}
                disabled={!msgText.trim() || sendingMsg}
              >
                {sendingMsg ? <ActivityIndicator size="small" color={COLORS.white} /> : <Ionicons name="send" size={18} color={COLORS.white} />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MAIN SCREEN ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{member.name}</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => setShowMsg(true)}>
            <Ionicons name="chatbubble-outline" size={18} color={COLORS.blue} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topBarBtn, { borderColor: COLORS.purple + '55' }]} onPress={() => setShowLevel(true)}>
            <Ionicons name="bar-chart-outline" size={18} color={COLORS.purple} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── MEMBER FIGHT CARD ── */}
        <View style={[styles.fightCard, { borderColor: lc + '44' }]}>
          <View style={[styles.fightAccent, { backgroundColor: lc }]} />
          <View style={styles.fightTop}>
            <View style={[styles.fightAvatar, { borderColor: lc, backgroundColor: lc + '22' }]}>
              <Text style={[styles.fightAvatarText, { color: lc }]}>{initial}</Text>
            </View>
            <View style={styles.fightInfo}>
              <Text style={styles.fightName}>{member.name}</Text>
              <View style={styles.fightTags}>
                <View style={[styles.chip, { backgroundColor: lc + '22', borderColor: lc + '44' }]}>
                  <Text style={[styles.chipText, { color: lc }]}>{li} {member.experience || 'Beginner'}</Text>
                </View>
                <View style={[styles.chip, { backgroundColor: '#2A1215', borderColor: COLORS.red + '44' }]}>
                  <Text style={[styles.chipText, { color: COLORS.red }]}>🔥 {member.streak || 0}d streak</Text>
                </View>
                {member.goal && (
                  <View style={[styles.chip, { backgroundColor: '#111100', borderColor: COLORS.gold + '33' }]}>
                    <Text style={[styles.chipText, { color: COLORS.gold }]}>🎯 {member.goal}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          {/* Stats strip */}
          <View style={styles.statsStrip}>
            {[
              { icon: '🥊', label: 'Workouts',  val: member.totalWorkouts || 0, color: COLORS.gold  },
              { icon: '🔥', label: 'Streak',     val: `${member.streak || 0}d`, color: COLORS.red   },
              { icon: '📅', label: 'Weekly',     val: `${member.weeklyPct || 0}%`, color: COLORS.green },
            ].map((st, i) => (
              <View key={i} style={[styles.statCell, i < 2 && styles.statCellBorder]}>
                <Text style={{ fontSize: 18 }}>{st.icon}</Text>
                <Text style={[styles.statCellVal, { color: st.color }]}>{st.val}</Text>
                <Text style={styles.statCellLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── FEEDBACK SECTION ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>📝 Post Session Feedback</Text>

          {/* Workout day selector */}
          {workoutRows.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.fieldLabel}>Select a session to comment on</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                {/* General option */}
                <TouchableOpacity
                  style={[styles.dayCard, fbDay === null && styles.dayCardSelected]}
                  onPress={() => setFbDay(null)}
                >
                  <Text style={styles.dayCardEmoji}>★</Text>
                  <Text style={[styles.dayCardTitle, fbDay === null && { color: COLORS.blue }]}>General</Text>
                  <Text style={styles.dayCardSub}>Not tied to a day</Text>
                </TouchableOpacity>
                {workoutRows.map(row => {
                  const isSelected = fbDay === row.idx;
                  return (
                    <TouchableOpacity
                      key={row.idx}
                      style={[
                        styles.dayCard,
                        isSelected && styles.dayCardSelected,
                        row.done && { borderColor: COLORS.green + '55' },
                        row.isToday && !isSelected && { borderColor: COLORS.gold + '55' },
                      ]}
                      onPress={() => setFbDay(row.idx)}
                    >
                      <Text style={styles.dayCardEmoji}>
                        {row.done ? '✅' : row.isToday ? '📅' : '🥊'}
                      </Text>
                      <Text style={[styles.dayCardTitle, isSelected && { color: COLORS.blue }]} numberOfLines={1}>
                        {row.title}
                      </Text>
                      <Text style={styles.dayCardSub} numberOfLines={1}>{row.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Show exercises if a day is selected */}
          {selRow && selRow.exercises.length > 0 && (
            <View style={styles.exercisePreview}>
              <Text style={styles.exercisePreviewTitle}>Exercises for this session:</Text>
              <View style={styles.exercisePills}>
                {selRow.exercises.map((ex, i) => (
                  <View key={i} style={styles.exercisePill}>
                    <Text style={styles.exercisePillText}>{ex}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Star rating */}
          <Text style={styles.fieldLabel}>Rating</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map(s => (
              <TouchableOpacity key={s} onPress={() => setFbRating(s)}>
                <Text style={[styles.star, s <= fbRating && styles.starActive]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Message input */}
          <Text style={styles.fieldLabel}>Your message</Text>
          <TextInput
            style={styles.textArea}
            value={fbText}
            onChangeText={setFbText}
            placeholder={selRow
              ? `Tell ${member.name?.split(' ')[0] || 'them'} how they did in ${selRow.title}...`
              : `Encourage ${member.name?.split(' ')[0] || 'them'} or share a coaching tip...`
            }
            placeholderTextColor={COLORS.gray}
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          <Text style={styles.charCount}>{fbText.length}/500</Text>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (!fbText.trim() || fbRating === 0 || submitting) && styles.submitBtnDisabled]}
            onPress={submitFeedback}
            disabled={!fbText.trim() || fbRating === 0 || submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Text style={styles.submitBtnText}>🥊 Send Feedback →</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── MEDICAL CERTIFICATE ── only shown if member has injuries */}
        {member?.injuries && member.injuries.length > 0 && (
          <View style={[styles.card, { borderColor: member.medicalCert?.submitted ? COLORS.green + '44' : COLORS.red + '44' }]}>
            <View style={styles.certHeader}>
              <Ionicons
                name={member.medicalCert?.submitted ? 'shield-checkmark-outline' : 'warning-outline'}
                size={20}
                color={member.medicalCert?.submitted ? COLORS.green : COLORS.red}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>🏥 Medical Condition</Text>
                <Text style={styles.certInjuryText}>{member.injuries}</Text>
              </View>
            </View>
            {member.medicalCert?.submitted ? (
              <TouchableOpacity
                style={styles.viewCertBtn}
                onPress={() => setShowCert(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={16} color={COLORS.blue} />
                <Text style={styles.viewCertBtnText}>View Submitted Medical Certificate</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.blue} />
              </TouchableOpacity>
            ) : (
              <View style={styles.noCertBox}>
                <Text style={styles.noCertText}>⏳ No medical certificate submitted yet.</Text>
              </View>
            )}
          </View>
        )}

        {/* ── PAST FEEDBACK ── */}
        {feedbackList.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>💬 Past Feedback ({feedbackList.length})</Text>
            <View style={{ gap: 12 }}>
              {feedbackList.map((fb, i) => (
                <View key={fb.id || i} style={styles.fbItem}>
                  <View style={styles.fbHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fbCoach}>{fb.coachName || 'Coach'}</Text>
                      {fb.workoutDayLabel && fb.workoutDayLabel !== 'General' && (
                        <View style={styles.fbDayBadge}>
                          <Text style={styles.fbDayBadgeText}>{fb.workoutDayLabel}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.fbRight}>
                      <Text style={styles.fbStars}>
                        {[1,2,3,4,5].map(j => j <= (fb.rating||0) ? '★' : '☆').join('')}
                      </Text>
                      <TouchableOpacity onPress={() => deleteFeedback(fb.id)} style={styles.fbDelete}>
                        <Ionicons name="trash-outline" size={14} color={COLORS.red} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.fbText}>{fb.text}</Text>
                  {fb.createdAt?.seconds && (
                    <Text style={styles.fbDate}>
                      {new Date(fb.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── SUBMITTED RECORDINGS ── */}
        <View style={[styles.card, { borderColor: recordings.length > 0 ? COLORS.blue + '44' : COLORS.border }]}>
          <View style={styles.recordingsHeader}>
            <Ionicons name="videocam-outline" size={18} color={recordings.length > 0 ? COLORS.blue : COLORS.gray} />
            <Text style={styles.sectionTitle}>
              📹 Training Recordings {recordings.length > 0 ? `(${recordings.length})` : ''}
            </Text>
            {recordings.length > 0 && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>{recordings.filter(r => !r.viewed).length} new</Text>
              </View>
            )}
          </View>
          {recordings.length === 0 ? (
            <Text style={styles.noRecordingsText}>No recordings submitted yet. They will appear here when {member?.name?.split(' ')[0] || 'the member'} submits one.</Text>
          ) : (
            recordings.map((rec, i) => {
              const ts = rec.submittedAt?.seconds ? new Date(rec.submittedAt.seconds * 1000) : null;
              return (
                <TouchableOpacity
                  key={rec.id}
                  style={[styles.recordingRow, i < recordings.length - 1 && { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}
                  onPress={() => rec.recordingUrl && Linking.openURL(rec.recordingUrl)}
                  activeOpacity={0.8}
                >
                  <View style={styles.recordingIcon}>
                    <Ionicons name="play-circle" size={28} color={COLORS.blue} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.recordingName}>{rec.trainingName || rec.trainingId}</Text>
                    <View style={styles.recordingMeta}>
                      <Text style={styles.recordingLevel}>{rec.level || 'Beginner'}</Text>
                      <Text style={styles.recordingDot}>·</Text>
                      <Text style={styles.recordingReps}>{rec.properReps || 0} proper reps</Text>
                    </View>
                    {ts && <Text style={styles.recordingDate}>{ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
                  </View>
                  {!rec.viewed && <View style={styles.unviewedDot} />}
                  <Ionicons name="open-outline" size={16} color={COLORS.gray} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

      </ScrollView>

      {/* ── MEDICAL CERT VIEWER MODAL ── */}
      <Modal visible={showCert} transparent animationType="slide" onRequestClose={() => setShowCert(false)}>
        <View style={styles.certModalOverlay}>
          <View style={styles.certModalCard}>
            <View style={styles.certModalHeader}>
              <Text style={styles.certModalTitle}>🏥 Medical Certificate</Text>
              <TouchableOpacity onPress={() => setShowCert(false)}>
                <Ionicons name="close" size={22} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.certMemberName}>{member?.name}</Text>
            <Text style={styles.certInjuryLabel}>Reported condition: <Text style={{ color: COLORS.white }}>{member?.injuries}</Text></Text>

            {(member?.medicalCert?.base64?.startsWith('data:image') || member?.medicalCert?.fileType?.startsWith('image/')) ? (
              <Image
                source={{ uri: member.medicalCert.base64 }}
                style={styles.certImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.certDocBox}>
                <Ionicons name="document-text-outline" size={48} color={COLORS.blue} />
                <Text style={styles.certFileName} numberOfLines={1}>{member?.medicalCert?.fileName}</Text>
                <Text style={{ fontSize: 11, color: COLORS.gray, textAlign: 'center', marginTop: 4 }}>
                  PDF certificates are stored on file.{' '}Image certificates can be previewed above.
                </Text>
              </View>
            )}

            {/* base64 certs are displayed above — no external URL to open */}
            <View style={[styles.openCertBtn, { backgroundColor: COLORS.green }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#000" />
              <Text style={[styles.openCertBtnText, { color: '#000' }]}>Certificate on File ✓</Text>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 14, paddingTop: 12 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  topBarTitle:   { flex: 1, fontSize: 17, fontWeight: '800', color: COLORS.white },
  topBarActions: { flexDirection: 'row', gap: 8 },
  topBarBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.blue + '44',
    justifyContent: 'center', alignItems: 'center',
  },

  // Fight card
  fightCard: {
    backgroundColor: COLORS.card, borderRadius: 20,
    borderWidth: 1, overflow: 'hidden',
  },
  fightAccent: { height: 4, width: '100%' },
  fightTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  fightAvatar: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 3, justifyContent: 'center', alignItems: 'center',
  },
  fightAvatarText: { fontSize: 24, fontWeight: '900' },
  fightInfo:  { flex: 1 },
  fightName:  { fontSize: 18, fontWeight: '900', color: COLORS.white, marginBottom: 6 },
  fightTags:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 50, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: '700' },
  statsStrip: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: COLORS.border },
  statCellVal:   { fontSize: 18, fontWeight: '900' },
  statCellLabel: { fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5 },

  // Card
  card: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.white, marginBottom: 16 },
  fieldLabel:   { fontSize: 11, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },

  // Day cards
  dayCard: {
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: 12, marginHorizontal: 4, width: 120, alignItems: 'center', gap: 4,
  },
  dayCardSelected: { borderColor: COLORS.blue, backgroundColor: COLORS.blue + '11' },
  dayCardEmoji:    { fontSize: 22 },
  dayCardTitle:    { fontSize: 11, fontWeight: '700', color: COLORS.white, textAlign: 'center' },
  dayCardSub:      { fontSize: 9, color: COLORS.gray, textAlign: 'center' },

  // Exercise preview
  exercisePreview: {
    backgroundColor: COLORS.blue + '11', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.blue + '33',
    padding: 12, marginBottom: 14,
  },
  exercisePreviewTitle: { fontSize: 10, color: COLORS.blue, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  exercisePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  exercisePill: {
    backgroundColor: COLORS.inputBg, borderRadius: 50,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.border,
  },
  exercisePillText: { fontSize: 10, color: COLORS.lightGray },

  // Stars
  starRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  star:       { fontSize: 32, color: COLORS.border },
  starActive: { color: COLORS.gold },

  // Text area
  textArea: {
    backgroundColor: COLORS.inputBg, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 14, color: COLORS.white, fontSize: 14,
    lineHeight: 22, minHeight: 110, textAlignVertical: 'top',
    marginBottom: 6,
  },
  charCount:  { fontSize: 10, color: COLORS.gray, textAlign: 'right', marginBottom: 14 },

  // Submit button
  submitBtn: {
    backgroundColor: COLORS.red, borderRadius: 50,
    height: 52, justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  // Past feedback
  fbItem: {
    backgroundColor: COLORS.inputBg, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
  },
  fbHeader:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  fbCoach:    { fontSize: 13, fontWeight: '800', color: COLORS.red },
  fbDayBadge: {
    backgroundColor: COLORS.blue + '18', borderRadius: 50,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 4, alignSelf: 'flex-start',
  },
  fbDayBadgeText: { fontSize: 9, color: COLORS.blue, fontWeight: '700' },
  fbRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fbStars:  { fontSize: 13, color: COLORS.gold },
  fbDelete: { padding: 4 },
  fbText:   { fontSize: 13, color: COLORS.lightGray, lineHeight: 20 },
  fbDate:   { fontSize: 9, color: COLORS.gray, marginTop: 6 },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, borderWidth: 1, borderColor: COLORS.border,
    maxHeight: '70%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle:  { fontSize: 18, fontWeight: '900', color: COLORS.white },
  modalSub:    { fontSize: 13, color: COLORS.gray },

  // Level options
  levelOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1.5, padding: 14,
  },
  levelOptionCurrent: { opacity: 0.4 },
  levelOptionName: { fontSize: 15, fontWeight: '800' },
  levelOptionSub:  { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  levelArrow: {
    borderRadius: 50, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },

  // Messaging
  msgBubbleWrap: { flexDirection: 'row', marginVertical: 3, paddingHorizontal: 4 },
  msgBubble: {
    maxWidth: '78%', borderRadius: 14, padding: 10,
    borderWidth: 1,
  },
  msgBubbleMe:   { backgroundColor: COLORS.blue + '22', borderColor: COLORS.blue + '44' },
  msgBubbleThem: { backgroundColor: COLORS.inputBg,     borderColor: COLORS.border },
  msgText:   { fontSize: 13, color: COLORS.white, lineHeight: 20 },
  msgMeta:   { fontSize: 9, color: COLORS.gray, marginTop: 4 },
  msgInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 10 },
  msgInput: {
    flex: 1, backgroundColor: COLORS.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 10,
    color: COLORS.white, fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.blue,
    justifyContent: 'center', alignItems: 'center',
  },

  // Medical cert
  certHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  certInjuryText:{ fontSize: 12, color: COLORS.red, fontWeight: '600', marginTop: 2 },
  viewCertBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.blue + '18', borderRadius: 10, borderWidth: 1, borderColor: COLORS.blue + '33', padding: 12 },
  viewCertBtnText:{ flex: 1, fontSize: 13, color: COLORS.blue, fontWeight: '700' },
  noCertBox:     { backgroundColor: COLORS.inputBg, borderRadius: 10, padding: 12 },
  noCertText:    { fontSize: 12, color: COLORS.gray, textAlign: 'center' },

  // Recordings
  recordingsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  noRecordingsText: { fontSize: 12, color: COLORS.gray, lineHeight: 18, textAlign: 'center', paddingVertical: 8 },
  recordingRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  recordingIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.blue + '18', justifyContent: 'center', alignItems: 'center' },
  recordingName: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  recordingMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordingLevel:{ fontSize: 10, color: COLORS.blue, fontWeight: '700', textTransform: 'uppercase' },
  recordingDot:  { fontSize: 10, color: COLORS.gray },
  recordingReps: { fontSize: 10, color: COLORS.gray },
  recordingDate: { fontSize: 10, color: COLORS.gray },
  unviewedDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red },
  newBadge:      { backgroundColor: COLORS.blue + '22', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.blue + '44' },
  newBadgeText:  { fontSize: 9, fontWeight: '800', color: COLORS.blue },

  // Cert modal
  certModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  certModalCard:    { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: COLORS.border, gap: 12, maxHeight: '80%' },
  certModalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  certModalTitle:   { fontSize: 18, fontWeight: '900', color: COLORS.white },
  certMemberName:   { fontSize: 15, fontWeight: '700', color: COLORS.white },
  certInjuryLabel:  { fontSize: 12, color: COLORS.gray },
  certImage:        { width: '100%', height: 280, borderRadius: 12, backgroundColor: COLORS.inputBg },
  certDocBox:       { alignItems: 'center', gap: 10, backgroundColor: COLORS.inputBg, borderRadius: 14, padding: 32 },
  certFileName:     { fontSize: 13, color: COLORS.blue, fontWeight: '600', textAlign: 'center' },
  openCertBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.blue, borderRadius: 12, height: 50 },
  openCertBtnText:  { color: COLORS.white, fontSize: 14, fontWeight: '800' },
});