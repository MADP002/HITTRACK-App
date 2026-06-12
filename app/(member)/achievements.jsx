import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
   ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842',
};

// ── BADGE DEFINITIONS ─────────────────────────────────────────────────────────
const BADGES = [
  // MILESTONES
  { id:'w1', category:'Milestones',  icon:'🥊', title:'First Punch',     desc:'Complete your very first workout',       rarity:'common',    xp:50,   condition: s => s.totalWorkouts >= 1   },
  { id:'w2', category:'Milestones',  icon:'🏅', title:'10 Workouts',     desc:'Complete 10 workouts',                   rarity:'common',    xp:100,  condition: s => s.totalWorkouts >= 10  },
  { id:'w3', category:'Milestones',  icon:'🥈', title:'20 Workouts',     desc:'Complete 20 workouts',                   rarity:'uncommon',  xp:200,  condition: s => s.totalWorkouts >= 20  },
  { id:'w4', category:'Milestones',  icon:'🥇', title:'30 Workouts',     desc:'Complete 30 workouts',                   rarity:'uncommon',  xp:300,  condition: s => s.totalWorkouts >= 30  },
  { id:'w5', category:'Milestones',  icon:'💎', title:'50 Workouts',     desc:'Complete 50 workouts',                   rarity:'rare',      xp:500,  condition: s => s.totalWorkouts >= 50  },
  { id:'w6', category:'Milestones',  icon:'👑', title:'100 Workouts',    desc:'Complete 100 workouts — true fighter',   rarity:'legendary', xp:1000, condition: s => s.totalWorkouts >= 100 },

  // STREAKS
  { id:'s1', category:'Streaks',     icon:'🔥', title:'On Fire',         desc:'Maintain a 3-day training streak',       rarity:'common',    xp:75,   condition: s => s.streak >= 3  },
  { id:'s2', category:'Streaks',     icon:'🔥', title:'Week Warrior',    desc:'Maintain a 7-day training streak',       rarity:'uncommon',  xp:150,  condition: s => s.streak >= 7  },
  { id:'s3', category:'Streaks',     icon:'⚡', title:'Unstoppable',     desc:'Maintain a 14-day training streak',      rarity:'rare',      xp:300,  condition: s => s.streak >= 14 },
  { id:'s4', category:'Streaks',     icon:'👑', title:'Iron Will',       desc:'Maintain a 30-day training streak',      rarity:'legendary', xp:750,  condition: s => s.streak >= 30 },

  // LEVELS
  { id:'l1', category:'Levels',      icon:'🌱', title:"Beginner's Heart", desc:'Start your boxing journey',             rarity:'common',    xp:50,   condition: s => s.totalWorkouts >= 1  },
  { id:'l2', category:'Levels',      icon:'⚡', title:'Intermediate',    desc:'Reach Intermediate level (25 workouts)', rarity:'uncommon',  xp:400,  condition: s => s.totalWorkouts >= 25 },
  { id:'l3', category:'Levels',      icon:'🔥', title:'Advanced Fighter', desc:'Reach Advanced level (50 workouts)',    rarity:'rare',      xp:800,  condition: s => s.totalWorkouts >= 50 },
  { id:'l4', category:'Levels',      icon:'💎', title:'Expert',          desc:'Reach Expert level (75 workouts)',       rarity:'epic',      xp:1200, condition: s => s.totalWorkouts >= 75  },
  { id:'l5', category:'Levels',      icon:'👑', title:'Elite',           desc:'Reach Elite level (100 workouts)',       rarity:'legendary', xp:2000, condition: s => s.totalWorkouts >= 100 },

  // CONSISTENCY
  { id:'c1', category:'Consistency', icon:'📅', title:'Consistent',      desc:'Complete 50% of weekly workouts',        rarity:'common',    xp:80,   condition: s => s.weeklyPct >= 50  },
  { id:'c2', category:'Consistency', icon:'📅', title:'Dedicated',       desc:'Complete 75% of weekly workouts',        rarity:'uncommon',  xp:160,  condition: s => s.weeklyPct >= 75  },
  { id:'c3', category:'Consistency', icon:'🏆', title:'Perfect Week',    desc:'Complete 100% of weekly workouts',       rarity:'rare',      xp:350,  condition: s => s.weeklyPct >= 100 },

  // RANKINGS
  { id:'r1', category:'Rankings',    icon:'📊', title:'On the Board',    desc:'Appear on the gym leaderboard',          rarity:'common',    xp:50,   condition: s => s.totalWorkouts >= 1       },
  { id:'r2', category:'Rankings',    icon:'🏅', title:'Top 10',          desc:'Reach top 10 on the leaderboard',        rarity:'uncommon',  xp:300,  condition: s => s.rank <= 10 && s.rank > 0 },
  { id:'r3', category:'Rankings',    icon:'🥉', title:'Podium',          desc:'Reach top 3 on the leaderboard',         rarity:'epic',      xp:700,  condition: s => s.rank <= 3  && s.rank > 0 },
  { id:'r4', category:'Rankings',    icon:'🥇', title:'Champion',        desc:'Reach #1 on the gym leaderboard',        rarity:'legendary', xp:1500, condition: s => s.rank === 1               },
];

const RARITY = {
  common:    { bg:'#b0bec51A', border:'#b0bec540', text:'#b0bec5', label:'Common'    },
  uncommon:  { bg:'#4ade801A', border:'#4ade8040', text:'#4ade80', label:'Uncommon'  },
  rare:      { bg:'#42a5f51A', border:'#42a5f540', text:'#42a5f5', label:'Rare'      },
  epic:      { bg:'#c084fc1A', border:'#c084fc40', text:'#c084fc', label:'Epic'      },
  legendary: { bg:'#F5C8421F', border:'#F5C84259', text:'#F5C842', label:'Legendary' },
};

const CATEGORIES = ['All', 'Milestones', 'Streaks', 'Levels', 'Consistency', 'Rankings'];

// ── RANK CALCULATOR ───────────────────────────────────────────────────────────
function calcRank(totalWorkouts, streak, weeklyPct, level) {
  const LEVEL_BONUS = { Beginner:0, Intermediate:150, Advanced:350, Expert:600, Elite:1000 };
  const myScore = (totalWorkouts * 10) + (streak * 5) + (LEVEL_BONUS[level] || 0) + Math.round(weeklyPct * 1.5);
  const gymScores = [2228, 1562, 1483, 1008, 913, 822, 627, 544, 436, 375, 180, 135];
  return gymScores.filter(s => s > myScore).length + 1;
}

// ── PROGRESS CALCULATOR ───────────────────────────────────────────────────────
function getProgress(badge, stats) {
  if (badge.id.startsWith('w')) {
    const needed = { w1:1, w2:10, w3:20, w4:30, w5:50, w6:100 };
    return needed[badge.id] ? stats.totalWorkouts / needed[badge.id] : null;
  }
  if (badge.id.startsWith('s')) {
    const needed = { s1:3, s2:7, s3:14, s4:30 };
    return needed[badge.id] ? stats.streak / needed[badge.id] : null;
  }
  if (badge.id.startsWith('c')) {
    const needed = { c1:50, c2:75, c3:100 };
    return needed[badge.id] ? stats.weeklyPct / needed[badge.id] : null;
  }
  return null;
}

// ── BADGE CARD ────────────────────────────────────────────────────────────────
function BadgeCard({ badge, unlocked, progress }) {
  const r = RARITY[badge.rarity];

  return (
    <View style={[
      styles.badgeCard,
      unlocked
        ? { backgroundColor: r.bg, borderColor: r.border }
        : { backgroundColor: '#0F0F0F', borderColor: '#1A1A1A' },
    ]}>
      {/* Rarity label */}
      <View style={[
        styles.rarityTag,
        { backgroundColor: unlocked ? r.text + '18' : '#1A1A1A',
          borderColor:      unlocked ? r.text + '33' : '#222' },
      ]}>
        <Text style={[styles.rarityText, { color: unlocked ? r.text : '#333' }]}>
          {badge.rarity}
        </Text>
      </View>

      {/* Lock overlay */}
      {!unlocked && (
        <View style={styles.lockOverlay}>
          <Text style={styles.lockEmoji}>🔒</Text>
        </View>
      )}

      {/* Icon */}
      <Text style={[styles.badgeIcon, !unlocked && styles.badgeIconLocked]}>
        {badge.icon}
      </Text>

      {/* Title */}
      <Text style={[styles.badgeTitle, { color: unlocked ? r.text : '#444' }]}>
        {badge.title}
      </Text>

      {/* Description */}
      <Text style={[styles.badgeDesc, { color: unlocked ? '#aaa' : '#333' }]}>
        {badge.desc}
      </Text>

      {/* XP Badge */}
      <View style={[
        styles.xpBadge,
        { backgroundColor: unlocked ? r.text + '18' : '#1A1A1A',
          borderColor:      unlocked ? r.text + '33' : '#222' },
      ]}>
        <Text style={[styles.xpText, { color: unlocked ? r.text : '#333' }]}>
          {unlocked ? '+' : ''}{badge.xp} XP
        </Text>
      </View>

      {/* Progress bar for locked badges */}
      {!unlocked && progress !== null && progress !== undefined && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, {
              width: `${Math.min(progress * 100, 100)}%`,
            }]} />
          </View>
          <Text style={styles.progressText}>
            {Math.round(progress * 100)}% there
          </Text>
        </View>
      )}
    </View>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function AchievementsScreen() {
  const [userData,  setUserData]  = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [category,  setCategory]  = useState('All');
  const [showOnly,  setShowOnly]  = useState('all');

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      getDoc(doc(db, 'stats', user.uid)),
    ]).then(([userSnap, statsSnap]) => {
      if (userSnap.exists())  setUserData(userSnap.data());
      if (statsSnap.exists()) setStatsData(statsSnap.data());
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalWorkouts = statsData?.totalWorkouts ?? userData?.totalWorkouts ?? 0;
  const streak        = statsData?.streak        ?? userData?.streak        ?? 0;
  const weeklyPct     = statsData?.weeklyPct     ?? userData?.weeklyPct     ?? 0;
  const currentLevel  = statsData?.currentLevel  ?? userData?.experience    ?? 'Beginner';
  const rank          = calcRank(totalWorkouts, streak, weeklyPct, currentLevel);
  const firstName     = (userData?.name || 'Athlete').split(' ')[0];

  const stats = { totalWorkouts, streak, weeklyPct, rank };

  // ── Badge status ─────────────────────────────────────────────────────────────
  const badgeStatus = BADGES.map(b => ({
    ...b,
    unlocked: b.condition(stats),
  }));

  const unlockedCount   = badgeStatus.filter(b => b.unlocked).length;
  const totalXP         = badgeStatus.filter(b => b.unlocked).reduce((a, b) => a + b.xp, 0);
  const totalPossibleXP = BADGES.reduce((a, b) => a + b.xp, 0);
  const completionPct   = Math.round((unlockedCount / BADGES.length) * 100);
  const xpPct           = (totalXP / totalPossibleXP) * 100;

  // ── Filtered badges ───────────────────────────────────────────────────────────
  const filtered = badgeStatus
    .filter(b => category === 'All' || b.category === category)
    .filter(b => showOnly === 'all' || (showOnly === 'unlocked' ? b.unlocked : !b.unlocked));

  // ── Pair badges into rows of 2 ────────────────────────────────────────────────
  const rows = [];
  for (let i = 0; i < filtered.length; i += 2) {
    rows.push(filtered.slice(i, i + 2));
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.red} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>🏆 Achievements</Text>
            <Text style={styles.headerSub}>
              {firstName} · Collect badges by training consistently
            </Text>
          </View>
        </View>

        {/* ── SUMMARY STATS ── */}
        <View style={styles.statsRow}>
          {[
            { label: 'Unlocked',   val: `${unlockedCount}/${BADGES.length}`, color: COLORS.gold  },
            { label: 'Total XP',   val: totalXP.toLocaleString(),            color: COLORS.green },
            { label: 'Completion', val: `${completionPct}%`,                 color: COLORS.red   },
          ].map((st, i) => (
            <View key={i} style={styles.statBox}>
              <Text style={[styles.statVal, { color: st.color }]}>{st.val}</Text>
              <Text style={styles.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* ── XP PROGRESS BAR ── */}
        <View style={styles.card}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpHeaderLabel}>Overall XP Progress</Text>
            <Text style={styles.xpHeaderVal}>
              {totalXP.toLocaleString()} / {totalPossibleXP.toLocaleString()} XP
            </Text>
          </View>
          <View style={styles.xpBarBg}>
            <View style={[styles.xpBarFill, { width: `${xpPct}%` }]} />
          </View>
          <View style={styles.xpBarLabels}>
            {['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Legend'].map(l => (
              <Text key={l} style={styles.xpBarLabel}>{l}</Text>
            ))}
          </View>
        </View>

        {/* ── CATEGORY FILTER ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catBtn, category === cat && styles.catBtnActive]}
              onPress={() => setCategory(cat)}
              activeOpacity={0.8}
            >
              <Text style={[styles.catBtnText, category === cat && styles.catBtnTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── SHOW FILTER ── */}
        <View style={styles.showFilter}>
          {[['all', 'All'], ['unlocked', 'Unlocked ✓'], ['locked', 'Locked 🔒']].map(([val, label]) => (
            <TouchableOpacity
              key={val}
              style={[styles.showBtn, showOnly === val && styles.showBtnActive]}
              onPress={() => setShowOnly(val)}
              activeOpacity={0.8}
            >
              <Text style={[styles.showBtnText, showOnly === val && styles.showBtnTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── BADGE COUNT ── */}
        <Text style={styles.badgeCount}>
          Showing {filtered.length} badge{filtered.length !== 1 ? 's' : ''}
        </Text>

        {/* ── BADGE GRID ── */}
        {rows.length > 0 ? (
          rows.map((row, i) => (
            <View key={i} style={styles.badgeRow}>
              {row.map(badge => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  unlocked={badge.unlocked}
                  progress={badge.unlocked ? null : getProgress(badge, stats)}
                />
              ))}
              {/* Fill empty slot if row has only 1 badge */}
              {row.length === 1 && <View style={styles.badgeCardEmpty} />}
            </View>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No badges found</Text>
            <Text style={styles.emptySub}>Try changing your filter</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 14, paddingTop: 16 },

  // Header
  header: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white, marginBottom: 4 },
  headerSub:   { fontSize: 12, color: COLORS.gray },

  // Summary stats
  statsRow: {
    flexDirection: 'row', gap: 10,
  },
  statBox: {
    flex: 1, backgroundColor: COLORS.card,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, alignItems: 'center', gap: 4,
  },
  statVal:   { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  // XP Progress
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 10,
  },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpHeaderLabel: { fontSize: 11, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5 },
  xpHeaderVal:   { fontSize: 11, color: COLORS.gold, fontWeight: '700' },
  xpBarBg: {
    height: 10, backgroundColor: COLORS.border,
    borderRadius: 50, overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%', borderRadius: 50,
    backgroundColor: COLORS.gold,
  },
  xpBarLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  xpBarLabel:  { fontSize: 8, color: COLORS.gray, fontWeight: '700' },

  // Category filter
  categoryScroll: { gap: 8, paddingRight: 16 },
  catBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 50, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  catBtnActive: {
    backgroundColor: '#2A1F00',
    borderColor: COLORS.gold + '66',
  },
  catBtnText:       { fontSize: 12, fontWeight: '700', color: COLORS.gray },
  catBtnTextActive: { color: COLORS.gold },

  // Show filter
  showFilter: {
    flexDirection: 'row', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 50,
    padding: 4, borderWidth: 1, borderColor: COLORS.border,
  },
  showBtn: {
    flex: 1, paddingVertical: 8,
    borderRadius: 50, borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center',
  },
  showBtnActive: {
    backgroundColor: '#0d2b1e',
    borderColor: COLORS.green + '40',
  },
  showBtnText:       { fontSize: 11, fontWeight: '700', color: COLORS.gray },
  showBtnTextActive: { color: COLORS.green },

  // Badge count
  badgeCount: { fontSize: 12, color: COLORS.gray, textAlign: 'center' },

  // Badge grid
  badgeRow: { flexDirection: 'row', gap: 12 },

  // Badge card
  badgeCard: {
    width: CARD_WIDTH, borderRadius: 16,
    borderWidth: 1.5, padding: 16,
    alignItems: 'center', gap: 8,
    position: 'relative', overflow: 'hidden',
  },
  badgeCardEmpty: { width: CARD_WIDTH },

  rarityTag: {
    position: 'absolute', top: 10, right: 10,
    borderRadius: 50, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  rarityText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  lockOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, zIndex: 2,
  },
  lockEmoji: { fontSize: 22, opacity: 0.4 },

  badgeIcon:       { fontSize: 40, marginTop: 8 },
  badgeIconLocked: { fontSize: 32, opacity: 0.4 },

  badgeTitle: { fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 16 },
  badgeDesc:  { fontSize: 10, textAlign: 'center', lineHeight: 14 },

  xpBadge: {
    borderRadius: 50, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  xpText: { fontSize: 10, fontWeight: '800' },

  progressContainer: { width: '100%', gap: 4 },
  progressBg: {
    height: 3, backgroundColor: '#2A2A2A',
    borderRadius: 50, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 50,
    backgroundColor: COLORS.gold + '66',
  },
  progressText: { fontSize: 9, color: '#444', fontWeight: '700', textAlign: 'center' },

  // Empty state
  emptyBox: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 40, alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  emptyIcon:  { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  emptySub:   { fontSize: 13, color: COLORS.gray },
});