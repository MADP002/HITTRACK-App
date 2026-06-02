import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  generateTrainingProgram, getLevelLabel, getLevelStars,
  getRequiredReps, getTypeInfo,
} from '../../lib/trainingPrograms';

const C = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  gold: '#F5C842', green: '#4ade80', inputBg: '#1E1E1E',
  lightGray: '#CCCCCC', blue: '#42a5f5', purple: '#c084fc',
};

const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];

export default function TrainingLabScreen() {
  const router = useRouter();

  const [trainings,     setTrainings]     = useState([]);
  const [currentLevel,  setCurrentLevel]  = useState('beginner');
  const [levelStars,    setLevelStars]    = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [userData,      setUserData]      = useState({});

  const loadData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      // Load user profile
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const uData    = userSnap.exists() ? userSnap.data() : {};
      setUserData(uData);

      // ── Injury check ──────────────────────────────────────────
      // If user has an injury and hasn't submitted a medical cert,
      // redirect them to the certificate screen
      if (uData.injuries && uData.injuries.length > 0 && !uData.medicalCert?.submitted) {
        router.replace('/(member)/medical-certificate');
        return;
      }

      // ── Load training program ─────────────────────────────────
      const workSnap = await getDoc(doc(db, 'workouts', user.uid));
      const workData = workSnap.exists() ? workSnap.data() : {};

      let program     = workData.trainingProgram || [];
      let level       = workData.trainingCurrentLevel || 'beginner';
      let stars       = workData.trainingLevelStars   || 1;

      // Generate if not yet created (user completed program builder before this update)
      if (!program || program.length === 0) {
        const generated = generateTrainingProgram(
          uData.stance     || 'Orthodox',
          uData.goal       || 'Learn Boxing',
          uData.experience || 'Beginner'
        );
        program = generated.trainings;
        level   = generated.currentLevel;
        stars   = generated.levelStars;
        await setDoc(doc(db, 'workouts', user.uid), {
          trainingProgram:         program,
          trainingCurrentLevel:    level,
          trainingLevelStars:      stars,
          trainingCurrentIndex:    0,
          trainingCompletedLevels: [],
          trainingGoal:            generated.goal,
          trainingStance:          generated.stance,
          trainingGeneratedAt:     generated.generatedAt,
        }, { merge: true });
      }

      setTrainings(program);
      setCurrentLevel(level);
      setLevelStars(stars);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  // ── Unlock logic ──────────────────────────────────────────────
  // A training is unlocked if it's the first one OR the previous
  // training is completed at the current level.
  const isUnlocked = (index) => {
    if (index === 0) return true;
    const prev = trainings[index - 1];
    return prev?.completedLevels?.includes(currentLevel) ?? false;
  };

  const isCompleted = (training) =>
    training.completedLevels?.includes(currentLevel) ?? false;

  const levelLabel   = getLevelLabel(currentLevel);
  const levelProgress = trainings.filter(t => isCompleted(t)).length;
  const progressPct   = trainings.length > 0 ? (levelProgress / trainings.length) * 100 : 0;

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>🥊 Training Lab</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.red} />}
      >
        {/* ── LEVEL STARS ── */}
        <View style={s.starsCard}>
          <View style={s.starsRow}>
            {[1, 2, 3].map(n => (
              <View key={n} style={s.starWrap}>
                <Ionicons
                  name={n <= levelStars ? 'star' : 'star-outline'}
                  size={38}
                  color={n <= levelStars ? C.gold : C.border}
                />
              </View>
            ))}
          </View>
          <Text style={s.levelLabel}>{levelLabel} Level</Text>
          <Text style={s.levelSub}>
            {userData.goal || 'Learn Boxing'} · {userData.stance || 'Orthodox'}
          </Text>

          {/* Progress bar */}
          <View style={s.progressWrap}>
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={s.progressText}>{levelProgress}/{trainings.length} completed</Text>
          </View>

          {/* Level up message */}
          {progressPct === 100 && LEVEL_ORDER.indexOf(currentLevel) < 2 && (
            <View style={s.levelUpBanner}>
              <Text style={s.levelUpText}>🎉 Level complete! Next level unlocked.</Text>
            </View>
          )}
        </View>

        {/* ── TRAINING LIST ── */}
        <Text style={s.sectionTitle}>Your Program</Text>
        <View style={s.trainingList}>
          {trainings.map((training, index) => {
            const unlocked  = isUnlocked(index);
            const completed = isCompleted(training);
            const typeInfo  = getTypeInfo(training.type);
            const reps      = getRequiredReps(training, currentLevel);

            return (
              <TouchableOpacity
                key={training.id}
                style={[
                  s.trainingRow,
                  completed && s.trainingRowDone,
                  !unlocked && s.trainingRowLocked,
                  index < trainings.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                ]}
                onPress={() => {
                  if (!unlocked) return;
                  router.push({
                    pathname: '/(member)/training-detail',
                    params: { trainingId: training.id, level: currentLevel },
                  });
                }}
                activeOpacity={unlocked ? 0.8 : 1}
              >
                {/* Order number */}
                <View style={[s.orderBadge, {
                  backgroundColor: completed ? C.green + '22' : unlocked ? typeInfo.color + '22' : C.border,
                  borderColor:     completed ? C.green + '55' : unlocked ? typeInfo.color + '55' : C.border,
                }]}>
                  {completed
                    ? <Ionicons name="checkmark" size={16} color={C.green} />
                    : unlocked
                      ? <Text style={[s.orderNum, { color: typeInfo.color }]}>{index + 1}</Text>
                      : <Ionicons name="lock-closed" size={14} color={C.gray} />
                  }
                </View>

                {/* Info */}
                <View style={s.trainingInfo}>
                  <View style={s.trainingNameRow}>
                    <Text style={s.trainingIcon}>{training.icon}</Text>
                    <Text style={[
                      s.trainingName,
                      !unlocked && { color: C.gray },
                      completed && { color: C.green },
                    ]} numberOfLines={1}>
                      {training.name}
                    </Text>
                    <View style={[s.typePill, { backgroundColor: typeInfo.color + '18', borderColor: typeInfo.color + '33' }]}>
                      <Text style={[s.typePillText, { color: typeInfo.color }]}>{typeInfo.label}</Text>
                    </View>
                  </View>
                  <Text style={s.trainingReps}>
                    {completed
                      ? `✓ Completed · ${reps} ${training.type === 'strength' ? 'reps' : 'proper reps'}`
                      : unlocked
                        ? `${reps} proper ${training.type === 'strength' ? 'reps' : training.type === 'defense' ? 'reps' : 'reps'} required`
                        : 'Complete previous training to unlock'
                    }
                  </Text>
                </View>

                {/* Chevron (only for unlocked) */}
                {unlocked && !completed && (
                  <Ionicons name="chevron-forward" size={16} color={C.gray} />
                )}
                {completed && (
                  <View style={s.completedBadge}>
                    <Text style={s.completedBadgeText}>Done</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Empty state */}
        {trainings.length === 0 && (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 56 }}>🥊</Text>
            <Text style={s.emptyTitle}>No Program Found</Text>
            <Text style={s.emptySub}>Please complete the program builder first to generate your training program.</Text>
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
  scroll: { paddingHorizontal: 16, paddingBottom: 50, gap: 16, paddingTop: 14 },

  // Stars card
  starsCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.gold + '33', padding: 24, alignItems: 'center', gap: 10 },
  starsRow:  { flexDirection: 'row', gap: 12 },
  starWrap:  { alignItems: 'center' },
  levelLabel:{ fontSize: 22, fontWeight: '900', color: C.white },
  levelSub:  { fontSize: 12, color: C.gray },

  progressWrap:   { width: '100%', gap: 6 },
  progressBarBg:  { height: 8, backgroundColor: C.border, borderRadius: 50, overflow: 'hidden', width: '100%' },
  progressBarFill:{ height: '100%', backgroundColor: C.red, borderRadius: 50 },
  progressText:   { fontSize: 11, color: C.gray, textAlign: 'center' },

  levelUpBanner: { backgroundColor: C.gold + '18', borderRadius: 10, borderWidth: 1, borderColor: C.gold + '44', paddingHorizontal: 16, paddingVertical: 8 },
  levelUpText:   { fontSize: 13, color: C.gold, fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.white },

  // Training list
  trainingList:      { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  trainingRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  trainingRowDone:   { backgroundColor: C.green + '08' },
  trainingRowLocked: { opacity: 0.5 },

  orderBadge: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  orderNum:   { fontSize: 14, fontWeight: '900' },

  trainingInfo:   { flex: 1, gap: 4 },
  trainingNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  trainingIcon:   { fontSize: 16 },
  trainingName:   { fontSize: 14, fontWeight: '700', color: C.white, flex: 1 },
  typePill:       { borderRadius: 50, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  typePillText:   { fontSize: 9, fontWeight: '700' },
  trainingReps:   { fontSize: 11, color: C.gray, lineHeight: 16 },

  completedBadge:    { backgroundColor: C.green + '22', borderRadius: 50, borderWidth: 1, borderColor: C.green + '44', paddingHorizontal: 10, paddingVertical: 3 },
  completedBadgeText:{ fontSize: 9, fontWeight: '800', color: C.green },

  emptyBox:  { alignItems: 'center', gap: 12, paddingTop: 40 },
  emptyTitle:{ fontSize: 18, fontWeight: '800', color: C.white },
  emptySub:  { fontSize: 13, color: C.gray, textAlign: 'center', paddingHorizontal: 20 },
});