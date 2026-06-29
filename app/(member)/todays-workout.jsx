import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../firebase';
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { buildSchedule, exerciseName, isRichExercise } from '../../lib/scheduleBuilder';
import { computeDifficulty, evaluateAdaptations } from '../../lib/adaptiveEngine';
import { computeTrainingStats, computeWeeklyHistory, computeMissedDays } from '../../lib/trainingStats';
import { canBook, computeMembershipState } from '../../lib/membership';
import { C, glow } from '../../lib/theme';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Decision card accent by severity (matches the engine's severity values).
const SEV_COLOR = { positive: C.green, warning: C.gold, celebrate: C.purple, info: C.blue };

export default function TodaysWorkoutScreen() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [userData, setUserData] = useState(null);
  const [workout, setWorkout]   = useState(null);
  const [checks, setChecks]     = useState([]);
  const [trainedDates, setTrainedDates] = useState([]);
  const [adaptive, setAdaptive] = useState({ difficulty: 3, decisions: [], streak: 0, weeklyPct: 0, totalWorkouts: 0 });
  const [saving, setSaving]     = useState(false);

  const todayStr = ymd(new Date());

  const computeAdaptive = useCallback((u, dates) => {
    const dpw = u?.daysPerWeek || 3;
    const { totalWorkouts, streak, weeklyPct } = computeTrainingStats(dates, dpw);
    const experience = u?.experience || u?.currentLevel || 'Beginner';
    const state = {
      experience, goal: u?.goal, streak, weeklyPct, totalWorkouts,
      weeklyHistory: computeWeeklyHistory(dates, dpw),
      missedDaysInARow: computeMissedDays(dates),
    };
    const difficulty = computeDifficulty(state);
    const decisions = evaluateAdaptations(state);
    setAdaptive({ difficulty, decisions, streak, weeklyPct, totalWorkouts });
    persistDecisions(u, decisions, difficulty);
  }, []);

  async function persistDecisions(u, decisions, difficulty) {
    const user = auth.currentUser;
    if (!user || !decisions.length) return;
    try {
      const key = 'hittrack_last_adaptive_' + user.uid;
      const sig = todayStr + ':' + decisions.map(d => d.rule).sort().join('|');
      if ((await AsyncStorage.getItem(key)) === sig) return;   // throttle: once/day
      await AsyncStorage.setItem(key, sig);
      for (const d of decisions) {
        await addDoc(collection(db, 'adaptiveDecisions'), {
          userId: user.uid, userName: u?.name || 'Member',
          rule: d.rule, severity: d.severity, title: d.title, message: d.message,
          dataUsed: d.dataUsed || null, difficulty, createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.warn('adaptive persist (non-fatal):', e.message); }
  }

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) { setLoading(false); return; }
    try {
      const uSnap = await getDoc(doc(db, 'users', user.uid));
      const u = uSnap.exists() ? uSnap.data() : {};
      setUserData(u);

      const schedule = buildSchedule(u, new Date());
      const w = schedule[0]?.workout || null;
      setWorkout(w);
      const exCount = w?.exercises?.length || 0;

      const wkSnap = await getDoc(doc(db, 'workouts', user.uid));
      const wk = wkSnap.exists() ? wkSnap.data() : {};
      const saved = (wk.mobileTodayChecks && wk.mobileTodayChecks[todayStr]) || [];
      setChecks(exCount ? Array.from({ length: exCount }, (_, i) => !!saved[i]) : []);

      const tsSnap = await getDocs(query(collection(db, 'trainingSessions'), where('uid', '==', user.uid)));
      const set = new Set();
      tsSnap.forEach(d => {
        const data = d.data();
        if (data.date) set.add(data.date);
        const ts = data.completedAt;
        const ms = ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : null);
        if (ms) set.add(ymd(new Date(ms)));
      });
      const dates = [...set];
      setTrainedDates(dates);
      computeAdaptive(u, dates);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [computeAdaptive, todayStr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const membershipState = computeMembershipState(userData?.membership);
  const blocked = !!userData && !canBook(userData.membership);
  const exercises = workout?.exercises || [];
  const doneCount = checks.filter(Boolean).length;
  const allDone = exercises.length > 0 && doneCount === exercises.length;

  async function logTodaySession(user, u, dates) {
    if (dates.includes(todayStr)) return dates;
    try {
      await setDoc(doc(db, 'trainingSessions', `${user.uid}_${todayStr}_todaysworkout`), {
        uid: user.uid, memberName: u?.name || 'Member', source: 'todays_workout',
        date: todayStr, completedAt: serverTimestamp(),
      });
    } catch (e) { console.warn('today session log (non-fatal):', e.message); }
    return [...new Set([...dates, todayStr])];
  }

  const toggle = async (i) => {
    if (blocked) { Alert.alert('Membership Inactive', 'Your membership is expired or paused. Renew with the gym to track workouts.'); return; }
    const user = auth.currentUser;
    if (!user || exercises.length === 0) return;
    const next = [...checks];
    // Sequential: can't check an exercise until earlier ones are done; can only
    // uncheck the last checked one.
    if (!next[i]) { for (let p = 0; p < i; p++) if (!next[p]) return; }
    else { for (let n = i + 1; n < next.length; n++) if (next[n]) return; }
    next[i] = !next[i];
    setChecks(next);
    setSaving(true);
    try {
      await setDoc(doc(db, 'workouts', user.uid), { mobileTodayChecks: { [todayStr]: next } }, { merge: true });
      if (next.length > 0 && next.every(Boolean)) {
        const newDates = await logTodaySession(user, userData, trainedDates);
        setTrainedDates(newDates);
        computeAdaptive(userData, newDates);  // adaptive coach "takes place" on completion
      }
    } catch (e) { console.warn('save checks (non-fatal):', e.message); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/(member)/home')}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>📋 Today's Workout</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ADAPTIVE COACH ── */}
        <View style={s.adaptiveCard}>
          <View style={s.adaptiveTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.adaptiveTitle}>🧠 Adaptive Coach</Text>
              <Text style={s.adaptiveSub}>Rule-based · {adaptive.decisions.length} insight{adaptive.decisions.length === 1 ? '' : 's'}</Text>
            </View>
            <View style={s.diffBox}>
              <Text style={s.diffVal}>{adaptive.difficulty}</Text>
              <Text style={s.diffLabel}>DIFFICULTY</Text>
            </View>
          </View>
          {adaptive.decisions.length === 0 ? (
            <Text style={s.adaptiveEmpty}>Keep training — the engine is learning your habits.</Text>
          ) : (
            <View style={{ gap: 8, marginTop: 4 }}>
              {adaptive.decisions.map((d, i) => {
                const col = SEV_COLOR[d.severity] || C.blue;
                return (
                  <View key={i} style={[s.decision, { borderColor: col + '33', backgroundColor: col + '0d' }]}>
                    <Text style={[s.decisionTitle, { color: col }]}>{d.title}</Text>
                    <Text style={s.decisionMsg}>{d.message}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── TODAY'S WORKOUT ── */}
        {!workout ? (
          <View style={s.restCard}>
            <Text style={{ fontSize: 44 }}>🧘</Text>
            <Text style={s.restTitle}>Rest Day</Text>
            <Text style={s.restBody}>No workout scheduled for today. Recover well — or hit the Training Lab for extra reps.</Text>
          </View>
        ) : (
          <View style={s.workoutCard}>
            <Text style={s.workoutTitle}>{workout.title || 'Workout'}</Text>
            <Text style={s.workoutFocus}>📋 Today's focus: <Text style={{ color: C.gold, fontWeight: '800' }}>{workout.subtitle || workout.goal || 'Training'}</Text></Text>
            <Text style={s.workoutSub}>From your program builder{workout.duration ? ` · ${workout.duration}` : ''}</Text>

            {/* progress */}
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${exercises.length ? (doneCount / exercises.length) * 100 : 0}%`, backgroundColor: allDone ? C.green : C.red }]} />
            </View>
            <Text style={[s.progressText, allDone && { color: C.green }]}>
              {allDone ? '✅ Workout complete!' : `${doneCount}/${exercises.length} done`}
            </Text>

            {blocked && (
              <View style={s.lockNote}>
                <Ionicons name="lock-closed" size={14} color={C.gold} />
                <Text style={s.lockText}>{membershipState === 'paused' ? 'Membership paused' : 'Membership expired'} — renew to track.</Text>
              </View>
            )}

            {exercises.map((ex, i) => {
              const checked = !!checks[i];
              const locked = blocked || (i > 0 && !checks.slice(0, i).every(Boolean));
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.exRow, checked && s.exRowDone, locked && !checked && { opacity: 0.45 }]}
                  onPress={() => toggle(i)}
                  activeOpacity={locked && !checked ? 1 : 0.7}
                >
                  <View style={[s.checkbox, checked && { backgroundColor: C.green, borderColor: C.green }]}>
                    {checked && <Ionicons name="checkmark" size={15} color="#062" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.exName, checked && { color: C.green, textDecorationLine: 'line-through' }]} numberOfLines={1}>
                      {exerciseName(ex)}
                    </Text>
                    {isRichExercise(ex) && !!ex.focus && <Text style={s.exFocus} numberOfLines={1}>{ex.focus}</Text>}
                  </View>
                  <Text style={s.exHint}>{checked ? 'done' : locked ? 'locked' : 'tap'}</Text>
                </TouchableOpacity>
              );
            })}
            {saving && <Text style={s.savingText}>Saving…</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: C.white },
  scroll: { paddingHorizontal: 16, paddingBottom: 50, gap: 14, paddingTop: 14 },

  // Adaptive coach
  adaptiveCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.purple + '40', padding: 16, gap: 4, ...glow(C.purple) },
  adaptiveTop:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adaptiveTitle:{ fontSize: 15, fontWeight: '900', color: C.white },
  adaptiveSub:  { fontSize: 11, color: C.gray, marginTop: 2 },
  diffBox:      { alignItems: 'center', backgroundColor: C.purple + '18', borderWidth: 1, borderColor: C.purple + '40', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  diffVal:      { fontSize: 22, fontWeight: '900', color: C.purple },
  diffLabel:    { fontSize: 7, fontWeight: '800', color: C.gray, letterSpacing: 1 },
  adaptiveEmpty:{ fontSize: 12, color: C.gray, marginTop: 6, lineHeight: 18 },
  decision:     { borderWidth: 1, borderRadius: 12, padding: 12 },
  decisionTitle:{ fontSize: 12, fontWeight: '800', marginBottom: 3 },
  decisionMsg:  { fontSize: 11, color: C.lightGray, lineHeight: 17 },

  // Rest day
  restCard:  { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 28, alignItems: 'center', gap: 10 },
  restTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  restBody:  { fontSize: 13, color: C.gray, textAlign: 'center', lineHeight: 20 },

  // Workout
  workoutCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 },
  workoutTitle:{ fontSize: 20, fontWeight: '900', color: C.white },
  workoutFocus:{ fontSize: 12, color: C.lightGray, fontWeight: '600', marginTop: -2 },
  workoutSub:  { fontSize: 11, color: C.gray },
  progressBg:  { height: 8, backgroundColor: C.border, borderRadius: 50, overflow: 'hidden', marginTop: 4 },
  progressFill:{ height: '100%', borderRadius: 50 },
  progressText:{ fontSize: 11, color: C.gray, fontWeight: '600' },
  lockNote:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.gold + '12', borderWidth: 1, borderColor: C.gold + '33', borderRadius: 10, padding: 10 },
  lockText:    { fontSize: 11, color: C.gold, fontWeight: '600', flex: 1 },

  exRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 },
  exRowDone: { backgroundColor: C.green + '0d', borderColor: C.green + '33' },
  checkbox:  { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.gray, justifyContent: 'center', alignItems: 'center' },
  exName:    { fontSize: 13, fontWeight: '700', color: C.white },
  exFocus:   { fontSize: 10, color: C.gray, marginTop: 2 },
  exHint:    { fontSize: 10, color: C.gray, fontWeight: '600' },
  savingText:{ fontSize: 10, color: C.gray, textAlign: 'center', marginTop: 2 },
});
