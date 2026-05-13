import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842',
};

const LEVEL_COLORS = {
  Beginner: '#fb923c', Intermediate: '#F5C842',
  Advanced: '#4ade80', Expert: '#42a5f5', Elite: '#c084fc',
};
const LEVEL_ICONS = {
  Beginner: '🥊', Intermediate: '⚡', Advanced: '🔥', Expert: '💎', Elite: '👑',
};
const LEVEL_BONUS = {
  Beginner: 0, Intermediate: 150, Advanced: 350, Expert: 500, Elite: 750,
};
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Elite'];
const WORKOUTS_PER_LEVEL = 25;

// ── HELPERS ───────────────────────────────────────────────────────────────────
const calcBMI = (h, w) => {
  if (!h || !w || isNaN(h) || isNaN(w)) return null;
  return (parseFloat(w) / ((parseFloat(h) / 100) ** 2)).toFixed(1);
};
const bmiLabel = (b) => {
  if (!b) return '—';
  return b < 18.5 ? 'Underweight' : b < 25 ? 'Normal' : b < 30 ? 'Overweight' : 'Obese';
};
const bmiColor = (b) => {
  if (!b) return COLORS.gray;
  return b < 18.5 ? '#42a5f5' : b < 25 ? COLORS.green : b < 30 ? COLORS.gold : COLORS.red;
};

// ── SCORE BAR ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, max, color, delay = 0 }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(anim, {
        toValue: Math.min(value / Math.max(max, 1), 1),
        duration: 1000,
        useNativeDriver: false,
      }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <View style={styles.barRow}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={[styles.barValue, { color }]}>{value} pts</Text>
      </View>
      <View style={styles.barBg}>
        <Animated.View style={[styles.barFill, {
          backgroundColor: color,
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>
    </View>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter();

  const [userData,  setUserData]  = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [draft,     setDraft]     = useState({});

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      getDoc(doc(db, 'stats', user.uid)),
    ]).then(([userSnap, statsSnap]) => {
      if (userSnap.exists()) setUserData(userSnap.data());
      if (statsSnap.exists()) setStatsData(statsSnap.data());
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalWorkouts = statsData?.totalWorkouts ?? userData?.totalWorkouts ?? 0;
  const streak        = statsData?.streak        ?? userData?.streak        ?? 0;
  const weeklyPct     = statsData?.weeklyPct     ?? userData?.weeklyPct     ?? 0;
  const currentLevel  = statsData?.currentLevel  ?? userData?.experience    ?? 'Beginner';
  const lc            = LEVEL_COLORS[currentLevel] || COLORS.gold;
  const li            = LEVEL_ICONS[currentLevel]  || '🥊';
  const score         = (totalWorkouts * 10) + (streak * 5) +
                        (LEVEL_BONUS[currentLevel] || 0) + Math.round(weeklyPct * 1.5);

  // BMI — live from draft when editing, otherwise from saved data
  const displayHeight = editing ? draft.height  : userData?.height;
  const displayWeight = editing ? draft.weight  : userData?.weight;
  const bmi           = editing
    ? calcBMI(draft.height, draft.weight)
    : userData?.bmi || calcBMI(userData?.height, userData?.weight);
  const bmiLbl  = bmiLabel(parseFloat(bmi));
  const bmiClr  = bmiColor(parseFloat(bmi));

  const idealMin = displayHeight ? Math.round(18.5 * ((parseFloat(displayHeight) / 100) ** 2)) : null;
  const idealMax = displayHeight ? Math.round(24.9 * ((parseFloat(displayHeight) / 100) ** 2)) : null;

  const levelIdx = Math.min(
    Math.floor(totalWorkouts / WORKOUTS_PER_LEVEL),
    LEVELS.length - 1
  );
  const levelPct = ((totalWorkouts % WORKOUTS_PER_LEVEL) / WORKOUTS_PER_LEVEL) * 100;
  const toNext   = WORKOUTS_PER_LEVEL - (totalWorkouts % WORKOUTS_PER_LEVEL);
  const nextLevel = LEVELS[Math.min(levelIdx + 1, LEVELS.length - 1)];

  const initial   = (userData?.name || 'A')[0].toUpperCase();
  const firstName = (userData?.name || 'Athlete').split(' ')[0];

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleEdit = () => {
    setDraft({
      name:      userData?.name      || '',
      nickname:  userData?.nickname  || '',
      age:       userData?.age?.toString()    || '',
      height:    userData?.height?.toString() || '',
      weight:    userData?.weight?.toString() || '',
      injuries:  Array.isArray(userData?.injuries)
                   ? userData.injuries.join(', ')
                   : userData?.injuries || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      const newBMI = calcBMI(draft.height, draft.weight);
      const updates = {
        name:      draft.name.trim(),
        nickname:  draft.nickname.trim(),
        age:       parseInt(draft.age)        || userData?.age,
        height:    parseFloat(draft.height)   || userData?.height,
        weight:    parseFloat(draft.weight)   || userData?.weight,
        injuries:  draft.injuries ? [draft.injuries.trim()] : [],
        updatedAt: serverTimestamp(),
      };
      if (newBMI) {
        updates.bmi      = parseFloat(newBMI);
        updates.bmiLabel = bmiLabel(parseFloat(newBMI));
      }

      await updateDoc(doc(db, 'users', user.uid), updates);
      setUserData((prev) => ({ ...prev, ...updates, bmi: parseFloat(newBMI) }));
      setEditing(false);
      Alert.alert('Saved!', 'Your profile has been updated.');
    } catch (e) {
      Alert.alert('Error', 'Could not save changes. Please try again.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to sign out of HitTrack?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await signOut(auth);
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const updateDraft = (field, val) => setDraft((d) => ({ ...d, [field]: val }));

  // ── Field helper ─────────────────────────────────────────────────────────────
  const EditableField = ({ label, field, keyboard = 'default', placeholder }) => (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={styles.editInput}
        value={draft[field]?.toString() || ''}
        onChangeText={(v) => updateDraft(field, v)}
        keyboardType={keyboard}
        placeholder={placeholder || label}
        placeholderTextColor={COLORS.gray}
        autoCapitalize={keyboard === 'default' ? 'words' : 'none'}
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.red} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HERO PROFILE CARD ── */}
        <View style={[styles.card, { alignItems: 'center', paddingTop: 28 }]}>
          {/* Avatar */}
          <View style={[styles.heroAvatar, { borderColor: lc, shadowColor: lc }]}>
            <Text style={[styles.heroAvatarText, { color: lc }]}>{initial}</Text>
          </View>

          {/* Nickname + Email */}
          <Text style={styles.heroNickname}>
            {userData?.nickname || firstName}
          </Text>
          <Text style={styles.heroEmail}>
            {userData?.email || auth.currentUser?.email || ''}
          </Text>

          {/* Full name with quotes */}
          <Text style={styles.heroFullName}>
            "{userData?.name || 'Athlete'}"
          </Text>

          <View style={styles.heroDivider} />

          {/* Quick Tags + Score — side by side */}
          <View style={styles.heroBottom}>
            {/* Quick Tags */}
            <View style={styles.tagsWrap}>
              {userData?.goal && (
                <View style={[styles.tag, { backgroundColor: '#0d1f3c', borderColor: '#1e3a5f' }]}>
                  <Text style={[styles.tagText, { color: '#42a5f5' }]}>🎯 {userData.goal}</Text>
                </View>
              )}
              {userData?.daysPerWeek && (
                <View style={[styles.tag, { backgroundColor: '#0d2b1e', borderColor: '#1a4a32' }]}>
                  <Text style={[styles.tagText, { color: COLORS.green }]}>📅 {userData.daysPerWeek}x/week</Text>
                </View>
              )}
              {userData?.age && (
                <View style={[styles.tag, { backgroundColor: '#1e1030', borderColor: '#3a1f5c' }]}>
                  <Text style={[styles.tagText, { color: '#c084fc' }]}>🎂 {userData.age} yrs</Text>
                </View>
              )}
              {(userData?.injuries?.length > 0 && userData.injuries[0]) && (
                <View style={[styles.tag, { backgroundColor: '#2a2000', borderColor: '#443300' }]}>
                  <Text style={[styles.tagText, { color: COLORS.gold }]}>
                    ⚠️ {Array.isArray(userData.injuries) ? userData.injuries[0] : userData.injuries}
                  </Text>
                </View>
              )}
            </View>

            {/* Leaderboard Score */}
            <View style={[styles.scoreBox, { borderColor: lc + '44', backgroundColor: lc + '11' }]}>
              <Text style={styles.scoreLabel}>SCORE</Text>
              <Text style={[styles.scoreValue, { color: lc }]}>{score.toLocaleString()}</Text>
              <Text style={styles.scorePts}>pts</Text>
            </View>
          </View>
        </View>

        {/* ── BODY METRICS ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⚖️ Body Metrics</Text>
            <Text style={styles.sectionSub}>From Program Builder</Text>
          </View>

          {/* BMI Hero */}
          {bmi ? (
            <View style={[styles.bmiCard, { borderColor: bmiClr + '44', backgroundColor: bmiClr + '0d' }]}>
              <View style={styles.bmiLeft}>
                <Text style={[styles.bmiNumber, { color: bmiClr }]}>{bmi}</Text>
                <Text style={styles.bmiSmallLabel}>BMI</Text>
                <View style={[styles.bmiTag, { backgroundColor: bmiClr + '22', borderColor: bmiClr + '44' }]}>
                  <Text style={[styles.bmiTagText, { color: bmiClr }]}>{bmiLbl}</Text>
                </View>
              </View>
              <View style={styles.bmiRight}>
                {/* Color scale bar */}
                <View style={styles.bmiScaleBar}>
                  <View style={[styles.bmiScaleSegment, { backgroundColor: '#42a5f5' }]} />
                  <View style={[styles.bmiScaleSegment, { backgroundColor: COLORS.green }]} />
                  <View style={[styles.bmiScaleSegment, { backgroundColor: COLORS.gold }]} />
                  <View style={[styles.bmiScaleSegment, { backgroundColor: COLORS.red }]} />
                  {/* Indicator dot */}
                  <View style={[styles.bmiDot, {
                    left: `${Math.min(Math.max(((parseFloat(bmi) - 10) / 35) * 100, 0), 96)}%`,
                    backgroundColor: bmiClr,
                  }]} />
                </View>
                <View style={styles.bmiScaleLabels}>
                  {['Under', 'Normal', 'Over', 'Obese'].map((l) => (
                    <Text key={l} style={styles.bmiScaleLabel}>{l}</Text>
                  ))}
                </View>
                {idealMin > 0 && (
                  <Text style={styles.idealWeight}>
                    Ideal:{' '}
                    <Text style={{ color: COLORS.green, fontWeight: '700' }}>
                      {idealMin}–{idealMax} kg
                    </Text>
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.noBmiBox}>
              <Text style={styles.noBmiText}>Complete Program Builder to see your BMI</Text>
            </View>
          )}

          {/* Stats Grid — always shows current saved values */}
          <View style={styles.metricsGrid}>
            {[
              { icon: '📏', label: 'Height', val: userData?.height ? `${userData.height} cm` : '—', color: '#42a5f5' },
              { icon: '⚖️', label: 'Weight', val: userData?.weight ? `${userData.weight} kg` : '—', color: '#c084fc' },
              { icon: '🎂', label: 'Age',    val: userData?.age    ? `${userData.age} yrs`   : '—', color: '#fb923c' },
              { icon: '🥊', label: 'Stance', val: userData?.stance || '—',                          color: COLORS.gold },
            ].map((m, i) => (
              <View key={i} style={[styles.metricBox, { borderColor: m.color + '22' }]}>
                <View style={[styles.metricIcon, { backgroundColor: m.color + '18' }]}>
                  <Text style={{ fontSize: 18 }}>{m.icon}</Text>
                </View>
                <Text style={styles.metricLabel}>{m.label}</Text>
                <Text style={[styles.metricValue, { color: m.color }]}>{m.val}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── LEVEL PROGRESS ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📈 Level Progress</Text>
          </View>

          {/* Level Hero */}
          <View style={[styles.levelHero, { borderColor: lc + '33', backgroundColor: lc + '0d' }]}>
            <Text style={styles.levelHeroIcon}>{li}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.levelHeroName, { color: lc }]}>{currentLevel.toUpperCase()}</Text>
              <Text style={styles.levelHeroSub}>{totalWorkouts} workouts · {toNext} to go</Text>
              {/* Progress bar */}
              <View style={styles.levelBarBg}>
                <View style={[styles.levelBarFill, { width: `${levelPct}%`, backgroundColor: lc }]} />
              </View>
              <Text style={styles.levelNext}>{currentLevel} → {nextLevel}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.scoreBig, { color: lc }]}>{score.toLocaleString()}</Text>
              <Text style={styles.scoreSmallLabel}>SCORE</Text>
            </View>
          </View>

          {/* Score Breakdown */}
          <View style={styles.scoreBars}>
            <Text style={styles.scoreBreakdownTitle}>Score Breakdown</Text>
            <ScoreBar
              label={`🥊 Workouts ×10 = ${totalWorkouts * 10} pts`}
              value={totalWorkouts * 10}
              max={Math.max(totalWorkouts * 10 + 200, 300)}
              color={COLORS.gold}
              delay={0}
            />
            <ScoreBar
              label={`🔥 Streak ×5 = ${streak * 5} pts`}
              value={streak * 5}
              max={Math.max(streak * 5 + 50, 100)}
              color={COLORS.red}
              delay={150}
            />
            <ScoreBar
              label={`⭐ Level Bonus = ${LEVEL_BONUS[currentLevel] || 0} pts`}
              value={LEVEL_BONUS[currentLevel] || 0}
              max={750}
              color={lc}
              delay={300}
            />
            <ScoreBar
              label={`📅 Weekly = ${Math.round(weeklyPct * 1.5)} pts`}
              value={Math.round(weeklyPct * 1.5)}
              max={150}
              color={COLORS.green}
              delay={450}
            />
          </View>

          {/* Locked Program Settings */}
          <View style={styles.lockedSection}>
            <View style={styles.lockedHeader}>
              <Text style={styles.lockedTitle}>🔒 Program Settings</Text>
              <TouchableOpacity
                style={styles.redoBtn}
                onPress={() => Alert.alert(
                  'Reset Program?',
                  'This unlocks your stance, level, and goal so you can redo the Program Builder. Your workout history stays safe.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Yes, Reset',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await updateDoc(doc(db, 'users', auth.currentUser.uid), { programSetupDone: false });
                          router.replace('/(auth)/program-builder');
                        } catch (e) { console.error(e); }
                      },
                    },
                  ]
                )}
              >
                <Ionicons name="refresh" size={12} color={COLORS.red} />
                <Text style={styles.redoBtnText}>Re-do Program</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.lockedGrid}>
              {[
                { label: 'Experience', val: userData?.experience || '—', icon: '⭐' },
                { label: 'Goal',       val: userData?.goal       || '—', icon: '🎯' },
                { label: 'Stance',     val: userData?.stance     || '—', icon: '🥊' },
              ].map((f, i) => (
                <View key={i} style={styles.lockedBox}>
                  <Text style={styles.lockedIcon}>{f.icon}</Text>
                  <Text style={styles.lockedLabel}>{f.label}</Text>
                  <Text style={styles.lockedVal}>{f.val}</Text>
                  <Text style={styles.lockedBadge}>🔒 locked</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── EDIT FIELDS (shown only when editing) ── */}
        {editing && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>✏️ Edit Profile</Text>
              <Text style={styles.sectionSub}>Tap a field to change it</Text>
            </View>
            <View style={styles.editGrid}>
              <EditableField label="Full Name"      field="name"     keyboard="default"      placeholder="Your full name" />
              <EditableField label="Nickname"       field="nickname" keyboard="default"      placeholder="Your nickname" />
              <EditableField label="Age"            field="age"      keyboard="number-pad"   placeholder="e.g. 22" />

              {/* Height + Weight side by side */}
              <View style={styles.editRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editLabel}>Height (cm)</Text>
                  <TextInput
                    style={styles.editInput}
                    value={draft.height?.toString() || ''}
                    onChangeText={(v) => updateDraft('height', v)}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 170"
                    placeholderTextColor={COLORS.gray}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editLabel}>Weight (kg)</Text>
                  <TextInput
                    style={styles.editInput}
                    value={draft.weight?.toString() || ''}
                    onChangeText={(v) => updateDraft('weight', v)}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 65"
                    placeholderTextColor={COLORS.gray}
                  />
                </View>
              </View>

              <EditableField label="Injuries / Conditions" field="injuries" keyboard="default" placeholder="e.g. knee injury — leave blank if none" />
            </View>

            {/* Live BMI Preview */}
            {calcBMI(draft.height, draft.weight) && (
              <View style={styles.bmiPreview}>
                <Ionicons name="information-circle-outline" size={14} color={bmiColor(parseFloat(calcBMI(draft.height, draft.weight)))} />
                <Text style={styles.bmiPreviewText}>
                  Updated BMI:{' '}
                  <Text style={{ color: bmiColor(parseFloat(calcBMI(draft.height, draft.weight))), fontWeight: '800' }}>
                    {calcBMI(draft.height, draft.weight)} — {bmiLabel(parseFloat(calcBMI(draft.height, draft.weight)))}
                  </Text>
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── BOTTOM BUTTONS ── */}
        <View style={styles.bottomRow}>
          {/* Edit / Save Button */}
          <TouchableOpacity
            style={[styles.bottomBtn, editing ? styles.saveBtn : styles.editBtn]}
            onPress={editing ? handleSave : handleEdit}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons
                  name={editing ? 'checkmark-circle-outline' : 'pencil-outline'}
                  size={18}
                  color={COLORS.white}
                />
                <Text style={styles.bottomBtnText}>
                  {editing ? 'Save Changes' : 'Edit Profile'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Logout Button */}
          <TouchableOpacity
            style={[styles.bottomBtn, styles.logoutBtn]}
            onPress={handleLogout}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={18} color={COLORS.white} />
            <Text style={styles.bottomBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 14, paddingTop: 16 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: COLORS.border,
  },

  // ── Hero Card
  heroAvatar: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8,
  },
  heroAvatarText: { fontSize: 36, fontWeight: '900' },
  heroNickname:   { fontSize: 22, fontWeight: '900', color: COLORS.white, marginBottom: 2 },
  heroEmail:      { fontSize: 12, color: COLORS.gray, marginBottom: 8 },
  heroFullName:   { fontSize: 13, color: COLORS.gray, fontStyle: 'italic', marginBottom: 16 },
  heroDivider:    { width: '100%', height: 1, backgroundColor: COLORS.border, marginBottom: 16 },
  heroBottom:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, width: '100%' },
  tagsWrap:       { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    borderRadius: 50, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText:    { fontSize: 10, fontWeight: '700' },
  scoreBox:   {
    alignItems: 'center', borderRadius: 14,
    borderWidth: 1, padding: 12, minWidth: 80,
  },
  scoreLabel: { fontSize: 8, color: COLORS.gray, fontWeight: '800', letterSpacing: 1 },
  scoreValue: { fontSize: 26, fontWeight: '900', lineHeight: 30 },
  scorePts:   { fontSize: 9,  color: COLORS.gray, fontWeight: '700' },

  // ── Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  sectionSub:   { fontSize: 10, color: COLORS.gray },

  // ── BMI
  bmiCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14,
  },
  bmiLeft:      { alignItems: 'center', minWidth: 70 },
  bmiNumber:    { fontSize: 48, fontWeight: '900', lineHeight: 52 },
  bmiSmallLabel:{ fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  bmiTag: {
    borderRadius: 50, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 3, marginTop: 6,
  },
  bmiTagText:   { fontSize: 10, fontWeight: '700' },
  bmiRight:     { flex: 1 },
  bmiScaleBar: {
    height: 10, borderRadius: 50, overflow: 'visible',
    flexDirection: 'row', marginBottom: 6, position: 'relative',
  },
  bmiScaleSegment:{ flex: 1 },
  bmiDot: {
    position: 'absolute', top: -3,
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: COLORS.bg,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 4,
  },
  bmiScaleLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bmiScaleLabel:  { fontSize: 8, color: COLORS.gray, fontWeight: '700' },
  idealWeight:    { fontSize: 11, color: COLORS.gray },
  noBmiBox: {
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  noBmiText: { fontSize: 12, color: COLORS.gray },

  // ── Metrics Grid
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricBox: {
    width: '47%', backgroundColor: COLORS.inputBg,
    borderRadius: 14, padding: 14,
    borderWidth: 1, alignItems: 'center', gap: 4,
  },
  metricIcon:  {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  metricLabel: { fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricInput: {
    fontSize: 16, fontWeight: '800', textAlign: 'center',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingVertical: 2, minWidth: 60,
  },

  // ── Level Progress
  levelHero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16,
  },
  levelHeroIcon: { fontSize: 36 },
  levelHeroName: { fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  levelHeroSub:  { fontSize: 11, color: COLORS.gray, marginTop: 2, marginBottom: 8 },
  levelBarBg:    { height: 6, backgroundColor: COLORS.border, borderRadius: 50, overflow: 'hidden', marginBottom: 4 },
  levelBarFill:  { height: '100%', borderRadius: 50 },
  levelNext:     { fontSize: 10, color: COLORS.gray },
  scoreBig:      { fontSize: 28, fontWeight: '900' },
  scoreSmallLabel:{ fontSize: 9, color: COLORS.gray, fontWeight: '800', letterSpacing: 1 },

  scoreBars:          { gap: 10, marginBottom: 16 },
  scoreBreakdownTitle:{ fontSize: 11, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  barRow:   { gap: 5 },
  barHeader:{ flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 11, color: COLORS.gray },
  barValue: { fontSize: 11, fontWeight: '700' },
  barBg:    { height: 6, backgroundColor: COLORS.border, borderRadius: 50, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 50 },

  // ── Locked Settings
  lockedSection: {
    backgroundColor: COLORS.inputBg, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  lockedHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  lockedTitle:  { fontSize: 13, fontWeight: '700', color: COLORS.white },
  redoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.red + '55', borderStyle: 'dashed',
    borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4,
  },
  redoBtnText: { fontSize: 10, color: COLORS.red, fontWeight: '700' },
  lockedGrid:  { flexDirection: 'row', gap: 8 },
  lockedBox: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 10,
    padding: 10, alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: COLORS.border,
  },
  lockedIcon:   { fontSize: 18 },
  lockedLabel:  { fontSize: 8, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5 },
  lockedVal:    { fontSize: 11, fontWeight: '700', color: COLORS.white, textAlign: 'center' },
  lockedBadge:  { fontSize: 8, color: '#444' },

  // ── Edit Fields
  editGrid: { gap: 12 },
  editRow:  { flexDirection: 'row', gap: 12 },
  editField:{ gap: 6 },
  editLabel:{ fontSize: 11, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5 },
  editInput:{
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 48,
    color: COLORS.white, fontSize: 15,
  },
  bmiPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.inputBg, borderRadius: 10,
    padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bmiPreviewText: { fontSize: 13, color: COLORS.lightGray, flex: 1 },

  // ── Bottom Buttons
  bottomRow: { flexDirection: 'row', gap: 12 },
  bottomBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    height: 52, borderRadius: 14,
  },
  editBtn:      { backgroundColor: '#333333' },
  saveBtn:      { backgroundColor: '#16a34a' },
  logoutBtn:    { backgroundColor: COLORS.red },
  bottomBtnText:{ color: COLORS.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});