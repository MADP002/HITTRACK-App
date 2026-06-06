import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  blue: '#42a5f5', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842', red: '#E63946',
};
const LEVEL_COLORS = { Beginner:'#fb923c', Intermediate:'#F5C842', Advanced:'#4ade80' };
const LEVEL_ICONS  = { Beginner:'🥊', Intermediate:'⚡', Advanced:'🔥' };

export default function ClientsScreen() {
  const router = useRouter();
  const [members,      setMembers]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [searchQ,      setSearchQ]      = useState('');
  const [coachProfile, setCoachProfile] = useState({ name: 'Coach' });

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(s => { if (s.exists()) setCoachProfile(s.data()); })
      .catch(console.error);
  }, []);

  const loadMembers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.role !== 'member' || !data.name) continue;
        let stats = {};
        try {
          const ss = await getDoc(doc(db, 'stats', d.id));
          if (ss.exists()) stats = ss.data();
        } catch (_) {}
        list.push({ uid: d.id, ...data, ...stats });
      }
      setMembers(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadMembers(); }, []);

  const filtered = members.filter(m =>
    !searchQ || m.name?.toLowerCase().includes(searchQ.toLowerCase())
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.blue} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.coachBackBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>👥 Clients</Text>
          <Text style={styles.headerSub}>Welcome, {coachProfile.name}</Text>
        </View>
        <View style={styles.portalBadge}>
          <Text style={styles.portalBadgeText}>COACH</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={COLORS.gray} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search members..."
            placeholderTextColor={COLORS.gray}
            value={searchQ}
            onChangeText={setSearchQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQ.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQ('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={styles.countText}>{filtered.length} member{filtered.length !== 1 ? 's' : ''}</Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMembers(); }} tintColor={COLORS.blue} />
        }
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 48 }}>👥</Text>
            <Text style={styles.emptyTitle}>No members found</Text>
            <Text style={styles.emptySub}>{searchQ ? 'Try a different search' : 'No members have signed up yet'}</Text>
          </View>
        ) : (
          filtered.map(m => {
            const lc = LEVEL_COLORS[m.experience] || COLORS.gold;
            const li = LEVEL_ICONS[m.experience]  || '🥊';
            return (
              <TouchableOpacity
                key={m.uid}
                style={styles.memberCard}
                onPress={() => router.push({ pathname: '/(coach)/member-detail', params: { uid: m.uid } })}
                activeOpacity={0.8}
              >
                <View style={[styles.cardAccent, { backgroundColor: lc }]} />

                {/* Avatar */}
                <View style={[styles.avatar, { borderColor: lc, backgroundColor: lc + '22' }]}>
                  <Text style={[styles.avatarText, { color: lc }]}>{(m.name||'?')[0].toUpperCase()}</Text>
                  <View style={[styles.levelBadge, { backgroundColor: lc }]}>
                    <Text style={{ fontSize: 8 }}>{li}</Text>
                  </View>
                </View>

                {/* Info */}
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={1}>{m.name}</Text>
                  <View style={styles.tagRow}>
                    <View style={[styles.tag, { backgroundColor: lc + '22', borderColor: lc + '55' }]}>
                      <Text style={[styles.tagText, { color: lc }]}>{m.experience || 'Beginner'}</Text>
                    </View>
                    {m.goal && (
                      <View style={[styles.tag, { backgroundColor: '#111100', borderColor: '#222200' }]}>
                        <Text style={[styles.tagText, { color: COLORS.gold }]} numberOfLines={1}>🎯 {m.goal}</Text>
                      </View>
                    )}
                    {/* Medical condition indicator — only shown if member reported an injury */}
                    {m.injuries && m.injuries.length > 0 && (
                      <View style={[styles.tag, { backgroundColor: '#1A0505', borderColor: COLORS.red + '55' }]}>
                        <Text style={[styles.tagText, { color: COLORS.red }]}>⚠️ Medical</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Stats */}
                <View style={styles.cardStats}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statVal, { color: COLORS.gold }]}>{m.totalWorkouts || 0}</Text>
                    <Text style={styles.statIcon}>🥊</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statVal, { color: (m.streak||0) > 0 ? COLORS.red : COLORS.gray }]}>
                      {m.streak || 0}d
                    </Text>
                    <Text style={styles.statIcon}>🔥</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statVal, { color: COLORS.green }]}>{m.weeklyPct || 0}%</Text>
                    <Text style={styles.statIcon}>📅</Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={16} color={COLORS.gray} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white },
  headerSub:   { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  portalBadge: {
    backgroundColor: COLORS.blue + '22', borderRadius: 50,
    borderWidth: 1, borderColor: COLORS.blue + '44',
    paddingHorizontal: 12, paddingVertical: 4,
  },
  portalBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.blue, letterSpacing: 1 },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 46,
  },
  searchInput: { flex: 1, color: COLORS.white, fontSize: 14 },
  countText: { paddingHorizontal: 16, fontSize: 12, color: COLORS.gray, marginBottom: 8 },
  scroll:    { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  emptyBox:  { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyTitle:{ fontSize: 18, fontWeight: '800', color: COLORS.white },
  emptySub:  { fontSize: 13, color: COLORS.gray },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 14, overflow: 'hidden', position: 'relative',
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  avatarText: { fontSize: 18, fontWeight: '900' },
  levelBadge: {
    position: 'absolute', bottom: -2, right: -4,
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  cardInfo:  { flex: 1, gap: 4, minWidth: 0 },
  cardName:  { fontSize: 14, fontWeight: '800', color: COLORS.white },
  tagRow:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: {
    borderRadius: 50, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tagText: { fontSize: 9, fontWeight: '700' },
  cardStats: { gap: 4, alignItems: 'flex-end' },
  statItem:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statVal:   { fontSize: 12, fontWeight: '800' },
  statIcon:  { fontSize: 11 },

  coachBackBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#2A2A2A',
    justifyContent: 'center', alignItems: 'center',
  },});