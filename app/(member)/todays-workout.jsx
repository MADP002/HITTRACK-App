import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../firebase';
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { buildSchedule, exerciseName, isRichExercise } from '../../lib/scheduleBuilder';
import { computeDifficulty, computeDifficultyBreakdown, evaluateAdaptations } from '../../lib/adaptiveEngine';
import { computeTrainingStats, computeWeeklyHistory, computeMissedDays } from '../../lib/trainingStats';
import { canBook, computeMembershipState } from '../../lib/membership';
import { C, glow } from '../../lib/theme';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Decision accent by severity — aligned with web Home.jsx (celebrate=gold, positive=green,
// warning=red, info=blue) so the same rule looks the same on web and mobile.
const SEV_COLOR = { celebrate: C.gold, positive: C.green, warning: C.red, info: C.blue };
const sevColor = (s) => SEV_COLOR[s] || C.blue;

// Plain-language note shown on rules the coach actually APPLIED to today's plan
// (mirrors web RULE_ACTION). Other rules are advisory only.
const RULE_ACTION = {
  RESET_DAY:     'Today swapped to a light Reset Day',
  CHAMPION_MODE: 'Champion bonus exercise added to today',
};

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const relTime = (ms) => {
  if (!ms) return '';
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(ms).toLocaleDateString();
};

export default function TodaysWorkoutScreen() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [userData, setUserData] = useState(null);
  const [workout, setWorkout]   = useState(null);
  const [checks, setChecks]     = useState([]);
  const [trainedDates, setTrainedDates] = useState([]);
  const [adaptive, setAdaptive] = useState({ difficulty: 3, decisions: [], streak: 0, weeklyPct: 0, totalWorkouts: 0, breakdown: null });
  const [saving, setSaving]     = useState(false);
  const [adaptiveOpen, setAdaptiveOpen]   = useState(false);  // explainability modal
  const [adaptiveLog, setAdaptiveLog]     = useState([]);      // last 10 from Firestore
  const [adaptiveClearedAt, setAdaptiveClearedAt] = useState(0); // hide timeline before this ms (non-destructive)

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
    const breakdown = computeDifficultyBreakdown({ experience, streak, weeklyPct, totalWorkouts });
    setAdaptive({ difficulty, decisions, streak, weeklyPct, totalWorkouts, breakdown });
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

      // Adaptation timeline — last 10 logged decisions (where-only query, sorted
      // client-side to avoid a composite index, same as web).
      try {
        const logSnap = await getDocs(query(collection(db, 'adaptiveDecisions'), where('userId', '==', user.uid)));
        const logs = [];
        logSnap.forEach(d => logs.push({ id: d.id, ...d.data() }));
        logs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAdaptiveLog(logs.slice(0, 10));
        const clearedRaw = await AsyncStorage.getItem('hittrack_adaptive_cleared_' + user.uid);
        setAdaptiveClearedAt(Number(clearedRaw) || 0);
      } catch (e) { console.warn('adaptive log (non-fatal):', e.message); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [computeAdaptive, todayStr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Hide timeline entries before "now" — non-destructive (we never delete the
  // adaptiveDecisions docs, just remember a per-user cutoff). Mirrors web.
  async function clearAdaptiveTimeline() {
    const user = auth.currentUser;
    if (!user) return;
    const now = Date.now();
    try { await AsyncStorage.setItem('hittrack_adaptive_cleared_' + user.uid, String(now)); } catch {}
    setAdaptiveClearedAt(now);
  }

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

        {/* ── ADAPTIVE COACH ── (tap anywhere to open the reasoning modal) */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => setAdaptiveOpen(true)} style={s.adaptiveCard}>
          <View style={s.adaptiveTop}>
            <View style={{ flex: 1 }}>
              <View style={s.adaptiveTitleRow}>
                <Text style={s.adaptiveTitle}>🧠 Adaptive Coach</Text>
                <View style={s.activePill}>
                  <View style={s.activeDot} />
                  <Text style={s.activeText}>ACTIVE</Text>
                </View>
              </View>
              <Text style={s.adaptiveSub}>Rule-based · {adaptive.decisions.length} decision{adaptive.decisions.length === 1 ? '' : 's'} this session</Text>
            </View>
            <View style={s.diffBox}>
              <Text style={s.diffVal}>{adaptive.difficulty}</Text>
              <Text style={s.diffLabel}>DIFFICULTY</Text>
            </View>
          </View>
          {adaptive.decisions.length === 0 ? (
            <Text style={s.adaptiveEmpty}>Engine analyzing your habits — keep training to unlock insights.</Text>
          ) : (
            <View style={{ gap: 8, marginTop: 4 }}>
              {adaptive.decisions.slice(0, 3).map((d, i) => {
                const col = sevColor(d.severity);
                return (
                  <View key={i} style={[s.decision, { borderColor: col + '33', backgroundColor: col + '0d' }]}>
                    <Text style={[s.decisionTitle, { color: col }]}>{d.title}</Text>
                    <Text style={s.decisionMsg}>{d.message}</Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={s.whyBtn}>
            <Text style={s.whyText}>Why these decisions?  →</Text>
          </View>
        </TouchableOpacity>

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

      {/* ── ADAPTIVE COACH — REASONING modal (mirrors web explainability view) ── */}
      <Modal visible={adaptiveOpen} transparent animationType="slide" onRequestClose={() => setAdaptiveOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {/* accent stripe */}
            <View style={s.modalStripe} />

            {/* header */}
            <View style={s.modalHeader}>
              <View style={s.modalIcon}><Text style={{ fontSize: 18 }}>🧠</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>ADAPTIVE COACH — REASONING</Text>
                <Text style={s.modalKicker}>Rule-based decisions · Fully auditable</Text>
              </View>
              <TouchableOpacity onPress={() => setAdaptiveOpen(false)} style={s.modalClose}>
                <Ionicons name="close" size={18} color={C.gray} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
              {/* Current State */}
              <Text style={s.sectionLabel}>CURRENT STATE</Text>
              <View style={s.stateGrid}>
                {[
                  { label: 'STREAK', val: `${adaptive.streak}d`, color: adaptive.streak >= 14 ? C.gold : C.blue },
                  { label: 'WEEKLY', val: `${adaptive.weeklyPct}%`, color: adaptive.weeklyPct >= 80 ? C.green : adaptive.weeklyPct >= 40 ? C.gold : C.red },
                  { label: 'DIFFICULTY', val: adaptive.difficulty, color: C.purple },
                  { label: 'TOTAL', val: adaptive.totalWorkouts, color: C.blue },
                ].map((t, i) => (
                  <View key={i} style={[s.stateTile, { backgroundColor: t.color + '10', borderColor: t.color + '25' }]}>
                    <Text style={[s.stateVal, { color: t.color }]}>{t.val}</Text>
                    <Text style={s.stateLabel}>{t.label}</Text>
                  </View>
                ))}
              </View>

              {/* Difficulty Breakdown */}
              {adaptive.breakdown && (
                <>
                  <Text style={s.sectionLabel}>DIFFICULTY BREAKDOWN</Text>
                  <View style={s.breakdownRow}>
                    {[
                      { lbl: `${adaptive.breakdown.level} base`, val: adaptive.breakdown.levelBase.toFixed(1), c: C.purple },
                      { lbl: 'streak',  val: `+${adaptive.breakdown.streakBonus.toFixed(1)}`,  c: C.blue },
                      { lbl: 'weekly',  val: `+${adaptive.breakdown.weeklyBonus.toFixed(1)}`,  c: C.green },
                      { lbl: 'veteran', val: `+${adaptive.breakdown.veteranBonus.toFixed(1)}`, c: C.gold },
                    ].map((p, i) => (
                      <View key={i} style={[s.bdTile, { backgroundColor: p.c + '12', borderColor: p.c + '30' }]}>
                        <Text style={[s.bdVal, { color: p.c }]}>{p.val}</Text>
                        <Text style={s.bdLbl}>{p.lbl}</Text>
                      </View>
                    ))}
                    <Text style={s.bdEq}>=</Text>
                    <View style={[s.bdTile, s.bdTotal]}>
                      <Text style={[s.bdVal, { color: C.purple }]}>{adaptive.breakdown.total}</Text>
                      <Text style={[s.bdLbl, { color: C.purple }]}>/ 10</Text>
                    </View>
                  </View>
                  <Text style={s.bdNote}>Higher level, longer streaks, better weekly completion, and total workouts each push the load up.</Text>
                </>
              )}

              {/* Rules Fired This Session */}
              <Text style={s.sectionLabel}>RULES FIRED THIS SESSION ({adaptive.decisions.length})</Text>
              {adaptive.decisions.length === 0 ? (
                <View style={s.emptyBox}><Text style={s.emptyText}>No rules fired — engine is observing.</Text></View>
              ) : (
                <View style={{ gap: 8 }}>
                  {adaptive.decisions.map((d, i) => {
                    const col = sevColor(d.severity);
                    return (
                      <View key={i} style={[s.ruleCard, { backgroundColor: col + '10', borderColor: col + '25' }]}>
                        <View style={s.ruleTop}>
                          <View style={[s.ruleBadge, { backgroundColor: col + '22' }]}>
                            <Text style={[s.ruleBadgeText, { color: col }]}>{d.rule}</Text>
                          </View>
                          <Text style={[s.ruleTitle, { color: col }]} numberOfLines={2}>{d.title}</Text>
                        </View>
                        <Text style={s.ruleMsg}>{d.message}</Text>
                        {RULE_ACTION[d.rule] && (
                          <View style={s.appliedChip}>
                            <Text style={s.appliedText}>⚡ APPLIED · {RULE_ACTION[d.rule]}</Text>
                          </View>
                        )}
                        {d.dataUsed && (
                          <View style={s.dataBox}>
                            <Text style={s.dataText}><Text style={{ color: col, fontWeight: '700' }}>data: </Text>{JSON.stringify(d.dataUsed)}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Adaptation Timeline */}
              {adaptiveLog.length > 0 && (() => {
                const visibleLog = adaptiveLog.filter(l => ((l.createdAt?.seconds || 0) * 1000) > adaptiveClearedAt);
                const runs = [];
                for (const log of visibleLog) {
                  const last = runs[runs.length - 1];
                  if (last && last.rule === log.rule && last.title === log.title) last.count++;
                  else runs.push({ ...log, count: 1 });
                }
                return (
                  <>
                    <View style={s.timelineHead}>
                      <Text style={s.sectionLabel}>ADAPTATION TIMELINE</Text>
                      <TouchableOpacity onPress={clearAdaptiveTimeline} style={s.clearBtn}>
                        <Text style={s.clearText}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={s.timelineSub}>Every change your coach made to your plan, automatically — newest first.</Text>
                    {runs.length === 0 ? (
                      <View style={s.emptyBox}><Text style={s.emptyText}>Timeline cleared — new adaptations will appear here.</Text></View>
                    ) : (
                      <View style={{ gap: 5 }}>
                        {runs.map((log) => {
                          const col = sevColor(log.severity);
                          const ms = (log.createdAt?.seconds || 0) * 1000;
                          return (
                            <View key={log.id} style={[s.tlRow, { borderLeftColor: col }]}>
                              <View style={[s.tlDot, { backgroundColor: col }]} />
                              <Text style={s.tlTitle} numberOfLines={1}>{log.title}</Text>
                              {log.count > 1 && <Text style={[s.tlCount, { color: col }]}>×{log.count}</Text>}
                              <Text style={s.tlTime}>{relTime(ms)}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                );
              })()}

              {/* Footer */}
              <View style={s.footerNote}>
                <Text style={s.footerText}>
                  <Text style={{ color: C.purple, fontWeight: '800' }}>How it works: </Text>
                  The engine evaluates your performance against 7 explicit rules every session. Every decision is logged with the data that triggered it — making the system explainable and auditable.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  adaptiveTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activePill:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  activeText:   { fontSize: 8, fontWeight: '800', color: C.green, letterSpacing: 1 },
  whyBtn:       { alignSelf: 'flex-start', marginTop: 6, borderWidth: 1, borderColor: C.purple + '59', borderRadius: 50, paddingHorizontal: 14, paddingVertical: 7 },
  whyText:      { fontSize: 11, fontWeight: '800', color: C.purple, letterSpacing: 0.3 },

  // Reasoning modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: C.purple + '4d', maxHeight: '90%', overflow: 'hidden' },
  modalStripe:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.purple, zIndex: 2 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.purple + '26' },
  modalIcon:    { width: 40, height: 40, borderRadius: 11, backgroundColor: C.purple + '26', justifyContent: 'center', alignItems: 'center' },
  modalTitle:   { fontSize: 15, fontWeight: '900', color: C.white, letterSpacing: 0.4 },
  modalKicker:  { fontSize: 9, color: C.purple, letterSpacing: 1, fontWeight: '700', marginTop: 3 },
  modalClose:   { width: 32, height: 32, borderRadius: 9, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  modalBody:    { padding: 20, paddingBottom: 40, gap: 10 },
  sectionLabel: { fontSize: 9, fontWeight: '800', color: C.purple, letterSpacing: 1.4, marginTop: 8 },

  stateGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stateTile:    { flexGrow: 1, flexBasis: '22%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10 },
  stateVal:     { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  stateLabel:   { fontSize: 7, color: C.gray, fontWeight: '800', letterSpacing: 1, marginTop: 3 },

  breakdownRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, backgroundColor: C.purple + '0d', borderWidth: 1, borderColor: C.purple + '2e', borderRadius: 10, padding: 12 },
  bdTile:       { alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, minWidth: 58 },
  bdVal:        { fontSize: 16, fontWeight: '900', lineHeight: 18 },
  bdLbl:        { fontSize: 7, color: C.gray, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 3 },
  bdEq:         { fontSize: 16, color: C.gray, fontWeight: '800' },
  bdTotal:      { backgroundColor: C.purple + '2e', borderColor: C.purple + '73' },
  bdNote:       { fontSize: 9, color: C.gray, fontStyle: 'italic', marginTop: 2 },

  emptyBox:     { padding: 18, alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  emptyText:    { fontSize: 11, color: C.gray },

  ruleCard:     { borderWidth: 1, borderRadius: 11, padding: 12 },
  ruleTop:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' },
  ruleBadge:    { borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  ruleBadgeText:{ fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  ruleTitle:    { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  ruleMsg:      { fontSize: 11, color: C.lightGray, lineHeight: 17, marginBottom: 6 },
  appliedChip:  { alignSelf: 'flex-start', backgroundColor: C.green + '1a', borderWidth: 1, borderColor: C.green + '4d', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  appliedText:  { fontSize: 9, fontWeight: '800', color: C.green, letterSpacing: 0.3 },
  dataBox:      { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6 },
  dataText:     { fontSize: 9, color: C.gray, fontFamily: 'monospace' },

  timelineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearBtn:     { borderWidth: 1, borderColor: C.border, borderRadius: 50, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  clearText:    { fontSize: 9, fontWeight: '700', color: C.gray, letterSpacing: 0.4 },
  timelineSub:  { fontSize: 10, color: C.gray, lineHeight: 15 },
  tlRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: C.inputBg, borderRadius: 8, borderLeftWidth: 2 },
  tlDot:        { width: 7, height: 7, borderRadius: 4 },
  tlTitle:      { flex: 1, fontSize: 11, color: C.lightGray },
  tlCount:      { fontSize: 9, fontWeight: '800' },
  tlTime:       { fontSize: 9, color: C.gray },

  footerNote:   { backgroundColor: C.purple + '0f', borderWidth: 1, borderColor: C.purple + '33', borderRadius: 10, padding: 12, marginTop: 8 },
  footerText:   { fontSize: 10, color: C.lightGray, lineHeight: 16 },

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
