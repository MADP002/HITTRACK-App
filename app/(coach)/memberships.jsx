import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import {
  computeMembershipState, daysRemaining, fmtExpiry, fmtRemaining,
  isExpiringSoon, getStatusColor, getStatusLabel, getStatusIcon, STATUS,
} from '../../lib/membership';
import { C } from '../../lib/theme';

// Coach membership view — SAME visibility as admin (see who expires + trial),
// but LESS power: coaches can only send a renewal Remind. Extend/Pause are
// admin-only (mirrors the web CoachDashboard Memberships tab).
export default function CoachMembershipsScreen() {
  const router = useRouter();
  const [members, setMembers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [searchQ, setSearchQ]         = useState('');
  const [coachProfile, setCoachProfile] = useState({ name: 'Coach' });
  const [reminded, setReminded]       = useState({});

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(s => { if (s.exists()) setCoachProfile(s.data()); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.role === 'member' && data.name) list.push({ uid: d.id, ...data });
      });
      setMembers(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sendReminder = async (m) => {
    if (reminded[m.uid]) { Alert.alert('Already reminded', 'You already nudged this member this session.'); return; }
    try {
      const days = daysRemaining(m.membership);
      const dayLabel = days === null ? 'soon'
        : days < 0  ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
        : days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`;
      await addDoc(collection(db, 'notifications'), {
        type: 'membership_reminder',
        title: days < 0 ? '🔒 Membership has expired' : '⚠ Membership renewal reminder',
        message: days < 0
          ? `Your membership expired ${dayLabel}. Speak with the gym admin to renew and unlock class bookings.`
          : `Your membership expires ${dayLabel}. Please coordinate with the gym admin to renew before access is locked.`,
        audience: 'member', targetUserId: m.uid,
        from: coachProfile.name || 'Coach', fromUid: auth.currentUser?.uid || '', createdAt: serverTimestamp(),
      });
      setReminded(prev => ({ ...prev, [m.uid]: true }));
      Alert.alert('Reminder sent', `Nudged ${m.name} to renew.`);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const active   = members.filter(x => computeMembershipState(x.membership) === STATUS.ACTIVE).length;
  const trial    = members.filter(x => computeMembershipState(x.membership) === STATUS.TRIAL).length;
  const expired  = members.filter(x => computeMembershipState(x.membership) === STATUS.EXPIRED).length;
  const paused   = members.filter(x => computeMembershipState(x.membership) === STATUS.PAUSED).length;
  const expiring = members.filter(x => {
    const st = computeMembershipState(x.membership);
    if (st !== STATUS.ACTIVE && st !== STATUS.TRIAL) return false;
    const d = daysRemaining(x.membership);
    return d !== null && d >= 0 && d <= 7;
  }).length;
  const stats = [
    { label: 'Active', val: active, color: C.green }, { label: 'Trial', val: trial, color: C.blue },
    { label: 'Expiring', val: expiring, color: C.gold }, { label: 'Expired', val: expired, color: C.red },
    { label: 'Paused', val: paused, color: C.gray },
  ];

  const rank = { expired: 0, active: 1, trial: 2, paused: 3, legacy: 4, none: 5 };
  const filtered = members.filter(m => !searchQ || m.name?.toLowerCase().includes(searchQ.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const ra = rank[computeMembershipState(a.membership)] ?? 9;
    const rb = rank[computeMembershipState(b.membership)] ?? 9;
    if (ra !== rb) return ra - rb;
    return (daysRemaining(a.membership) ?? 9999) - (daysRemaining(b.membership) ?? 9999);
  });

  if (loading) {
    return <SafeAreaView edges={['top']} style={s.safe}><View style={s.center}><ActivityIndicator size="large" color={C.blue} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>💳 Memberships</Text>
          <Text style={s.headerSub}>See expiries · send renewal reminders</Text>
        </View>
        <View style={s.coachPill}><Text style={s.coachPillText}>VIEW + REMIND</Text></View>
      </View>

      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.gray} />
          <TextInput style={s.searchInput} placeholder="Search members..." placeholderTextColor={C.gray}
            value={searchQ} onChangeText={setSearchQ} autoCapitalize="none" autoCorrect={false} />
          {searchQ.length > 0 && <TouchableOpacity onPress={() => setSearchQ('')}><Ionicons name="close-circle" size={16} color={C.gray} /></TouchableOpacity>}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.blue} />}>
        <View style={s.statRow}>
          {stats.map((st, i) => (
            <View key={i} style={[s.statCell, { borderColor: st.color + '33', backgroundColor: st.color + '10' }]}>
              <Text style={[s.statVal, { color: st.color }]}>{st.val}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {sorted.length === 0 ? (
          <View style={s.emptyBox}><Text style={{ fontSize: 40 }}>💳</Text><Text style={s.emptyTitle}>No members found</Text></View>
        ) : sorted.map(m => {
          const state    = computeMembershipState(m.membership);
          const col      = getStatusColor(state);
          const isPaused = state === STATUS.PAUSED;
          const expiringSoon = isExpiringSoon(m.membership);
          const isExpired = state === STATUS.EXPIRED;
          const wasReminded = !!reminded[m.uid];
          return (
            <View key={m.uid} style={[s.row, { borderColor: col + '33' }]}>
              <View style={[s.accent, { backgroundColor: col }]} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={s.name} numberOfLines={1}>{m.name}</Text>
                  <View style={[s.chip, { backgroundColor: col + '22', borderColor: col + '44' }]}>
                    <Text style={[s.chipText, { color: col }]}>{getStatusIcon(state)} {getStatusLabel(state)}</Text>
                  </View>
                </View>
                <Text style={s.expiry}>
                  {isPaused ? '⏸ Paused — expiry frozen'
                    : m.membership?.expiresAt ? `${fmtRemaining(m.membership)} · expires ${fmtExpiry(m.membership)}`
                    : 'No active plan'}
                </Text>
              </View>
              {(isExpired || expiringSoon) && (
                <TouchableOpacity style={[s.remindBtn, { backgroundColor: wasReminded ? C.inputBg : C.blue + '18', borderColor: wasReminded ? C.border : C.blue + '44' }]}
                  onPress={() => sendReminder(m)} disabled={wasReminded}>
                  <Text style={[s.remindText, { color: wasReminded ? C.gray : C.blue }]}>{wasReminded ? '✓ Sent' : '📣 Remind'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: C.white },
  headerSub:   { fontSize: 11, color: C.gray, marginTop: 2 },
  coachPill:   { backgroundColor: C.blue + '18', borderRadius: 50, borderWidth: 1, borderColor: C.blue + '44', paddingHorizontal: 10, paddingVertical: 4 },
  coachPillText: { fontSize: 8, fontWeight: '800', color: C.blue, letterSpacing: 0.6 },

  searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statCell: { flexGrow: 1, flexBasis: '17%', borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 8, color: C.gray, fontWeight: '800', letterSpacing: 0.6, marginTop: 2, textTransform: 'uppercase' },

  row:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, padding: 14, paddingLeft: 16, overflow: 'hidden', position: 'relative' },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  name:   { fontSize: 14, fontWeight: '800', color: C.white },
  chip:   { borderRadius: 50, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 9, fontWeight: '700' },
  expiry: { fontSize: 11, color: C.gray },
  remindBtn: { borderRadius: 50, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  remindText: { fontSize: 11, fontWeight: '800' },

  emptyBox:  { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyTitle:{ fontSize: 16, fontWeight: '800', color: C.white },
});
