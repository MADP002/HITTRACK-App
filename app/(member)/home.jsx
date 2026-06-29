import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
   Animated, PanResponder, Modal, Dimensions,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { doc, getDoc, collection, query, orderBy, where, onSnapshot, addDoc, getDocs, deleteDoc, updateDoc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { isClassActive } from '../../lib/classLifecycle';
import { canBook, computeMembershipState, daysRemaining } from '../../lib/membership';

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
  const [viewedIds,         setViewedIds]         = useState(new Set());
  const [showClasses,       setShowClasses]       = useState(false);
  const [classes,           setClasses]           = useState([]);
  const [feedback,          setFeedback]           = useState([]);
  const [expandedFbId,      setExpandedFbId]       = useState(null);
  const [showHiddenFb,      setShowHiddenFb]       = useState(false);
  const [myBookings,        setMyBookings]        = useState([]);
  const [enrollingId,       setEnrollingId]       = useState(null);
  const [showTrialWelcome,  setShowTrialWelcome]  = useState(false);
  const [levelChangePopup,  setLevelChangePopup]  = useState(null);
  const [tipIndex,          setTipIndex]          = useState(0);
  const tipIndexRef = useRef(0); // keeps PanResponder in sync with current tipIndex

  const translateX  = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  // ── Load user data ────────────────────────────────────────────────────────
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    // Real-time listener so coach-assigned level changes reflect instantly
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.exists()) setUserData(snap.data());
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsub();
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
      }, (e) => { console.warn('Announcements snapshot error:', e); });
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

  // ── Membership gate (mirrors web: expired/paused can't book; stats locked) ──
  const membershipState  = computeMembershipState(userData?.membership);
  const membershipLocked = !canBook(userData?.membership);

  // Keep tipIndexRef in sync so PanResponder always reads the latest value
  useEffect(() => { tipIndexRef.current = tipIndex; }, [tipIndex]);



  const handleEnroll = async (cls) => {
    const user = auth.currentUser;
    if (!user) return;
    // Membership gate — expired/paused members can't book (mirrors web canBook).
    if (!canBook(userData?.membership)) {
      Alert.alert('Membership Inactive', 'Your membership is expired or paused. Please contact the gym to renew before booking classes.');
      return;
    }
    // Cheap pre-check for instant UX — the transaction below re-checks atomically.
    if ((cls.enrolled || 0) >= cls.spots) {
      Alert.alert('Class Full', 'This class is fully booked.');
      return;
    }
    setEnrollingId(cls.id);
    try {
      // 1. Guard against double-booking (cheap read first).
      const dupSnap = await getDocs(
        query(collection(db, 'bookings'), where('userId', '==', user.uid), where('classId', '==', cls.id))
      );
      if (!dupSnap.empty) {
        Alert.alert('Already Enrolled', `You've already booked "${cls.name}".`);
        return;
      }
      // 2. Atomic transaction — re-check spots + create booking + bump count together,
      //    so two members can't oversell a class (mirrors web doBook, first come first served).
      await runTransaction(db, async (tx) => {
        const classRef  = doc(db, 'classes', cls.id);
        const classSnap = await tx.get(classRef);
        if (!classSnap.exists()) throw new Error('Class no longer exists');
        const data     = classSnap.data();
        const enrolled = data.enrolled || 0;
        const spots    = data.spots || 0;
        if (spots > 0 && enrolled >= spots) {
          throw new Error(`SOLD_OUT:"${cls.name}" filled up while you were booking.`);
        }
        tx.update(classRef, { enrolled: increment(1) });
        const bookingRef = doc(collection(db, 'bookings'));
        tx.set(bookingRef, {
          classId:   cls.id,
          className: cls.name,
          userId:    user.uid,
          userName:  userData?.name || 'Member',
          createdAt: serverTimestamp(),
        });
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.startsWith('SOLD_OUT:')) Alert.alert('Class Full', msg.replace('SOLD_OUT:', ''));
      else Alert.alert('Error', 'Could not enroll. Please try again.');
    } finally {
      setEnrollingId(null);
    }
  };

  const handleUnenroll = async (cls) => {
    const user = auth.currentUser;
    if (!user) return;
    setEnrollingId(cls.id);
    try {
      const booking = myBookings.find(b => b.classId === cls.id);
      if (booking) {
        await deleteDoc(doc(db, 'bookings', booking.id));
        await updateDoc(doc(db, 'classes', cls.id), { enrolled: increment(-1) });
      }
    } catch (e) { Alert.alert('Error', 'Could not unenroll. Please try again.'); }
    setEnrollingId(null);
  };

  const markViewed = (id) => {
    setViewedIds(prev => new Set([...prev, id]));
  };


  // Live coach feedback for this member
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, 'feedback'), where('memberId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(fb => !fb.deletedByMember) // deleted-by-member items never reappear here
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setFeedback(list);
    }, console.error);
    return () => unsub();
  }, []);

  const toggleHideFeedback = async (fb) => {
    try {
      await updateDoc(doc(db, 'feedback', fb.id), { hidden: !fb.hidden });
    } catch (e) { console.error('Could not toggle feedback visibility:', e); }
  };

  const deleteFeedbackForMember = (fb) => {
    Alert.alert(
      'Delete Feedback?',
      'This removes it from your view only — your coach will still see it in their records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try { await updateDoc(doc(db, 'feedback', fb.id), { deletedByMember: true }); }
            catch (e) { console.error('Could not delete feedback:', e); }
          },
        },
      ]
    );
  };

  // Live classes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classes'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const list = all
        .filter(isClassActive) // hide classes that have ended or already passed
        .sort((a, b) => {
          const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
          return days.indexOf(a.day) - days.indexOf(b.day);
        });
      // (verbose per-class diagnostic logging removed — confirmed working)
      setClasses(list);
    }, console.error);
    return () => unsub();
  }, []);

  // Live bookings for this user
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, 'bookings'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setMyBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, console.error);
    return () => unsub();
  }, []);

  // ── Free-trial welcome popup (once per account, mirrors web) ──────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !userData) return;
    if (computeMembershipState(userData.membership) !== 'trial') return;
    const key = `hittrack_trial_welcomed_${uid}`;
    AsyncStorage.getItem(key).then(seen => {
      if (!seen) { setShowTrialWelcome(true); AsyncStorage.setItem(key, '1').catch(() => {}); }
    }).catch(() => {});
  }, [userData]);

  // ── Level-change celebration (coach/admin promoted you) ───────────────────
  //  Mirrors web: watches level_change notifications for this user and shows a
  //  one-time congrats. Dedup via AsyncStorage so it never re-pops.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, 'notifications'),
      where('targetUserId', '==', user.uid),
      where('type', '==', 'level_change')
    );
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      if (docs.length === 0) return;
      const latest = docs[0];
      const seenKey = 'hittrack_seen_level_changes';
      let seen = [];
      try { seen = JSON.parse((await AsyncStorage.getItem(seenKey)) || '[]'); } catch (e) {}
      if (seen.includes(latest.id)) return;
      setLevelChangePopup(latest);
      try { await AsyncStorage.setItem(seenKey, JSON.stringify([...seen, latest.id])); } catch (e) {}
    }, (err) => console.warn('Level change watcher:', err));
    return () => unsub();
  }, []);

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
        animateToTip((tipIndexRef.current + 1) % TIPS.length, 'next');
      } else if (g.dx > 60) {
        animateToTip((tipIndexRef.current - 1 + TIPS.length) % TIPS.length, 'prev');
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
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.red} />
        </View>
      </SafeAreaView>
    );
  }

  const tip = TIPS[tipIndex];

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>

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
              {announcements.filter(a => !viewedIds.has(a.id)).length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{announcements.filter(a => !viewedIds.has(a.id)).length}</Text>
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
                {announcements.map((n, i) => {
                  const isViewed = viewedIds.has(n.id);
                  return (
                    <TouchableOpacity
                      key={n.id}
                      style={[styles.announcementItem, i < announcements.length - 1 && styles.itemBorder, !isViewed && styles.announcementItemUnread]}
                      onPress={() => markViewed(n.id)}
                      activeOpacity={0.8}
                    >
                      {!isViewed && <View style={styles.unreadStripe} />}
                      <View style={styles.announcementIcon}>
                        <Text style={{ fontSize: 14 }}>📢</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, isViewed && { color: COLORS.gray }]}>{n.title}</Text>
                        <Text style={styles.itemMsg}>{n.message}</Text>
                        <Text style={styles.itemFrom}>From: {n.from || 'Admin'}</Text>
                      </View>
                      {!isViewed && <View style={styles.unreadDotSmall} />}
                    </TouchableOpacity>
                  );
                })}
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
            {announcements.filter(a => !viewedIds.has(a.id)).length > 0 && (
              <View style={styles.notifDot}>
                <Text style={styles.notifDotText}>
                  {announcements.filter(a => !viewedIds.has(a.id)).length > 9 ? '9+' : announcements.filter(a => !viewedIds.has(a.id)).length}
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
              backgroundColor: (LEVEL_COLORS[userData?.experience] || levelColor) + '22',
              borderColor:     (LEVEL_COLORS[userData?.experience] || levelColor) + '66',
            }]}>
              <Text style={[styles.levelBadgeText, { color: LEVEL_COLORS[userData?.experience] || levelColor }]}>
                {userData?.experience || 'Beginner'}
              </Text>
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

        {/* ── CLASSES BUTTON ── */}
        <TouchableOpacity
          style={styles.classesBannerBtn}
          onPress={() => setShowClasses(true)}
          activeOpacity={0.85}
        >
          <View style={styles.classesBannerLeft}>
            <View style={styles.classesBannerIcon}>
              <Text style={{ fontSize: 26 }}>📋</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.classesBannerTitle}>Gym Classes</Text>
              <Text style={styles.classesBannerSub}>
                {classes.length > 0
                  ? `${classes.length} class${classes.length !== 1 ? 'es' : ''} available · Tap to enroll`
                  : 'No classes scheduled yet'}
              </Text>
            </View>
          </View>
          <View style={styles.classesBannerBadge}>
            <Text style={styles.classesBannerBadgeText}>{classes.length}</Text>
          </View>
        </TouchableOpacity>


        {/* ── TODAY'S WORKOUT BUTTON ── */}
        <TouchableOpacity
          style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'#0e1a14', borderRadius:18, padding:18, borderWidth:1.5, borderColor:'#4ade8055' }}
          onPress={() => router.push('/(member)/todays-workout')}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection:'row', alignItems:'center', gap:14, flex:1 }}>
            <View style={{ width:52, height:52, borderRadius:14, backgroundColor:'#4ade8022', justifyContent:'center', alignItems:'center' }}>
              <Text style={{ fontSize:26 }}>📋</Text>
            </View>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:18, fontWeight:'900', color:'#fff' }}>Today's Workout</Text>
              <Text style={{ fontSize:12, color:'#888', marginTop:2 }}>Your program + Adaptive Coach</Text>
            </View>
          </View>
          <View style={{ width:36, height:36, borderRadius:18, backgroundColor:'#4ade8022', justifyContent:'center', alignItems:'center' }}>
            <Text style={{ fontSize:18, color:'#4ade80', fontWeight:'900' }}>→</Text>
          </View>
        </TouchableOpacity>

        {/* ── TRAINING LAB BUTTON ── */}
        <TouchableOpacity
          style={styles.trainingLabBtn}
          onPress={() => router.push('/(member)/training-lab')}
          activeOpacity={0.85}
        >
          <View style={styles.trainingLabLeft}>
            <View style={styles.trainingLabIconBox}>
              <Text style={{ fontSize: 28 }}>🥊</Text>
            </View>
            <View>
              <Text style={styles.trainingLabTitle}>Training Lab</Text>
              <Text style={styles.trainingLabSub}>Start Training</Text>
            </View>
          </View>
          <View style={styles.trainingLabArrow}>
            <Text style={{ fontSize: 18, color: '#000', fontWeight: '900' }}>→</Text>
          </View>
        </TouchableOpacity>

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

          {membershipLocked && (
            <View style={styles.statsLock}>
              <Ionicons name="lock-closed" size={24} color={COLORS.gold} />
              <Text style={styles.statsLockTitle}>
                {membershipState === 'paused' ? 'Membership Paused' : 'Membership Expired'}
              </Text>
              <Text style={styles.statsLockSub}>Renew with the gym to view your stats</Text>
            </View>
          )}
        </View>

        {/* ── COACH FEEDBACK ── */}
        {feedback.length > 0 && (
          <View style={styles.fbCard}>
            <View style={styles.fbCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.fbCardTitle}>💬 Coach Feedback</Text>
                {feedback.filter(f => !f.hidden).length > 0 && (
                  <View style={styles.fbNotifyBadge}>
                    <Text style={styles.fbNotifyBadgeText}>{feedback.filter(f => !f.hidden).length}</Text>
                  </View>
                )}
              </View>
              {feedback.some(f => f.hidden) && (
                <TouchableOpacity onPress={() => setShowHiddenFb(v => !v)}>
                  <Text style={styles.fbShowHiddenLink}>
                    {showHiddenFb ? 'Hide hidden' : `Show hidden (${feedback.filter(f => f.hidden).length})`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {feedback
              .filter(fb => showHiddenFb || !fb.hidden)
              .map(fb => {
                const isExpanded = expandedFbId === fb.id;
                const ts = fb.createdAt?.seconds ? new Date(fb.createdAt.seconds * 1000) : null;
                return (
                  <TouchableOpacity
                    key={fb.id}
                    style={[styles.fbRow, fb.hidden && { opacity: 0.45 }]}
                    onPress={() => setExpandedFbId(isExpanded ? null : fb.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.fbRowTop}>
                      <View style={styles.fbCoachAvatar}>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.gold }}>
                          {(fb.coachName || 'C')[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.fbCoachName, { flex: 1 }]}>{fb.coachName || 'Coach'}</Text>
                      {fb.rating > 0 && (
                        <View style={{ flexDirection: 'row', gap: 1 }}>
                          {[1,2,3,4,5].map(n => (
                            <Ionicons key={n} name={n <= fb.rating ? 'star' : 'star-outline'} size={11} color={COLORS.gold} />
                          ))}
                        </View>
                      )}
                      <TouchableOpacity onPress={() => toggleHideFeedback(fb)} style={{ padding: 4 }}>
                        <Ionicons name={fb.hidden ? 'eye-outline' : 'eye-off-outline'} size={16} color={COLORS.gray} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteFeedbackForMember(fb)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={16} color={COLORS.red} />
                      </TouchableOpacity>
                    </View>
                    {isExpanded && (
                      <>
                        <Text style={styles.fbText}>{fb.text}</Text>
                        {fb.workoutExercises?.length > 0 && (
                          <View style={styles.fbExerciseTags}>
                            {fb.workoutExercises.map((ex, i) => (
                              <View key={i} style={styles.fbExerciseTag}>
                                <Text style={styles.fbExerciseTagText}>{ex}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </>
                    )}
                    <Text style={styles.fbExpandHint}>{isExpanded ? '▲ Show less' : '▼ Tap to expand'}</Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        )}

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
      {/* ── CLASSES MODAL ── */}
      <Modal visible={showClasses} transparent animationType="slide" onRequestClose={() => setShowClasses(false)}>
        <View style={styles.classesModalOverlay}>
          <View style={styles.classesModalCard}>
            <View style={styles.classesModalHeader}>
              <Text style={styles.classesModalTitle}>📋 Gym Classes</Text>
              <TouchableOpacity onPress={() => setShowClasses(false)}>
                <Ionicons name="close" size={22} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '85%' }}>
              {classes.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 40, gap: 10 }}>
                  <Text style={{ fontSize: 40 }}>📭</Text>
                  <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>No Classes Yet</Text>
                  <Text style={{ color: COLORS.gray, fontSize: 13, textAlign: 'center' }}>Your coach hasn't scheduled any classes yet.</Text>
                </View>
              ) : classes.map(cls => {
                const isEnrolled  = myBookings.some(b => b.classId === cls.id);
                const isFull      = (cls.enrolled || 0) >= cls.spots;
                const isEnrolling = enrollingId === cls.id;
                const spotsLeft   = cls.spots - (cls.enrolled || 0);
                const LEVEL_COLORS = { Beginner: '#fb923c', Intermediate: '#F5C842', Advanced: '#4ade80' };
                const lc = LEVEL_COLORS[cls.level] || COLORS.gold;
                return (
                  <View key={cls.id} style={[styles.classCard, isEnrolled && { borderColor: COLORS.green + '55' }]}>
                    <View style={styles.classCardTop}>
                      <View style={[styles.classDayBox, { backgroundColor: lc + '22', borderColor: lc + '44' }]}>
                        <Text style={[styles.classDayText, { color: lc }]}>{(cls.day || '').slice(0, 3).toUpperCase()}</Text>
                        <Text style={[styles.classTimeText, { color: lc }]}>{cls.time}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.className} numberOfLines={1}>{cls.name}</Text>
                        <View style={styles.classTagsRow}>
                          <View style={[styles.classTag, { backgroundColor: lc + '18', borderColor: lc + '33' }]}>
                            <Text style={[styles.classTagText, { color: lc }]}>{cls.level}</Text>
                          </View>
                          {cls.coach && (
                            <View style={[styles.classTag, { backgroundColor: COLORS.inputBg, borderColor: COLORS.border }]}>
                              <Text style={[styles.classTagText, { color: COLORS.gray }]}>🥊 {cls.coach}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* Spots */}
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: isFull ? COLORS.red : COLORS.green }}>
                          {isFull ? 'Full' : `${spotsLeft} left`}
                        </Text>
                        <Text style={{ fontSize: 9, color: COLORS.gray }}>{cls.enrolled || 0}/{cls.spots}</Text>
                      </View>
                    </View>

                    {/* Enroll / Leave button */}
                    <TouchableOpacity
                      style={[
                        styles.enrollBtn,
                        isEnrolled  ? styles.enrollBtnLeave  : styles.enrollBtnJoin,
                        (isFull && !isEnrolled) && { opacity: 0.4 },
                      ]}
                      onPress={() => isEnrolled ? handleUnenroll(cls) : handleEnroll(cls)}
                      disabled={isEnrolling || (isFull && !isEnrolled)}
                      activeOpacity={0.85}
                    >
                      {isEnrolling
                        ? <ActivityIndicator size="small" color={COLORS.white} />
                        : <Text style={styles.enrollBtnText}>
                            {isEnrolled ? '✓ Enrolled — Tap to Leave' : isFull ? 'Class Full' : '+ Enroll in This Class'}
                          </Text>
                      }
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── FREE-TRIAL WELCOME POPUP ── */}
      <Modal visible={showTrialWelcome} transparent animationType="fade" onRequestClose={() => setShowTrialWelcome(false)}>
        <View style={styles.popupOverlay}>
          <View style={styles.trialCard}>
            <View style={styles.trialAccent} />
            <Text style={{ fontSize: 46 }}>🎉</Text>
            <Text style={styles.popupTitle}>WELCOME TO HITTRACK!</Text>
            <View style={styles.trialBadge}>
              <Text style={styles.trialBadgeLabel}>FREE TRIAL</Text>
              <Text style={styles.trialBadgeDays}>
                {(() => {
                  const d = daysRemaining(userData?.membership);
                  return d != null && d >= 0 ? `${d} day${d === 1 ? '' : 's'} left` : '7 days';
                })()}
              </Text>
            </View>
            <Text style={styles.popupBody}>
              You're on a 7-day free trial. Book classes, track your workouts, and explore everything HITTRACK offers. When your trial ends, speak with the gym admin to continue your membership.
            </Text>
            <TouchableOpacity style={styles.trialBtn} onPress={() => setShowTrialWelcome(false)} activeOpacity={0.85}>
              <Text style={styles.trialBtnText}>Let's Go 🥊</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── LEVEL-CHANGE CELEBRATION POPUP ── */}
      <Modal visible={!!levelChangePopup} transparent animationType="fade" onRequestClose={() => setLevelChangePopup(null)}>
        {levelChangePopup && (() => {
          const oldLv = levelChangePopup.oldLevel || 'Beginner';
          const newLv = levelChangePopup.newLevel || 'Beginner';
          const ORDER = ['Beginner', 'Intermediate', 'Advanced'];
          const isPromote = ORDER.indexOf(newLv) > ORDER.indexOf(oldLv);
          const lvColors = { Beginner: '#fb923c', Intermediate: '#F5C842', Advanced: '#22c55e' };
          const lvIcons  = { Beginner: '🥊', Intermediate: '⚡', Advanced: '🔥' };
          const lc = lvColors[newLv] || COLORS.gold;
          return (
            <View style={styles.popupOverlay}>
              <View style={[styles.levelCard, { borderColor: lc + '55' }]}>
                <Text style={{ fontSize: 44 }}>{isPromote ? '🎉' : '🎚'}</Text>
                <Text style={[styles.lvlTitle, { color: lc }]}>{isPromote ? 'LEVELED UP!' : 'LEVEL UPDATED'}</Text>
                <Text style={styles.lvlBy}>By {levelChangePopup.from || 'Your Coach'}</Text>
                <View style={styles.lvlRow}>
                  <View style={{ alignItems: 'center', opacity: 0.4 }}>
                    <View style={styles.lvlOldCircle}><Text style={{ fontSize: 24 }}>{lvIcons[oldLv] || '🥊'}</Text></View>
                    <Text style={styles.lvlOldLabel}>{oldLv.toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 22, color: lc }}>{isPromote ? '➡' : '⬅'}</Text>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.lvlNewCircle, { backgroundColor: lc, borderColor: lc }]}><Text style={{ fontSize: 28 }}>{lvIcons[newLv] || '🥊'}</Text></View>
                    <Text style={[styles.lvlNewLabel, { color: lc }]}>{newLv.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.popupBody}>
                  {levelChangePopup.message || `You're now ${newLv}. Your training plan and leaderboard division have been updated.`}
                </Text>
                <TouchableOpacity style={[styles.lvlBtn, { backgroundColor: lc }]} onPress={() => setLevelChangePopup(null)} activeOpacity={0.85}>
                  <Text style={styles.lvlBtnText}>🥊 LET'S GO!</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
      </Modal>


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
    position: 'relative', overflow: 'hidden',
  },
  ringTitle: { fontSize: 11, color: COLORS.gray, fontWeight: '700', textAlign: 'center' },
  statsLock: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(22,22,22,0.96)',
    justifyContent: 'center', alignItems: 'center', gap: 4, padding: 16,
  },
  statsLockTitle: { fontSize: 14, fontWeight: '800', color: COLORS.white },
  statsLockSub:   { fontSize: 11, color: COLORS.gray, textAlign: 'center' },
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


  // Training Lab button
  trainingLabBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.red, borderRadius: 18, padding: 18,
    shadowColor: COLORS.red, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
  },
  trainingLabLeft:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  trainingLabIconBox:{ width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  trainingLabTitle:  { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  trainingLabSub:    { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '600' },
  trainingLabArrow:  { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

  announcementItemUnread: { backgroundColor: '#0A0A18' },
  unreadStripe:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: COLORS.red, borderRadius: 2 },
  unreadDotSmall:  { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red },

  // Classes banner button
  classesBannerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0A1628', borderRadius: 18, padding: 18,
    borderWidth: 1.5, borderColor: '#42a5f555',
    shadowColor: '#42a5f5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  classesBannerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  classesBannerIcon:   { width: 52, height: 52, borderRadius: 14, backgroundColor: '#42a5f522', justifyContent: 'center', alignItems: 'center' },
  classesBannerTitle:  { fontSize: 18, fontWeight: '900', color: COLORS.white },
  classesBannerSub:    { fontSize: 12, color: COLORS.gray, marginTop: 2, flexShrink: 1 },
  classesBannerBadge:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#42a5f5', justifyContent: 'center', alignItems: 'center' },
  classesBannerBadgeText: { fontSize: 16, fontWeight: '900', color: '#000' },

  // Classes modal
  classesModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  classesModalCard:    { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: COLORS.border, maxHeight: '90%' },
  classesModalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  classesModalTitle:   { fontSize: 18, fontWeight: '900', color: COLORS.white },

  // Class cards inside modal
  classCard:    { backgroundColor: COLORS.inputBg, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 12, gap: 12 },
  classCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  classDayBox:  { width: 56, borderRadius: 12, borderWidth: 1, padding: 8, alignItems: 'center', gap: 2 },
  classDayText: { fontSize: 13, fontWeight: '900' },
  classTimeText:{ fontSize: 9, fontWeight: '600' },
  className:    { fontSize: 14, fontWeight: '800', color: COLORS.white, marginBottom: 6 },
  classTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  classTag:     { borderRadius: 50, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  classTagText: { fontSize: 9, fontWeight: '700' },
  enrollBtn:    { borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center' },
  enrollBtnJoin: { backgroundColor: '#42a5f5' },
  enrollBtnLeave:{ backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: '#4ade8055' },
  enrollBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.white },

  // Coach Feedback card
  fbCard:       { backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 12, marginBottom: 4 },
  fbCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fbCardTitle:  { fontSize: 15, fontWeight: '900', color: COLORS.white },
  fbNotifyBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.red, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  fbNotifyBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.white },
  fbShowHiddenLink: { fontSize: 11, fontWeight: '700', color: COLORS.gold },
  fbRow:        { backgroundColor: COLORS.inputBg, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 12, gap: 8 },
  fbRowTop:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fbCoachAvatar:{ width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.gold + '22', justifyContent: 'center', alignItems: 'center' },
  fbCoachName:  { fontSize: 13, fontWeight: '800', color: COLORS.white },
  fbMeta:       { fontSize: 10, color: COLORS.gray, marginTop: 1 },
  fbText:       { fontSize: 13, color: COLORS.lightGray, lineHeight: 19 },
  fbExerciseTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  fbExerciseTag:  { backgroundColor: COLORS.bg, borderRadius: 50, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 9, paddingVertical: 3 },
  fbExerciseTagText: { fontSize: 10, color: COLORS.gray, fontWeight: '600' },
  fbExpandHint: { fontSize: 10, color: COLORS.gold, fontWeight: '700' },

  // Celebration / welcome popups
  popupOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  popupTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white, textAlign: 'center', letterSpacing: 0.5 },
  popupBody:  { fontSize: 13, color: COLORS.lightGray, textAlign: 'center', lineHeight: 20 },

  trialCard: {
    width: '100%', maxWidth: 380, backgroundColor: '#14110f',
    borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(66,165,245,0.4)',
    padding: 28, alignItems: 'center', gap: 14, overflow: 'hidden',
  },
  trialAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: '#42a5f5' },
  trialBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 50,
    backgroundColor: 'rgba(66,165,245,0.12)', borderWidth: 1, borderColor: 'rgba(66,165,245,0.35)',
  },
  trialBadgeLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#42a5f5' },
  trialBadgeDays:  { fontSize: 11, fontWeight: '700', color: '#cdd5dc' },
  trialBtn: {
    width: '100%', backgroundColor: '#42a5f5', borderRadius: 50,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  trialBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  levelCard: {
    width: '100%', maxWidth: 400, backgroundColor: '#14110f',
    borderRadius: 24, borderWidth: 2, padding: 28, alignItems: 'center', gap: 12,
  },
  lvlTitle: { fontSize: 26, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  lvlBy:    { fontSize: 10, color: COLORS.gray, letterSpacing: 1, fontWeight: '700', textTransform: 'uppercase' },
  lvlRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginVertical: 8 },
  lvlOldCircle: {
    width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 6,
  },
  lvlOldLabel: { fontSize: 9, color: '#666', fontWeight: '800', letterSpacing: 1 },
  lvlNewCircle: {
    width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, marginBottom: 6,
  },
  lvlNewLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  lvlBtn: { width: '100%', borderRadius: 50, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  lvlBtnText: { fontSize: 13, fontWeight: '800', color: '#000', letterSpacing: 1 },
});