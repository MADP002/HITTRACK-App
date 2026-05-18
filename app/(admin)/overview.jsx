import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { isClassActive } from '../../lib/classLifecycle';
import { ACTIVITY_TYPES } from '../../lib/activityLog';

const C = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  green: '#4ade80', gold: '#F5C842', blue: '#42a5f5',
  purple: '#c084fc', inputBg: '#1E1E1E', lightGray: '#CCCCCC',
};
const LEVEL_COLORS = { Beginner: '#fb923c', Intermediate: '#F5C842', Advanced: '#4ade80' };
const LEVEL_ICONS  = { Beginner: '🥊', Intermediate: '⚡', Advanced: '🔥' };
const GOAL_COLORS  = { 'Learn Boxing': '#F5C842', 'Lose Weight': '#42a5f5', 'Build Strength': '#4ade80', 'Compete': '#c084fc' };
const GOAL_ICONS   = { 'Learn Boxing': '🥊', 'Lose Weight': '⚡', 'Build Strength': '💪', 'Compete': '🏆' };

function formatRelTime(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AdminOverviewScreen() {
  const router = useRouter();
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members,    setMembers]    = useState([]);
  const [coaches,    setCoaches]    = useState([]);
  const [classes,    setClasses]    = useState([]);
  const [activity,   setActivity]   = useState([]);
  const [adminName,  setAdminName]  = useState('Admin');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(s => { if (s.exists()) setAdminName(s.data().name || 'Admin'); })
      .catch(console.error);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const mems = [], coachs = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.role === 'member') {
          let stats = {};
          try { const ss = await getDoc(doc(db, 'stats', d.id)); if (ss.exists()) stats = ss.data(); } catch (_) {}
          mems.push({ uid: d.id, ...data, ...stats });
        } else if (data.role === 'coach' || data.role === 'coach_pending') {
          coachs.push({ uid: d.id, ...data });
        }
      }
      setMembers(mems);
      setCoaches(coachs);
      const clsSnap = await getDocs(collection(db, 'classes'));
      setClasses(clsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  // Live activity feed
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'activity'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setActivity(items.slice(0, 8));
    }, console.error);
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    Alert.alert('Log Out?', 'Sign out of the Admin Portal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await signOut(auth); router.replace('/(auth)/login'); } },
    ]);
  };

  const activeClasses = classes.filter(isClassActive);
  const totalMembers  = members.length;
  const workedOut     = members.filter(m => (m.totalWorkouts || 0) > 0).length;
  const inactive      = members.filter(m => m.status === 'inactive').length;
  const approvedCoaches = coaches.filter(c => c.role === 'coach').length;

  // Distribution data
  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  const goals  = ['Learn Boxing', 'Lose Weight', 'Build Strength', 'Compete'];
  const levelCounts = levels.map(l => ({ level: l, count: members.filter(m => (m.experience || 'Beginner') === l).length }));
  const goalCounts  = goals.map(g  => ({ goal: g,  count: members.filter(m => m.goal === g).length }));
  const maxLevel    = Math.max(...levelCounts.map(l => l.count), 1);
  const maxGoal     = Math.max(...goalCounts.map(g => g.count), 1);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <View>
          <Text style={s.topBarBrand}>HIT<Text style={{ color: C.red }}>TRACK</Text></Text>
          <View style={s.adminBadge}>
            <Text style={s.adminBadgeText}>ADMIN PORTAL</Text>
          </View>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={16} color={C.red} />
          <Text style={s.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.red} />
        }
      >
        <Text style={s.welcomeText}>Welcome back, {adminName}</Text>

        {/* ── STAT CARDS — 2+3 grid ── */}
        <View style={s.statsGrid2}>
          {[
            { icon: '👥', label: 'Total Members', value: totalMembers, color: C.gold   },
            { icon: '⚡', label: 'Have Workouts',  value: workedOut,    color: C.green  },
          ].map((stat, i) => (
            <View key={i} style={[s.statCard, { borderColor: stat.color + '33' }]}>
              <Text style={{ fontSize: 24 }}>{stat.icon}</Text>
              <Text style={[s.statVal, { color: stat.color }]}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        <View style={s.statsGrid3}>
          {[
            { icon: '⛔', label: 'Inactive',  value: inactive,       color: C.red    },
            { icon: '📋', label: 'Classes',   value: activeClasses.length, color: C.blue   },
            { icon: '🥊', label: 'Coaches',   value: approvedCoaches, color: C.purple  },
          ].map((stat, i) => (
            <View key={i} style={[s.statCardSm, { borderColor: stat.color + '33' }]}>
              <Text style={{ fontSize: 20 }}>{stat.icon}</Text>
              <Text style={[s.statValSm, { color: stat.color }]}>{stat.value}</Text>
              <Text style={s.statLabelSm}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── LEVEL DISTRIBUTION ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📊 Level Distribution</Text>
          {levelCounts.map(({ level, count }) => {
            const lc = LEVEL_COLORS[level] || C.gold;
            const pct = members.length > 0 ? Math.round((count / members.length) * 100) : 0;
            const barW = maxLevel > 0 ? (count / maxLevel) * 100 : 0;
            return (
              <View key={level} style={s.distRow}>
                <View style={s.distLeft}>
                  <Text style={{ fontSize: 18 }}>{LEVEL_ICONS[level]}</Text>
                  <View>
                    <Text style={s.distLabel}>{level}</Text>
                    <Text style={[s.distPct, { color: lc }]}>{pct}% of gym</Text>
                  </View>
                </View>
                <View style={s.distBarWrap}>
                  <View style={[s.distBarFill, { width: `${barW}%`, backgroundColor: lc }]} />
                </View>
                <Text style={[s.distCount, { color: lc }]}>{count}</Text>
              </View>
            );
          })}
        </View>

        {/* ── GOAL DISTRIBUTION ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>🎯 Goal Distribution</Text>
          {goalCounts.map(({ goal, count }) => {
            const gc = GOAL_COLORS[goal] || C.gold;
            const pct = members.length > 0 ? Math.round((count / members.length) * 100) : 0;
            const barW = maxGoal > 0 ? (count / maxGoal) * 100 : 0;
            return (
              <View key={goal} style={s.distRow}>
                <View style={s.distLeft}>
                  <Text style={{ fontSize: 18 }}>{GOAL_ICONS[goal]}</Text>
                  <View>
                    <Text style={s.distLabel}>{goal}</Text>
                    <Text style={[s.distPct, { color: gc }]}>{pct}%</Text>
                  </View>
                </View>
                <View style={s.distBarWrap}>
                  <View style={[s.distBarFill, { width: `${barW}%`, backgroundColor: gc }]} />
                </View>
                <Text style={[s.distCount, { color: gc }]}>{count}</Text>
              </View>
            );
          })}
        </View>

        {/* ── RECENT ACTIVITY ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>⚡ Live Activity</Text>
          {activity.length === 0 ? (
            <Text style={s.emptyText}>No activity yet</Text>
          ) : (
            activity.slice(0, 5).map(ev => {
              const t  = ACTIVITY_TYPES[ev.type] || { icon: '⚡', color: C.gray, label: 'Event' };
              const ts = ev.createdAt?.seconds ? new Date(ev.createdAt.seconds * 1000) : null;
              return (
                <View key={ev.id} style={[s.actRow, { borderLeftColor: t.color }]}>
                  <View style={[s.actIcon, { backgroundColor: t.color + '22' }]}>
                    <Text style={{ fontSize: 14 }}>{t.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.actDesc} numberOfLines={2}>{ev.description}</Text>
                    <Text style={s.actTime}>{ts ? formatRelTime(ts) : ''}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 14 },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  topBarBrand:   { fontSize: 22, fontWeight: '900', color: C.white },
  adminBadge:    { backgroundColor: C.red + '22', borderRadius: 50, borderWidth: 1, borderColor: C.red + '44', paddingHorizontal: 10, paddingVertical: 2, marginTop: 3, alignSelf: 'flex-start' },
  adminBadgeText:{ fontSize: 9, fontWeight: '800', color: C.red, letterSpacing: 1 },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.red + '18', borderRadius: 50, borderWidth: 1, borderColor: C.red + '44', paddingHorizontal: 14, paddingVertical: 8 },
  logoutBtnText: { fontSize: 12, fontWeight: '700', color: C.red },

  welcomeText: { fontSize: 13, color: C.gray, paddingTop: 14, paddingBottom: 2 },

  // Stat cards
  statsGrid2: { flexDirection: 'row', gap: 10 },
  statsGrid3: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    padding: 16, alignItems: 'center', gap: 6,
  },
  statVal:   { fontSize: 32, fontWeight: '900' },
  statLabel: { fontSize: 11, color: C.gray, fontWeight: '700', textAlign: 'center' },
  statCardSm: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
    padding: 12, alignItems: 'center', gap: 4,
  },
  statValSm:   { fontSize: 24, fontWeight: '900' },
  statLabelSm: { fontSize: 9, color: C.gray, fontWeight: '700', textAlign: 'center' },

  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.border, gap: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.white },

  // Distribution bars
  distRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  distLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, width: 130 },
  distLabel:  { fontSize: 12, fontWeight: '700', color: C.white },
  distPct:    { fontSize: 10, fontWeight: '600' },
  distBarWrap:{ flex: 1, height: 8, backgroundColor: C.border, borderRadius: 50, overflow: 'hidden' },
  distBarFill:{ height: '100%', borderRadius: 50 },
  distCount:  { fontSize: 18, fontWeight: '900', minWidth: 28, textAlign: 'right' },

  // Activity
  actRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderLeftWidth: 3, paddingLeft: 10 },
  actIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  actDesc: { fontSize: 12, color: C.lightGray, lineHeight: 18 },
  actTime: { fontSize: 9, color: C.gray, marginTop: 2 },
  emptyText: { fontSize: 12, color: C.gray, textAlign: 'center', paddingVertical: 16 },
});