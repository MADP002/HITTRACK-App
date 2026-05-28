import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated, PanResponder, Modal, Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { doc, getDoc, collection, query, orderBy, onSnapshot } from 'firebase/firestore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842',
};

const LEVELS       = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Elite'];
const LEVEL_COLORS = {
  Beginner: '#fb923c', Intermediate: '#F5C842',
  Advanced: '#4ade80', Expert: '#42a5f5', Elite: '#c084fc',
};
const WORKOUTS_PER_LEVEL = 25;

const TIPS = [
  { icon: '🥊', category: 'TECHNIQUE',    text: "Keep your chin tucked and shoulders raised when jabbing. Protects your jaw and makes punches harder to read." },
  { icon: '🦵', category: 'FOOTWORK',     text: "Never cross your feet when moving. Use the step-drag method — lead foot moves first, rear follows. Keeps your base solid." },
  { icon: '💨', category: 'BREATHING',    text: "Exhale sharply on every punch. This tightens your core, increases power, and prevents breath-holding under pressure." },
  { icon: '🛡️', category: 'DEFENSE',      text: "Rotate your hips fully when throwing hooks — try 3 sets of 20 before your next session to rebuild muscle memory." },
  { icon: '🔥', category: 'CONDITIONING', text: "Shadow box for 3 rounds before hitting the bag. Warms up muscles, sharpens combos, and builds muscle memory faster." },
  { icon: '🧠', category: 'MINDSET',      text: "Consistency beats intensity. Training 4 days at 70% beats 1 day at 100%. Show up even when you don't feel like it." },
  { icon: '⚡', category: 'POWER',        text: "Power comes from legs and hips, not arms. Drive from your back foot and rotate your whole body into every cross." },
];

// ── PROGRESS RING (pure React Native — no extra packages needed) ──────────────
function ProgressRing({ percentage = 0, size = 110, color = COLORS.red }) {
  const strokeWidth = 11;
  const half        = size / 2;
  const degrees     = (Math.min(percentage, 100) / 100) * 360;

  // Right half: rotates from -180 to 0 degrees as pct goes 0→50%
  const rightRotation = `${Math.min(degrees, 180) - 180}deg`;
  // Left half: only visible when pct > 50%, rotates from 0 to 180 degrees
  const leftRotation  = `${Math.max(degrees - 180, 0)}deg`;
  const showLeft      = degrees > 180;

  return (
    <View style={{ width: size, height: size }}>
      {/* Track circle */}
      <View style={{
        position: 'absolute', width: size, height: size,
        borderRadius: half, borderWidth: strokeWidth, borderColor: COLORS.border,
      }} />

      {/* Right half arc */}
      <View style={{
        position: 'absolute', width: size, height: size, overflow: 'hidden',
      }}>
        <View style={{
          position: 'absolute', right: 0, width: half, height: size, overflow: 'hidden',
        }}>
          <View style={{
            position: 'absolute', right: 0,
            width: size, height: size,
            borderRadius: half, borderWidth: strokeWidth, borderColor: color,
            transform: [{ rotate: rightRotation }],
          }} />
        </View>
      </View>

      {/* Left half arc — only shown when > 50% */}
      {showLeft && (
        <View style={{
          position: 'absolute', width: size, height: size, overflow: 'hidden',
        }}>
          <View style={{
            position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden',
          }}>
            <View style={{
              position: 'absolute', left: 0,
              width: size, height: size,
              borderRadius: half, borderWidth: strokeWidth, borderColor: color,
              transform: [{ rotate: leftRotation }],
            }} />
          </View>
        </View>
      )}

      {/* Center label */}
      <View style={{
        position: 'absolute', width: size, height: size,
        justifyContent: 'center', alignItems: 'center',
      }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color }}>{percentage}%</Text>
        <Text style={{ fontSize: 10, color: COLORS.gray, fontWeight: '700' }}>Done</Text>
      </View>
    </View>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();

  const [userData,          setUserData]          = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [announcements,     setAnnouncements]     = useState([]);
  const [tipIndex,          setTipIndex]          = useState(0);

  const translateX  = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  // ── Load user data ────────────────────────────────────────────────────────
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => { if (snap.exists()) setUserData(snap.data()); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Load announcements (real-time) ────────────────────────────────────────
  useEffect(() => {
    try {
      const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        const all = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((n) => n.audience === 'all' || !n.audience);
        setAnnouncements(all.slice(0, 10));
      }, () => {});
      return () => unsub();
    } catch (e) { console.warn('Announcements error:', e); }
  }, []);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalWorkouts = userData?.totalWorkouts || 0;
  const streak        = userData?.streak        || 0;
  const weeklyPct     = userData?.weeklyPct     || 0;

  const levelIdx     = Math.min(Math.floor(totalWorkouts / WORKOUTS_PER_LEVEL), LEVELS.length - 1);
  const currentLevel = LEVELS[levelIdx];
  const nextLevel    = LEVELS[Math.min(levelIdx + 1, LEVELS.length - 1)];
  const levelPct     = ((totalWorkouts % WORKOUTS_PER_LEVEL) / WORKOUTS_PER_LEVEL) * 100;
  const toNext       = WORKOUTS_PER_LEVEL - (totalWorkouts % WORKOUTS_PER_LEVEL);
  const levelColor   = LEVEL_COLORS[currentLevel] || COLORS.gold;

  const firstName = (userData?.name || 'Athlete').split(' ')[0];
  const initial   = (userData?.name || 'A')[0].toUpperCase();

  // ── Tip swipe animation ───────────────────────────────────────────────────
  const animateToTip = (nextIdx, direction) => {
    const outX = direction === 'next' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    Animated.parallel([
      Animated.timing(translateX,  { toValue: outX, duration: 220, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setTipIndex(nextIdx);
      translateX.setValue(-outX);
      Animated.parallel([
        Animated.timing(translateX,  { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 40,
    onPanResponderMove: (_, g) => {
      translateX.setValue(g.dx);
      cardOpacity.setValue(1 - Math.abs(g.dx) / (SCREEN_WIDTH * 0.8));
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx < -60) {
        animateToTip((tipIndex + 1) % TIPS.length, 'next');
      } else if (g.dx > 60) {
        animateToTip((tipIndex - 1 + TIPS.length) % TIPS.length, 'prev');
      } else {
        Animated.parallel([
          Animated.spring(translateX,  { toValue: 0, useNativeDriver: true }),
          Animated.timing(cardOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
      }
    },
  })).current;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.red} />
        </View>
      </SafeAreaView>
    );
  }

  const tip = TIPS[tipIndex];

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── ANNOUNCEMENTS MODAL ── */}
      <Modal
        visible={showAnnouncements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAnnouncements(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAnnouncements(false)}
        >
          <View style={styles.announcementDropdown}>
            <View style={styles.announcementHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="megaphone" size={16} color={COLORS.gold} />
                <Text style={styles.announcementTitle}>Announcements</Text>
              </View>
              {announcements.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{announcements.length}</Text>
                </View>
              )}
            </View>

            {announcements.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 32 }}>📭</Text>
                <Text style={styles.emptyText}>No announcements yet.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                {announcements.map((n, i) => (
                  <View
                    key={n.id}
                    style={[styles.announcementItem, i < announcements.length - 1 && styles.itemBorder]}
                  >
                    <View style={styles.announcementIcon}>
                      <Text style={{ fontSize: 14 }}>📢</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{n.title}</Text>
                      <Text style={styles.itemMsg}>{n.message}</Text>
                      <Text style={styles.itemFrom}>From: {n.from || 'Admin'}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── TOP BAR ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appName}>🥊 HITTRACK</Text>
          <Text style={styles.topBarSub}>Member Dashboard</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/(member)/about')}>
            <Ionicons name="information-circle-outline" size={22} color={COLORS.lightGray} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowAnnouncements(true)}>
            <Ionicons name="megaphone-outline" size={22} color={COLORS.lightGray} />
            {announcements.length > 0 && (
              <View style={styles.notifDot}>
                <Text style={styles.notifDotText}>
                  {announcements.length > 9 ? '9+' : announcements.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── WELCOME CARD ── */}
        <View style={styles.card}>
          <View style={styles.welcomeRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.welcomeLabel}>Welcome back,</Text>
              <Text style={styles.welcomeName}>{firstName}!</Text>
            </View>
            <View style={[styles.levelBadge, {
              backgroundColor: levelColor + '22',
              borderColor: levelColor + '66',
            }]}>
              <Text style={[styles.levelBadgeText, { color: levelColor }]}>{currentLevel}</Text>
            </View>
          </View>

          {/* Profile Tags */}
          <View style={styles.tagsRow}>
            {[
              { label: 'Stance',     val: userData?.stance     || '—', icon: '🥊' },
              { label: 'Experience', val: userData?.experience || '—', icon: '⭐' },
              { label: 'Goal',       val: userData?.goal       || '—', icon: '🎯' },
            ].map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagLabel}>{tag.label}</Text>
                <Text style={styles.tagVal}>{tag.icon} {tag.val}</Text>
              </View>
            ))}
          </View>

          {/* Level Progress */}
          <View style={{ gap: 8 }}>
            <View style={styles.levelRow}>
              <Text style={styles.levelLabel}>{currentLevel} → {nextLevel}</Text>
              <Text style={[styles.levelPct, { color: levelColor }]}>
                {levelPct.toFixed(0)}% · {toNext} to go
              </Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, {
                width: `${levelPct}%`,
                backgroundColor: levelColor,
              }]} />
            </View>
            <View style={styles.levelDots}>
              {LEVELS.map((lv, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={[styles.levelDot, i <= levelIdx && {
                    backgroundColor: i < levelIdx ? COLORS.green : levelColor,
                  }]} />
                  <Text style={[styles.levelDotLabel, i === levelIdx && { color: levelColor }]}>
                    {lv.slice(0, 3).toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── STREAK BANNER ── */}
        <View style={[styles.streakBanner, streak > 0 && { borderColor: '#E6394455' }]}>
          <Text style={{ fontSize: 34 }}>{streak > 0 ? '🔥' : '⭕'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.streakTitle}>
              {streak > 0 ? `${streak} Day Streak!` : 'No active streak yet'}
            </Text>
            <Text style={styles.streakSub}>
              {streak > 0
                ? 'Keep it up — train today to maintain your streak.'
                : 'Complete your first workout to start a streak.'}
            </Text>
          </View>
          {streak > 0 && (
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.streakNum}>{streak}</Text>
              <Text style={styles.streakNumLabel}>days</Text>
            </View>
          )}
        </View>

        {/* ── PROGRESS RING + STATS ── */}
        <View style={styles.ringSection}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <ProgressRing percentage={weeklyPct} color={COLORS.red} />
            <Text style={styles.ringTitle}>Weekly Progress</Text>
          </View>

          <View style={{ flex: 1, gap: 8 }}>
            {[
              { icon: '🔥', label: 'Streak',    val: `${streak} day${streak !== 1 ? 's' : ''}`, color: streak > 0 ? COLORS.red  : COLORS.gray },
              { icon: '🥊', label: 'Workouts',  val: `${totalWorkouts}`,                         color: COLORS.gold },
              { icon: '⭐', label: 'Level',      val: currentLevel,                               color: levelColor  },
              { icon: '📅', label: 'Days/Week', val: `${userData?.daysPerWeek || 0}x`,           color: COLORS.green },
            ].map((stat, i) => (
              <View key={i} style={styles.statItem}>
                <Text style={{ fontSize: 18 }}>{stat.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Text style={[styles.statVal, { color: stat.color }]}>{stat.val}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── BOXING TIPS FLASHCARD ── */}
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <View style={styles.tipHeader}>
            <Text style={styles.tipSectionTitle}>💡 Boxing Tips</Text>
            <Text style={styles.tipCounter}>{tipIndex + 1} / {TIPS.length}</Text>
          </View>

          <Animated.View
            style={[styles.tipCard, { transform: [{ translateX }], opacity: cardOpacity }]}
            {...panResponder.panHandlers}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Text style={{ fontSize: 28 }}>{tip.icon}</Text>
              <View style={styles.tipCategoryBadge}>
                <Text style={styles.tipCategoryText}>{tip.category}</Text>
              </View>
            </View>
            <Text style={styles.tipText}>{tip.text}</Text>
            <View style={styles.tipHint}>
              <Ionicons name="arrow-back"    size={12} color={COLORS.gray} />
              <Text style={styles.tipHintText}>Swipe to browse tips</Text>
              <Ionicons name="arrow-forward" size={12} color={COLORS.gray} />
            </View>
          </Animated.View>

          <View style={styles.tipDots}>
            {TIPS.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => animateToTip(i, i > tipIndex ? 'next' : 'prev')}
              >
                <View style={[styles.tipDot, i === tipIndex && styles.tipDotActive]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },

  // Top Bar
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  appName:    { fontSize: 16, fontWeight: '900', color: COLORS.red, letterSpacing: 2 },
  topBarSub:  { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  notifDot: {
    position: 'absolute', top: 6, right: 6,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.red,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  notifDotText: { fontSize: 9, color: COLORS.white, fontWeight: '800' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-start', alignItems: 'flex-end',
    paddingTop: 80, paddingRight: 16,
  },
  announcementDropdown: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    width: SCREEN_WIDTH * 0.88, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 12,
  },
  announcementHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  announcementTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  badge: {
    backgroundColor: COLORS.red, borderRadius: 50,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeText:  { fontSize: 11, color: COLORS.white, fontWeight: '700' },
  emptyBox:   { padding: 32, alignItems: 'center', gap: 8 },
  emptyText:  { fontSize: 13, color: COLORS.gray },
  announcementItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14,
  },
  itemBorder:      { borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  announcementIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#1E1E00',
    justifyContent: 'center', alignItems: 'center',
  },
  itemTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white, marginBottom: 3 },
  itemMsg:   { fontSize: 12, color: COLORS.gray, lineHeight: 18 },
  itemFrom:  { fontSize: 10, color: '#555', marginTop: 4 },

  // Card
  card: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: COLORS.border, marginTop: 14,
  },

  // Welcome
  welcomeRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#2A1215', borderWidth: 2, borderColor: COLORS.red,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:   { fontSize: 20, fontWeight: '900', color: COLORS.red },
  welcomeLabel: { fontSize: 12, color: COLORS.gray },
  welcomeName:  { fontSize: 20, fontWeight: '900', color: COLORS.white },
  levelBadge: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 50, borderWidth: 1,
  },
  levelBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // Tags
  tagsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tag: {
    flex: 1, backgroundColor: '#111100', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: '#222200',
  },
  tagLabel: { fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  tagVal:   { fontSize: 11, color: COLORS.gold, fontWeight: '700' },

  // Level progress
  levelRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelLabel:    { fontSize: 11, color: COLORS.gray, fontWeight: '700' },
  levelPct:      { fontSize: 11, fontWeight: '700' },
  progressBg:    { height: 8, backgroundColor: COLORS.border, borderRadius: 50, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 50 },
  levelDots:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  levelDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  levelDotLabel: { fontSize: 8, color: COLORS.gray, fontWeight: '700' },

  // Streak
  streakBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  streakTitle:    { fontSize: 15, fontWeight: '800', color: COLORS.white },
  streakSub:      { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  streakNum:      { fontSize: 28, fontWeight: '900', color: COLORS.red },
  streakNumLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '700' },

  // Ring + Stats
  ringSection: {
    flexDirection: 'row', gap: 16, alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: COLORS.border,
  },
  ringTitle: { fontSize: 11, color: COLORS.gray, fontWeight: '700', textAlign: 'center' },
  statItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.inputBg, borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  statLabel: { fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5 },
  statVal:   { fontSize: 13, fontWeight: '800', marginTop: 1 },

  // Tips
  tipHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tipSectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  tipCounter:      { fontSize: 12, color: COLORS.gray },
  tipCard: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: COLORS.border, minHeight: 140,
  },
  tipCategoryBadge: {
    backgroundColor: '#111100', borderRadius: 50,
    paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: '#222200',
  },
  tipCategoryText: { fontSize: 10, color: COLORS.gold, fontWeight: '800', letterSpacing: 1 },
  tipText: { fontSize: 14, color: COLORS.lightGray, lineHeight: 22 },
  tipHint: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginTop: 16,
  },
  tipHintText: { fontSize: 11, color: COLORS.gray },
  tipDots:     { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tipDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  tipDotActive:{ backgroundColor: COLORS.red, width: 20, borderRadius: 3 },
});