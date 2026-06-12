import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
   ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { isClassActive } from '../../lib/classLifecycle';

const C = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  blue: '#42a5f5', white: '#FFFFFF', gray: '#888888',
  green: '#4ade80', gold: '#F5C842', red: '#E63946',
  inputBg: '#1E1E1E', lightGray: '#CCCCCC', purple: '#c084fc',
};

const LEVEL_COLORS = { Beginner: '#fb923c', Intermediate: '#F5C842', Advanced: '#4ade80' };
const LEVEL_ICONS  = { Beginner: '🥊', Intermediate: '⚡', Advanced: '🔥' };

export default function CoachHomeScreen() {
  const router = useRouter();

  const [coachProfile, setCoachProfile] = useState({ name: 'Coach' });
  const [members,      setMembers]      = useState([]);
  const [classes,      setClasses]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [activity,     setActivity]     = useState([]);

  // Load coach profile
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(s => { if (s.exists()) setCoachProfile(s.data()); })
      .catch(console.error);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [usersSnap, classesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'classes')),
      ]);

      const mems = [];
      for (const d of usersSnap.docs) {
        const data = d.data();
        if (data.role !== 'member' || !data.name) continue;
        let stats = {};
        try {
          const ss = await getDoc(doc(db, 'stats', d.id));
          if (ss.exists()) stats = ss.data();
        } catch (_) {}
        mems.push({ uid: d.id, ...data, ...stats });
      }
      setMembers(mems);

      const allClasses = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClasses(allClasses);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  // Live activity feed (recent 5)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'activity'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 5);
      setActivity(items);
    }, console.error);
    return () => unsub();
  }, []);

  const handleLogout = () => {
    Alert.alert('Log Out?', 'Sign out of Coach Portal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => { await signOut(auth); router.replace('/(auth)/login'); },
      },
    ]);
  };

  const activeClasses  = classes.filter(isClassActive);
  const needAttention  = members.filter(m => !(m.totalWorkouts || 0));
  const recentMembers  = [...members]
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.blue} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <View>
          <Text style={s.brand}>HIT<Text style={{ color: C.blue }}>TRACK</Text></Text>
          <View style={s.coachBadge}>
            <Text style={s.coachBadgeText}>COACH PORTAL</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.blue} />
        }
      >
        {/* ── WELCOME ── */}
        <View style={s.welcomeCard}>
          <View style={[s.welcomeAccent, { backgroundColor: C.blue }]} />
          <Text style={s.welcomeGreeting}>{greeting},</Text>
          <Text style={s.welcomeName}>{coachProfile.name} 🥊</Text>
          <Text style={s.welcomeSub}>Here's what's happening in your gym today.</Text>
        </View>

        {/* ── STAT CARDS ── */}
        <View style={s.statsRow}>
          {[
            { icon: '👥', label: 'Members',    value: members.length,       color: C.gold  },
            { icon: '📋', label: 'Classes',    value: activeClasses.length, color: C.blue  },
            { icon: '⚠️', label: 'No Workouts', value: needAttention.length, color: C.red   },
          ].map((st, i) => (
            <View key={i} style={[s.statCard, { borderColor: st.color + '33' }]}>
              <Text style={{ fontSize: 22 }}>{st.icon}</Text>
              <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* ── QUICK ACTIONS ── */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.actionsGrid}>
          {[
            { icon: 'people-outline',   label: 'View Clients',       color: C.blue,   route: '/(coach)/clients'       },
            { icon: 'calendar-outline', label: 'Manage Classes',     color: C.gold,   route: '/(coach)/classes'       },
            { icon: 'megaphone-outline',label: 'Announcements',      color: C.green,  route: '/(coach)/announcements' },
            { icon: 'chatbubbles-outline', label: 'Inbox',           color: C.purple, route: '/(coach)/forum'         },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              style={[s.actionBtn, { borderColor: action.color + '44' }]}
              onPress={() => router.push(action.route)}
              activeOpacity={0.8}
            >
              <View style={[s.actionIcon, { backgroundColor: action.color + '22' }]}>
                <Ionicons name={action.icon} size={22} color={action.color} />
              </View>
              <Text style={[s.actionLabel, { color: action.color }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── RECENT MEMBERS ── */}
        {recentMembers.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Recent Members</Text>
              <TouchableOpacity onPress={() => router.push('/(coach)/clients')}>
                <Text style={s.seeAll}>See all →</Text>
              </TouchableOpacity>
            </View>
            <View style={s.card}>
              {recentMembers.map((m, i) => {
                const lc = LEVEL_COLORS[m.experience] || C.gold;
                const li = LEVEL_ICONS[m.experience]  || '🥊';
                return (
                  <TouchableOpacity
                    key={m.uid}
                    style={[s.memberRow, i < recentMembers.length - 1 && s.memberRowBorder]}
                    onPress={() => router.push({ pathname: '/(coach)/member-detail', params: { uid: m.uid } })}
                    activeOpacity={0.8}
                  >
                    <View style={[s.memberAvatar, { borderColor: lc, backgroundColor: lc + '22' }]}>
                      <Text style={[s.memberAvatarText, { color: lc }]}>{(m.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={s.memberInfo}>
                      <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
                      <Text style={s.memberMeta}>{li} {m.experience || 'Beginner'} · 🎯 {m.goal || 'Learn Boxing'}</Text>
                    </View>
                    <View style={s.memberStats}>
                      <Text style={[s.memberStat, { color: C.gold }]}>{m.totalWorkouts || 0}🥊</Text>
                      <Text style={[s.memberStat, { color: C.red }]}>🔥{m.streak || 0}d</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={C.gray} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── ACTIVE CLASSES ── */}
        {activeClasses.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Active Classes</Text>
              <TouchableOpacity onPress={() => router.push('/(coach)/classes')}>
                <Text style={s.seeAll}>See all →</Text>
              </TouchableOpacity>
            </View>
            <View style={s.card}>
              {activeClasses.slice(0, 3).map((cls, i) => {
                const lc = LEVEL_COLORS[cls.level] || C.gold;
                return (
                  <View
                    key={cls.id}
                    style={[s.classRow, i < Math.min(activeClasses.length, 3) - 1 && s.memberRowBorder]}
                  >
                    <View style={[s.classDayBadge, { backgroundColor: lc + '22', borderColor: lc + '44' }]}>
                      <Text style={[s.classDayText, { color: lc }]}>{(cls.day || '').slice(0, 3).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.className} numberOfLines={1}>{cls.name}</Text>
                      <Text style={s.classMeta}>{cls.time} · {cls.level}</Text>
                    </View>
                    <View style={s.classEnroll}>
                      <Text style={[s.classEnrollNum, { color: lc }]}>{cls.enrolled || 0}</Text>
                      <Text style={s.classEnrollMax}>/{cls.spots}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── NEED ATTENTION ── */}
        {needAttention.length > 0 && (
          <>
            <Text style={s.sectionTitle}>⚠️ Need Attention</Text>
            <View style={[s.card, { borderColor: C.red + '33' }]}>
              <Text style={s.attentionDesc}>
                {needAttention.length} member{needAttention.length !== 1 ? 's have' : ' has'} not completed any workouts yet.
              </Text>
              <TouchableOpacity
                style={s.attentionBtn}
                onPress={() => router.push('/(coach)/clients')}
                activeOpacity={0.85}
              >
                <Text style={s.attentionBtnText}>View Members →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 14 },

  // Top bar
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  brand:         { fontSize: 22, fontWeight: '900', color: C.white },
  coachBadge:    { backgroundColor: C.blue + '22', borderRadius: 50, borderWidth: 1, borderColor: C.blue + '44', paddingHorizontal: 10, paddingVertical: 2, marginTop: 3, alignSelf: 'flex-start' },
  coachBadgeText:{ fontSize: 9, fontWeight: '800', color: C.blue, letterSpacing: 1 },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.red + '18', borderRadius: 50, borderWidth: 1, borderColor: C.red + '44', paddingHorizontal: 14, paddingVertical: 8 },
  logoutBtnText: { fontSize: 12, fontWeight: '700', color: C.red },

  // Welcome card
  welcomeCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: C.blue + '33', overflow: 'hidden',
    marginTop: 14,
  },
  welcomeAccent:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  welcomeGreeting:{ fontSize: 13, color: C.gray, marginBottom: 2 },
  welcomeName:    { fontSize: 24, fontWeight: '900', color: C.white, marginBottom: 6 },
  welcomeSub:     { fontSize: 13, color: C.gray },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 6,
  },
  statVal:   { fontSize: 28, fontWeight: '900' },
  statLabel: { fontSize: 10, color: C.gray, fontWeight: '700', textAlign: 'center' },

  // Section headings
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.white },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seeAll:       { fontSize: 13, color: C.blue, fontWeight: '700' },

  // Quick actions
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: {
    width: '47.5%', backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, padding: 16, alignItems: 'center', gap: 10,
  },
  actionIcon:  { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // Card
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },

  // Member rows
  memberRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  memberAvatar:    { width: 40, height: 40, borderRadius: 20, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  memberAvatarText:{ fontSize: 16, fontWeight: '900' },
  memberInfo:      { flex: 1 },
  memberName:      { fontSize: 13, fontWeight: '700', color: C.white },
  memberMeta:      { fontSize: 11, color: C.gray, marginTop: 2 },
  memberStats:     { alignItems: 'flex-end', gap: 2 },
  memberStat:      { fontSize: 11, fontWeight: '700' },

  // Class rows
  classRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  classDayBadge:  { width: 46, height: 46, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  classDayText:   { fontSize: 12, fontWeight: '900' },
  className:      { fontSize: 13, fontWeight: '700', color: C.white },
  classMeta:      { fontSize: 11, color: C.gray, marginTop: 2 },
  classEnroll:    { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  classEnrollNum: { fontSize: 18, fontWeight: '900' },
  classEnrollMax: { fontSize: 11, color: C.gray },

  // Attention
  attentionDesc: { fontSize: 13, color: C.gray, lineHeight: 20, padding: 16, paddingBottom: 12 },
  attentionBtn: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: C.red,
    borderRadius: 12, height: 44, justifyContent: 'center', alignItems: 'center',
  },
  attentionBtnText: { fontSize: 14, fontWeight: '800', color: C.white },
});