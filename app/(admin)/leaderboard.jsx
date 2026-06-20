import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet,  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

const C = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  green: '#4ade80', gold: '#F5C842', blue: '#42a5f5',
  purple: '#c084fc', inputBg: '#1E1E1E', lightGray: '#CCCCCC',
};
const LEVEL_COLORS = { Beginner: '#fb923c', Intermediate: '#F5C842', Advanced: '#4ade80' };
const LEVEL_ICONS  = { Beginner: '🥊', Intermediate: '⚡', Advanced: '🔥' };
const LEVEL_BONUS  = { Beginner: 0, Intermediate: 150, Advanced: 350 };
const PODIUM_COLORS = ['#F5C842', '#C0C0C0', '#CD7F32'];
const MEDALS        = ['🥇', '🥈', '🥉'];
const LEVELS        = ['All Levels', 'Beginner', 'Intermediate', 'Advanced'];
const GOALS         = ['All Goals', 'Learn Boxing', 'Lose Weight', 'Build Strength', 'Compete'];

function calcScore(u) {
  return ((u.totalWorkouts || 0) * 10) + ((u.streak || 0) * 5) + (LEVEL_BONUS[u.experience] || 0) + Math.round((u.weeklyPct || 0) * 1.5);
}

export default function AdminLeaderboardScreen() {
  const [members,    setMembers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [levelFilter, setLevelFilter] = useState('All Levels');
  const [goalFilter,  setGoalFilter]  = useState('All Goals');
  const [searchQ,     setSearchQ]     = useState('');

  const loadMembers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.role !== 'member' || data.status === 'inactive') continue;
        let stats = {};
        try { const ss = await getDoc(doc(db, 'stats', d.id)); if (ss.exists()) stats = ss.data(); } catch (_) {}
        // data (users doc) spread LAST so it wins on key collisions
        list.push({ uid: d.id, ...stats, ...data });
      }
      setMembers(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Refetches every time this screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers])
  );

  const scored = [...members]
    .map(m => ({ ...m, score: calcScore(m) }))
    .sort((a, b) => b.score - a.score)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  const maxScore = scored[0]?.score || 1;

  const filtered = scored.filter(m => {
    if (levelFilter !== 'All Levels' && (m.experience || 'Beginner') !== levelFilter) return false;
    if (goalFilter  !== 'All Goals'  && m.goal !== goalFilter) return false;
    if (searchQ && !m.name?.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const top3 = filtered.slice(0, 3);

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
        <Text style={s.headerTitle}>🏆 Leaderboard</Text>
        <Text style={s.headerSub}>{filtered.length} of {scored.length} members</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMembers(); }} tintColor={C.red} />}
      >
        {/* Search */}
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.gray} />
          <TextInput
            style={s.searchInput}
            placeholder="Search member..."
            placeholderTextColor={C.gray}
            value={searchQ}
            onChangeText={setSearchQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQ.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQ('')}>
              <Ionicons name="close-circle" size={16} color={C.gray} />
            </TouchableOpacity>
          )}
        </View>

        {/* Level filter */}
        <View style={s.filterSection}>
          <Text style={s.filterLabel}>Level</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
            {LEVELS.map(l => {
              const active = levelFilter === l;
              const lc = LEVEL_COLORS[l] || C.red;
              return (
                <TouchableOpacity
                  key={l}
                  style={[s.filterChip, active && { backgroundColor: lc + '22', borderColor: lc + '66' }]}
                  onPress={() => setLevelFilter(l)}
                >
                  <Text style={[s.filterChipText, active && { color: lc }]}>
                    {l !== 'All Levels' && (LEVEL_ICONS[l] + ' ')}{l}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Goal filter */}
        <View style={s.filterSection}>
          <Text style={s.filterLabel}>Goal</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
            {GOALS.map((g, i) => {
              const goalColors = [C.gold, C.blue, C.red, C.green, C.purple];
              const gc     = goalColors[i] || C.gold;
              const active = goalFilter === g;
              return (
                <TouchableOpacity
                  key={g}
                  style={[s.filterChip, active && { backgroundColor: gc + '22', borderColor: gc + '66' }]}
                  onPress={() => setGoalFilter(g)}
                >
                  <Text style={[s.filterChipText, active && { color: gc }]}>{g}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Podium — top 3 */}
        {top3.length >= 3 && (
          <View style={s.podiumRow}>
            {[top3[1], top3[0], top3[2]].map((u, podiumIdx) => {
              const realRank   = podiumIdx === 1 ? 1 : podiumIdx === 0 ? 2 : 3;
              const lc         = LEVEL_COLORS[u.experience] || C.gold;
              const podiumColor = PODIUM_COLORS[realRank - 1];
              const isFirst    = realRank === 1;
              return (
                <View key={u.uid} style={[s.podiumCard, { borderColor: podiumColor + '55', transform: [{ translateY: isFirst ? -10 : 0 }] }]}>
                  <Text style={s.podiumMedal}>{MEDALS[realRank - 1]}</Text>
                  <View style={[s.podiumAvatar, { borderColor: podiumColor, backgroundColor: lc + '22', width: isFirst ? 58 : 46, height: isFirst ? 58 : 46, borderRadius: isFirst ? 29 : 23 }]}>
                    <Text style={[s.podiumAvatarText, { color: lc, fontSize: isFirst ? 24 : 18 }]}>{(u.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={[s.podiumName, { fontSize: isFirst ? 13 : 11 }]} numberOfLines={1}>{u.name}</Text>
                  <Text style={[s.podiumScore, { color: podiumColor, fontSize: isFirst ? 24 : 20 }]}>{u.score}</Text>
                  <Text style={s.podiumPts}>pts</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Full list */}
        <View style={s.listCard}>
          {/* Header */}
          <View style={s.listHeader}>
            <Text style={[s.listHeaderCell, { width: 44 }]}>RANK</Text>
            <Text style={[s.listHeaderCell, { flex: 1 }]}>MEMBER</Text>
            <Text style={[s.listHeaderCell, { width: 50 }]}>WKT</Text>
            <Text style={[s.listHeaderCell, { width: 60 }]}>STREAK</Text>
            <Text style={[s.listHeaderCell, { width: 60 }]}>SCORE</Text>
          </View>
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 36 }}>🔍</Text>
              <Text style={{ color: C.gray, fontSize: 13, marginTop: 8 }}>No members match this filter</Text>
            </View>
          ) : filtered.map((m, i) => {
            const lc         = LEVEL_COLORS[m.experience] || C.gold;
            const li         = LEVEL_ICONS[m.experience]  || '🥊';
            const podiumColor = m.rank <= 3 ? PODIUM_COLORS[m.rank - 1] : lc;
            const barW        = maxScore > 0 ? (m.score / maxScore) * 100 : 0;
            return (
              <View key={m.uid} style={[s.listRow, m.rank <= 3 && { backgroundColor: podiumColor + '08' }]}>
                <View style={[s.rankCell, { width: 44 }]}>
                  <Text style={[s.rankText, { color: m.rank <= 3 ? podiumColor : C.gray, fontSize: m.rank <= 3 ? 18 : 13 }]}>
                    {m.rank <= 3 ? MEDALS[m.rank - 1] : `#${m.rank}`}
                  </Text>
                </View>
                <View style={[s.memberCell, { flex: 1 }]}>
                  <View style={[s.miniAvatar, { borderColor: lc, backgroundColor: lc + '22' }]}>
                    <Text style={[s.miniAvatarText, { color: lc }]}>{(m.name || '?')[0].toUpperCase()}</Text>
                    <View style={[s.levelBadge, { backgroundColor: lc }]}>
                      <Text style={{ fontSize: 7 }}>{li}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberNameText} numberOfLines={1}>{m.name}</Text>
                    <Text style={s.memberGoalText} numberOfLines={1}>{m.goal || '—'}</Text>
                  </View>
                </View>
                <Text style={[s.dataCell, { width: 50, color: C.gold }]}>{m.totalWorkouts || 0}</Text>
                <Text style={[s.dataCell, { width: 60, color: (m.streak || 0) > 0 ? C.red : C.gray }]}>🔥{m.streak || 0}d</Text>
                <View style={{ width: 60, alignItems: 'flex-end', gap: 3 }}>
                  <Text style={[s.scoreText, { color: podiumColor }]}>{m.score}</Text>
                  <View style={s.scoreBarBg}>
                    <View style={[s.scoreBarFill, { width: `${barW}%`, backgroundColor: podiumColor }]} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.white },
  headerSub:   { fontSize: 12, color: C.gray },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 12, paddingTop: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },
  filterSection: { gap: 8 },
  filterLabel:   { fontSize: 10, color: C.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  filterRow:     { gap: 8 },
  filterChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  filterChipText:{ fontSize: 12, fontWeight: '700', color: C.gray },

  // Podium
  podiumRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', justifyContent: 'center' },
  podiumCard: { flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 2, padding: 12, alignItems: 'center', gap: 4 },
  podiumMedal: { fontSize: 24 },
  podiumAvatar: { borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  podiumAvatarText: { fontWeight: '900' },
  podiumName:  { fontSize: 11, fontWeight: '700', color: C.white, textAlign: 'center' },
  podiumScore: { fontWeight: '900', lineHeight: 28 },
  podiumPts:   { fontSize: 8, color: C.gray, fontWeight: '700' },

  // List
  listCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  listHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.inputBg, borderBottomWidth: 1, borderBottomColor: C.border },
  listHeaderCell: { fontSize: 8, fontWeight: '800', color: C.gray, letterSpacing: 0.8 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  rankCell: { justifyContent: 'center', alignItems: 'center' },
  rankText: { fontWeight: '900' },
  memberCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  miniAvatarText: { fontSize: 13, fontWeight: '900' },
  levelBadge: { position: 'absolute', bottom: -2, right: -3, width: 14, height: 14, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  memberNameText: { fontSize: 12, fontWeight: '700', color: C.white },
  memberGoalText: { fontSize: 9, color: C.gray },
  dataCell: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  scoreText: { fontSize: 14, fontWeight: '900' },
  scoreBarBg: { height: 4, width: 50, backgroundColor: C.border, borderRadius: 50, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 50 },
});