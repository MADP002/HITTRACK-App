import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
   ActivityIndicator, TextInput, RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { auth, db } from '../../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { canBook, computeMembershipState } from '../../lib/membership';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842',
};

const LEVEL_COLOR  = { Beginner: '#fb923c', Intermediate: '#F5C842', Advanced: '#4ade80' };
const LEVEL_ICON   = { Beginner: '🥊', Intermediate: '⚡', Advanced: '🔥' };
const LEVEL_BONUS  = { Beginner: 0, Intermediate: 150, Advanced: 350 };
const RANK_COLORS  = ['#F5C842', '#c8d6e5', '#cd7f32'];
const MEDALS       = { 1: '🥇', 2: '🥈', 3: '🥉' };
const DIVISIONS    = ['Beginner', 'Intermediate', 'Advanced'];
const GOAL_FILTERS = ['All Goals', 'Learn Boxing', 'Lose Weight', 'Build Strength', 'Compete'];
const GOAL_COLORS  = ['#F5C842', '#42a5f5', '#E63946', '#4ade80', '#c084fc'];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const calcScore = (u) =>
  ((u.totalWorkouts || 0) * 10) +
  ((u.streak || 0) * 5) +
  (LEVEL_BONUS[u.currentLevel || u.experience] || 0) +
  Math.round((u.weeklyPct || 0) * 1.5);

// ── PODIUM CARD ───────────────────────────────────────────────────────────────
function PodiumCard({ user, rank }) {
  const color  = RANK_COLORS[rank - 1] || COLORS.gold;
  const isGold = rank === 1;
  const initial = (user.name || '?')[0].toUpperCase();

  return (
    <View style={[
      styles.podiumCard,
      { borderColor: color + '55', marginTop: rank === 1 ? 0 : rank === 2 ? 20 : 36 },
    ]}>
      {/* Rank badge */}
      <Text style={[styles.podiumMedal, { color }]}>{MEDALS[rank]}</Text>
      <Text style={[styles.podiumRankLabel, { color }]}>
        {rank === 1 ? '1ST' : rank === 2 ? '2ND' : '3RD'}
      </Text>

      {/* Avatar */}
      <View style={[styles.podiumAvatar, { borderColor: color, backgroundColor: color + '22' }]}>
        <Text style={[styles.podiumAvatarText, { color }]}>{initial}</Text>
        {user.isMe && (
          <View style={styles.podiumStar}>
            <Text style={{ fontSize: 8 }}>★</Text>
          </View>
        )}
      </View>

      {/* Name */}
      <Text style={styles.podiumName} numberOfLines={1}>
        {user.name}{user.isMe ? ' (You)' : ''}
      </Text>
      <Text style={styles.podiumGoal} numberOfLines={1}>{user.goal || '—'}</Text>

      {/* Score */}
      <View style={[styles.podiumScoreBox, { borderColor: color + '33', backgroundColor: color + '11' }]}>
        <Text style={[styles.podiumScore, { color }]}>{user.score.toLocaleString()}</Text>
        <Text style={styles.podiumScoreLabel}>PTS</Text>
      </View>

      {/* Mini stats */}
      <View style={styles.podiumStats}>
        {[
          { icon: '🥊', val: user.totalWorkouts || 0, label: 'WKT' },
          { icon: '🔥', val: `${user.streak || 0}d`, label: 'STK' },
        ].map((st, i) => (
          <View key={i} style={[styles.podiumStatBox, { borderColor: color + '22' }]}>
            <Text style={{ fontSize: 12 }}>{st.icon}</Text>
            <Text style={[styles.podiumStatVal, { color }]}>{st.val}</Text>
            <Text style={styles.podiumStatLabel}>{st.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── RANK ROW ──────────────────────────────────────────────────────────────────
function RankRow({ user, maxScore, divColor }) {
  const rc      = user.rank <= 3 ? RANK_COLORS[user.rank - 1] : divColor;
  const barPct  = maxScore > 0 ? (user.score / maxScore) * 100 : 0;
  const initial = (user.name || '?')[0].toUpperCase();
  const isHot   = (user.streak || 0) >= 14;

  return (
    <View style={[
      styles.rankRow,
      user.isMe && styles.rankRowMe,
      { borderLeftColor: user.isMe ? COLORS.gold : user.rank <= 3 ? RANK_COLORS[user.rank - 1] : 'transparent' },
    ]}>
      {/* Rank */}
      <View style={styles.rankNumBox}>
        <Text style={[
          styles.rankNum,
          { color: user.rank <= 3 ? RANK_COLORS[user.rank - 1] : COLORS.gray,
            fontSize: user.rank <= 3 ? 18 : 13 },
        ]}>
          {MEDALS[user.rank] || `#${user.rank}`}
        </Text>
      </View>

      {/* Avatar */}
      <View style={[styles.rankAvatar, { borderColor: divColor + '55', backgroundColor: divColor + '18' }]}>
        <Text style={[styles.rankAvatarText, { color: divColor }]}>{initial}</Text>
      </View>

      {/* Name + badges */}
      <View style={styles.rankInfo}>
        <View style={styles.rankNameRow}>
          <Text
            style={[styles.rankName, user.isMe && { color: COLORS.gold }]}
            numberOfLines={1}
          >
            {user.name}
          </Text>
          {user.isMe && (
            <View style={styles.youBadge}>
              <Text style={styles.youBadgeText}>YOU</Text>
            </View>
          )}
          {isHot && (
            <View style={styles.hotBadge}>
              <Text style={styles.hotBadgeText}>🔥 HOT</Text>
            </View>
          )}
        </View>
        <Text style={styles.rankGoal} numberOfLines={1}>{user.goal || '—'}</Text>
      </View>

      {/* Workouts */}
      <View style={styles.rankWkt}>
        <Text style={styles.rankWktVal}>{user.totalWorkouts || 0}</Text>
        <Text style={{ fontSize: 10 }}>🥊</Text>
      </View>

      {/* Score + bar */}
      <View style={styles.rankScoreCol}>
        <View style={styles.rankBarBg}>
          <View style={[styles.rankBarFill, { width: `${barPct}%`, backgroundColor: rc }]} />
        </View>
        <Text style={[styles.rankScoreVal, { color: rc }]}>{user.score.toLocaleString()}</Text>
      </View>
    </View>
  );
}

// ── DIVISION SECTION ──────────────────────────────────────────────────────────
function DivisionSection({ division, users, myUid, goalFilter, searchQ }) {
  const color    = LEVEL_COLOR[division]  || COLORS.gold;
  const icon     = LEVEL_ICON[division]   || '🥊';

  const filtered = users
    .filter(u => {
      if (searchQ && !u.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
      if (goalFilter !== 'All Goals' && u.goal !== goalFilter) return false;
      return true;
    })
    .map((u, i) => ({ ...u, rank: i + 1, isMe: u.uid === myUid }));

  const maxScore = filtered[0]?.score || 1;
  const myEntry  = filtered.find(u => u.isMe);
  const top3     = filtered.slice(0, 3);
  const rest     = filtered.slice(3);

  if (filtered.length === 0) {
    return (
      <View style={styles.emptyDiv}>
        <Text style={{ fontSize: 32 }}>{icon}</Text>
        <Text style={styles.emptyDivText}>
          No {division} members{goalFilter !== 'All Goals' ? ' with this goal' : ''} yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.divSection}>
      {/* Division header */}
      <View style={styles.divHeader}>
        <View style={[styles.divIconBox, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <Text style={{ fontSize: 22 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.divTitle, { color }]}>{division.toUpperCase()} DIVISION</Text>
          <Text style={styles.divSubtitle}>{filtered.length} member{filtered.length !== 1 ? 's' : ''} competing</Text>
        </View>
        {myEntry && (
          <View style={[styles.myRankBox, { borderColor: color + '33', backgroundColor: color + '11' }]}>
            <Text style={styles.myRankLabel}>Your Rank</Text>
            <Text style={[styles.myRankVal, { color }]}>#{myEntry.rank}</Text>
          </View>
        )}
      </View>

      {/* Podium — top 3 */}
      {top3.length >= 2 && (
        <View style={styles.podiumRow}>
          {top3.length >= 2 && <PodiumCard user={top3[1]} rank={2} />}
          <PodiumCard user={top3[0]} rank={1} />
          {top3.length >= 3 && <PodiumCard user={top3[2]} rank={3} />}
        </View>
      )}
      {top3.length === 1 && <PodiumCard user={top3[0]} rank={1} />}

      {/* Full rankings table */}
      <View style={[styles.rankTable, { borderColor: color + '22' }]}>
        {/* Table header */}
        <View style={styles.rankTableHeader}>
          <Text style={[styles.rankTableHeaderText, { width: 44 }]}>RANK</Text>
          <Text style={[styles.rankTableHeaderText, { flex: 1 }]}>MEMBER</Text>
          <Text style={[styles.rankTableHeaderText, { width: 40 }]}>WKT</Text>
          <Text style={[styles.rankTableHeaderText, { width: 100 }]}>SCORE</Text>
        </View>
        {filtered.map((u, i) => (
          <RankRow key={u.uid} user={u} maxScore={maxScore} divColor={color} />
        ))}
      </View>

      {/* My standing motivator */}
      {myEntry && (
        <View style={[styles.motivator, { borderColor: color + '33', backgroundColor: color + '0a' }]}>
          <Text style={{ fontSize: 28 }}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.motivatorTitle, { color }]}>
              Your Standing in {division}
            </Text>
            <Text style={styles.motivatorDesc}>
              Rank{' '}
              <Text style={{ color, fontWeight: '900' }}>#{myEntry.rank}</Text>
              {' '}of {filtered.length} ·{' '}
              {myEntry.rank === 1
                ? '🏆 Division Champion!'
                : myEntry.rank <= 3
                ? '🔥 On the podium!'
                : '💪 Keep pushing!'}
            </Text>
            {myEntry.rank > 1 && filtered[myEntry.rank - 2] && (
              <Text style={styles.motivatorGap}>
                <Text style={{ color, fontWeight: '700' }}>
                  {(filtered[myEntry.rank - 2].score - myEntry.score).toLocaleString()} pts
                </Text>
                {` behind #${myEntry.rank - 1} — ${filtered[myEntry.rank - 2].name}`}
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.motivatorScore, { color }]}>{myEntry.score}</Text>
            <Text style={styles.motivatorScoreLabel}>YOUR PTS</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function LeaderboardScreen() {
  const [allUsers,   setAllUsers]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [goalFilter, setGoalFilter] = useState('All Goals');
  const [searchQ,    setSearchQ]    = useState('');
  const [activeDiv,  setActiveDiv]  = useState('All');
  const [myUid,      setMyUid]      = useState(null);
  const [myUser,     setMyUser]     = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) setMyUid(user.uid);
  }, []);

  // ── Load leaderboard ────────────────────────────────────────────────────────
  const loadLeaderboard = useCallback(async () => {
    try {
      const me        = auth.currentUser;
      const usersSnap = await getDocs(collection(db, 'users'));
      const list      = [];

      for (const ud of usersSnap.docs) {
        const userData = ud.data();
        if (userData.role && userData.role !== 'member') continue;
        if (!userData.name) continue;

        let stats = {};
        try {
          const ss = await getDoc(doc(db, 'stats', ud.id));
          if (ss.exists()) stats = ss.data();
        } catch (e) {}

        // userData spread LAST so its fields win on any key collision —
        // it's the source training-complete.jsx unconditionally updates
        // every session, so it can never lag behind stats.
        const merged      = { uid: ud.id, ...stats, ...userData };
        const rawLevel    = userData.experience || stats.experience || userData.currentLevel || 'Beginner';
        const validLevel  = ['Beginner', 'Intermediate', 'Advanced'].includes(rawLevel) ? rawLevel : 'Beginner';
        merged.experience    = validLevel;
        merged.currentLevel  = validLevel;
        merged.goal          = userData.goal || stats.goal || 'Learn Boxing';
        merged.totalWorkouts = merged.totalWorkouts || 0;
        merged.streak        = merged.streak        || 0;
        merged.weeklyPct     = merged.weeklyPct     || 0;
        merged.score         = Math.round(calcScore(merged));
        merged.isMe          = me ? ud.id === me.uid : false;
        list.push(merged);
      }

      const sorted = list.sort((a, b) => b.score - a.score);
      setAllUsers(sorted);
      if (me) setMyUser(sorted.find(u => u.uid === me.uid) || null);
    } catch (e) {
      console.error('Leaderboard load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetches every time this screen comes back into focus, not just on
  // first mount — so a member's updated score/streak/progress shows up
  // immediately on return, instead of only on the very first visit.
  useFocusEffect(
    useCallback(() => {
      loadLeaderboard();
    }, [loadLeaderboard])
  );

  const onRefresh = () => { setRefreshing(true); loadLeaderboard(); };

  // ── Split by division ────────────────────────────────────────────────────────
  const byDiv = {};
  DIVISIONS.forEach(d => {
    byDiv[d] = allUsers
      .filter(u => (u.currentLevel || u.experience || 'Beginner') === d)
      .sort((a, b) => b.score - a.score);
  });

  const divsToShow = activeDiv === 'All' ? DIVISIONS : [activeDiv];

  // Membership gate — expired/paused members can't view the leaderboard (mirrors web blur/lock).
  const myState = computeMembershipState(myUser?.membership);
  const locked  = !!myUser && !canBook(myUser.membership);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.red}
          />
        }
      >
        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>🏆 Leaderboard</Text>
            <Text style={styles.headerSub}>Separate divisions by level · Pull to refresh</Text>
          </View>
          {myUser && (
            <View style={[styles.myDivBox, {
              borderColor: (LEVEL_COLOR[myUser.currentLevel] || COLORS.gold) + '44',
              backgroundColor: (LEVEL_COLOR[myUser.currentLevel] || COLORS.gold) + '11',
            }]}>
              <Text style={styles.myDivLabel}>Your Division</Text>
              <Text style={[styles.myDivVal, { color: LEVEL_COLOR[myUser.currentLevel] || COLORS.gold }]}>
                {LEVEL_ICON[myUser.currentLevel] || '🥊'} {myUser.currentLevel || 'Beginner'}
              </Text>
              <Text style={styles.myDivPts}>{myUser.score} pts</Text>
            </View>
          )}
        </View>

        {/* ── SEARCH ── */}
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

        {/* ── DIVISION TABS ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {['All', ...DIVISIONS].map((d) => {
            const color  = d === 'All' ? COLORS.red : LEVEL_COLOR[d] || COLORS.gold;
            const active = activeDiv === d;
            const count  = d === 'All' ? allUsers.length : (byDiv[d] || []).length;
            return (
              <TouchableOpacity
                key={d}
                style={[styles.divTab, active && { backgroundColor: color + '18', borderColor: color + '55' }]}
                onPress={() => setActiveDiv(d)}
                activeOpacity={0.8}
              >
                {d !== 'All' && <Text>{LEVEL_ICON[d]}</Text>}
                <Text style={[styles.divTabText, active && { color }]}>
                  {d === 'All' ? '🏆 All' : d}
                </Text>
                <View style={[styles.divTabCount, active && { backgroundColor: color + '22' }]}>
                  <Text style={[styles.divTabCountText, active && { color }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── GOAL FILTER ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {GOAL_FILTERS.map((g, i) => {
            const color  = GOAL_COLORS[i] || COLORS.gold;
            const active = goalFilter === g;
            return (
              <TouchableOpacity
                key={g}
                style={[styles.goalTab, active && { backgroundColor: color + '18', borderColor: color + '44' }]}
                onPress={() => setGoalFilter(g)}
                activeOpacity={0.8}
              >
                <Text style={[styles.goalTabText, active && { color }]}>{g}</Text>
              </TouchableOpacity>
            );
          })}
          {(goalFilter !== 'All Goals' || searchQ.length > 0) && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => { setGoalFilter('All Goals'); setSearchQ(''); }}
            >
              <Text style={styles.clearBtnText}>✕ Clear</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* ── CONTENT ── */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.red} />
            <Text style={styles.loadingText}>Loading leaderboard...</Text>
          </View>
        ) : locked ? (
          <View style={styles.lbLock}>
            <Ionicons name="lock-closed" size={40} color={COLORS.gold} />
            <Text style={styles.lbLockTitle}>
              {myState === 'paused' ? 'Membership Paused' : 'Membership Expired'}
            </Text>
            <Text style={styles.lbLockSub}>
              Renew your membership with the gym to view the leaderboard.
            </Text>
          </View>
        ) : (
          divsToShow.map(div => (
            <DivisionSection
              key={div}
              division={div}
              users={byDiv[div] || []}
              myUid={myUid}
              goalFilter={goalFilter}
              searchQ={searchQ}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 14, paddingTop: 16 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white },
  headerSub:   { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  myDivBox: {
    alignItems: 'center', borderRadius: 14,
    borderWidth: 1, padding: 12, minWidth: 100,
  },
  myDivLabel: { fontSize: 8, color: COLORS.gray, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  myDivVal:   { fontSize: 15, fontWeight: '900', marginTop: 2 },
  myDivPts:   { fontSize: 10, color: COLORS.gray, marginTop: 2 },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 46,
  },
  searchInput: { flex: 1, color: COLORS.white, fontSize: 14 },

  // Filters
  filterScroll: { gap: 8, paddingRight: 8 },
  divTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 50, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  divTabText:      { fontSize: 12, fontWeight: '700', color: COLORS.gray },
  divTabCount: {
    backgroundColor: COLORS.border, borderRadius: 50,
    paddingHorizontal: 7, paddingVertical: 1,
  },
  divTabCountText: { fontSize: 10, fontWeight: '700', color: COLORS.gray },

  goalTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 50, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  goalTabText: { fontSize: 11, fontWeight: '700', color: COLORS.gray },
  clearBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 50, borderWidth: 1,
    borderColor: COLORS.red + '44',
    backgroundColor: COLORS.red + '11',
  },
  clearBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.red },

  // Loading
  loadingBox:  { padding: 60, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: COLORS.gray },

  // Membership lock
  lbLock: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 40, alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  lbLockTitle: { fontSize: 16, fontWeight: '900', color: COLORS.white },
  lbLockSub:   { fontSize: 12, color: COLORS.gray, textAlign: 'center', lineHeight: 18 },

  // Division section
  divSection: { gap: 14 },
  divHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  divIconBox: {
    width: 46, height: 46, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  divTitle:    { fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  divSubtitle: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  myRankBox: {
    alignItems: 'center', borderRadius: 12,
    borderWidth: 1, padding: 10, minWidth: 72,
  },
  myRankLabel: { fontSize: 8, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5 },
  myRankVal:   { fontSize: 22, fontWeight: '900' },

  // Podium
  podiumRow: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-end',
  },
  podiumCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1.5, padding: 12,
    alignItems: 'center', gap: 6, position: 'relative',
  },
  podiumMedal:      { fontSize: 18, position: 'absolute', top: 8, left: 10 },
  podiumRankLabel:  { fontSize: 8, fontWeight: '800', letterSpacing: 1, position: 'absolute', top: 30, left: 10 },
  podiumAvatar: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
    marginTop: 10,
  },
  podiumAvatarText: { fontSize: 20, fontWeight: '900' },
  podiumStar: {
    position: 'absolute', bottom: -2, right: -2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.gold,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.bg,
  },
  podiumName:  { fontSize: 11, fontWeight: '800', color: COLORS.white, textAlign: 'center' },
  podiumGoal:  { fontSize: 9,  color: COLORS.gray, textAlign: 'center' },
  podiumScoreBox: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', width: '100%',
  },
  podiumScore:      { fontSize: 20, fontWeight: '900' },
  podiumScoreLabel: { fontSize: 7, color: COLORS.gray, fontWeight: '800', letterSpacing: 1 },
  podiumStats:      { flexDirection: 'row', gap: 6, width: '100%' },
  podiumStatBox: {
    flex: 1, backgroundColor: COLORS.inputBg, borderRadius: 8,
    borderWidth: 1, padding: 6, alignItems: 'center', gap: 2,
  },
  podiumStatVal:   { fontSize: 12, fontWeight: '900' },
  podiumStatLabel: { fontSize: 7, color: COLORS.gray, fontWeight: '700' },

  // Rank table
  rankTable: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, overflow: 'hidden',
  },
  rankTableHeader: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  rankTableHeaderText: {
    fontSize: 8, fontWeight: '700', color: '#444', letterSpacing: 0.8,
  },
  rankRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#111',
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  rankRowMe: { backgroundColor: '#1A1500' },
  rankNumBox:  { width: 44, alignItems: 'center' },
  rankNum:     { fontWeight: '800' },
  rankAvatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, justifyContent: 'center',
    alignItems: 'center', marginRight: 10,
  },
  rankAvatarText: { fontSize: 13, fontWeight: '900' },
  rankInfo:       { flex: 1, minWidth: 0 },
  rankNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rankName:       { fontSize: 12, fontWeight: '700', color: COLORS.white, flexShrink: 1 },
  youBadge: {
    backgroundColor: COLORS.gold + '22', borderRadius: 50,
    borderWidth: 1, borderColor: COLORS.gold + '44',
    paddingHorizontal: 5, paddingVertical: 1,
  },
  youBadgeText: { fontSize: 7, fontWeight: '800', color: COLORS.gold },
  hotBadge: {
    backgroundColor: COLORS.red + '18', borderRadius: 50,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  hotBadgeText: { fontSize: 7, fontWeight: '700', color: COLORS.red },
  rankGoal:     { fontSize: 9, color: COLORS.gray, marginTop: 1 },
  rankWkt:      { width: 40, flexDirection: 'row', alignItems: 'center', gap: 2 },
  rankWktVal:   { fontSize: 13, fontWeight: '800', color: COLORS.white },
  rankScoreCol: { width: 100, gap: 3 },
  rankBarBg: {
    height: 4, backgroundColor: COLORS.border,
    borderRadius: 50, overflow: 'hidden',
  },
  rankBarFill:  { height: '100%', borderRadius: 50 },
  rankScoreVal: { fontSize: 12, fontWeight: '800', textAlign: 'right' },

  // Empty division
  emptyDiv: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 32, alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  emptyDivText: { fontSize: 12, color: COLORS.gray, textAlign: 'center' },

  // Motivator
  motivator: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  motivatorTitle:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  motivatorDesc:       { fontSize: 13, fontWeight: '700', color: COLORS.white },
  motivatorGap:        { fontSize: 10, color: COLORS.gray, marginTop: 3 },
  motivatorScore:      { fontSize: 26, fontWeight: '900' },
  motivatorScoreLabel: { fontSize: 8, color: COLORS.gray, fontWeight: '700', letterSpacing: 1 },
});