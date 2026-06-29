import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet,  ActivityIndicator, Alert, Modal,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import {
  collection, getDocs, doc, getDoc, updateDoc, deleteDoc,
  addDoc, setDoc, serverTimestamp, onSnapshot, query,
  where, writeBatch,
} from 'firebase/firestore';
import { logActivity } from '../../lib/activityLog';

import { C } from '../../lib/theme';
const LEVEL_COLORS = { Beginner: '#fb923c', Intermediate: '#F5C842', Advanced: '#4ade80' };
const LEVEL_ICONS  = { Beginner: '🥊', Intermediate: '⚡', Advanced: '🔥' };
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export default function AdminUsersScreen() {
  const router = useRouter();
  const [subTab,       setSubTab]       = useState('members');
  const [members,      setMembers]      = useState([]);
  const [coaches,      setCoaches]      = useState([]);
  const [pending,      setPending]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [searchQ,      setSearchQ]      = useState('');
  const [adminProfile, setAdminProfile] = useState({ name: 'Admin' });

  // Modals
  const [selectedMember, setSelectedMember] = useState(null);
  const [showLevel,      setShowLevel]      = useState(false);
  const [showMsg,        setShowMsg]        = useState(false);
  const [showDelete,     setShowDelete]     = useState(false);
  const [deleteTyped,    setDeleteTyped]    = useState('');
  const [deleting,       setDeleting]       = useState(false);
  const [msgText,        setMsgText]        = useState('');
  const [msgThread,      setMsgThread]      = useState([]);
  const [sendingMsg,     setSendingMsg]     = useState(false);

  // Load admin profile
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(s => { if (s.exists()) setAdminProfile(s.data()); })
      .catch(console.error);
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const mems = [], coachs = [], pends = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.role === 'member') {
          let stats = {};
          try { const ss = await getDoc(doc(db, 'stats', d.id)); if (ss.exists()) stats = ss.data(); } catch (_) {}
          // data (users doc) spread LAST so it wins on key collisions —
          // it's unconditionally updated every session by training-complete.jsx
          mems.push({ uid: d.id, ...stats, ...data });
        } else if (data.role === 'coach') {
          coachs.push({ uid: d.id, ...data });
        } else if (data.role === 'coach_pending') {
          pends.push({ uid: d.id, ...data });
        }
      }
      setMembers(mems);
      setCoaches(coachs);
      setPending(pends);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Refetches every time this screen comes back into focus, not just on
  // first mount — so member stats and class data stay current.
  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers])
  );

  // Live messages for selected member
  useEffect(() => {
    if (!selectedMember || !showMsg) return;
    const adminUid = auth.currentUser?.uid;
    if (!adminUid) return;
    const q = query(collection(db, 'messages'), where('participants', 'array-contains', adminUid));
    const unsub = onSnapshot(q, snap => {
      const all    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const thread = all
        .filter(m => m.participants?.includes(selectedMember.uid))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMsgThread(thread);
    }, console.error);
    return () => unsub();
  }, [selectedMember, showMsg]);

  // ── MEMBER ACTIONS ────────────────────────────────────────────
  const toggleMemberStatus = async (member) => {
    const next = member.status === 'inactive' ? 'active' : 'inactive';
    const isDeactivating = next === 'inactive';
    Alert.alert(
      isDeactivating ? 'Deactivate Member?' : 'Activate Member?',
      isDeactivating
        ? `Block ${member.name} from logging in until reactivated.`
        : `Restore full access for ${member.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isDeactivating ? 'Deactivate' : 'Activate',
          style: isDeactivating ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', member.uid), { status: next });
              logActivity({
                type: next === 'inactive' ? 'member_deactivated' : 'member_reactivated',
                actorId: auth.currentUser?.uid || '', actorName: adminProfile.name || 'Admin', actorRole: 'admin',
                payload: { memberId: member.uid, memberName: member.name || 'Member' },
              });
              setMembers(prev => prev.map(m => m.uid === member.uid ? { ...m, status: next } : m));
              if (selectedMember?.uid === member.uid) setSelectedMember(p => ({ ...p, status: next }));
            } catch (e) { Alert.alert('Error', e.message); }
          },
        },
      ]
    );
  };

  const changeLevel = async (member, newLevel) => {
    const oldLevel = member.experience || 'Beginner';
    if (oldLevel === newLevel) return;
    try {
      const me = auth.currentUser;
      await updateDoc(doc(db, 'users', member.uid), { experience: newLevel });
      try { await setDoc(doc(db, 'stats', member.uid), { experience: newLevel }, { merge: true }); } catch (_) {}
      await addDoc(collection(db, 'notifications'), {
        title: `🎚 Level Updated: ${newLevel}`,
        message: `Admin ${adminProfile.name || 'Admin'} ${LEVELS.indexOf(newLevel) > LEVELS.indexOf(oldLevel) ? 'promoted' : 'moved'} you to ${newLevel}.`,
        audience: 'member', targetUserId: member.uid,
        type: 'level_change', oldLevel, newLevel,
        from: adminProfile.name || 'Admin', createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'levelChanges'), {
        memberId: member.uid, memberName: member.name || 'Member',
        oldLevel, newLevel,
        changedBy: me?.uid || '', changedByName: adminProfile.name || 'Admin', changedByRole: 'admin',
        createdAt: serverTimestamp(),
      });
      logActivity({
        type: 'level_change', actorId: me?.uid || '', actorName: adminProfile.name || 'Admin', actorRole: 'admin',
        payload: { memberId: member.uid, memberName: member.name, oldLevel, newLevel, isPromote: LEVELS.indexOf(newLevel) > LEVELS.indexOf(oldLevel) },
      });
      setMembers(prev => prev.map(m => m.uid === member.uid ? { ...m, experience: newLevel } : m));
      setSelectedMember(p => ({ ...p, experience: newLevel }));
      setShowLevel(false);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const sendMessage = async () => {
    if (!msgText.trim() || !selectedMember || sendingMsg) return;
    setSendingMsg(true);
    const adminUid = auth.currentUser?.uid;
    try {
      await addDoc(collection(db, 'messages'), {
        participants: [adminUid, selectedMember.uid],
        from: adminUid, fromName: adminProfile.name || 'Admin',
        to: selectedMember.uid, toName: selectedMember.name || 'Member',
        text: msgText.trim(), createdAt: serverTimestamp(),
      });
      setMsgText('');
    } catch (e) { Alert.alert('Error', 'Could not send message.'); }
    setSendingMsg(false);
  };

  const permanentlyDelete = async () => {
    if (!selectedMember) return;
    const uid    = selectedMember.uid;
    const me     = auth.currentUser;
    setDeleting(true);
    try {
      // Audit entry first
      await setDoc(doc(db, 'deletions', uid), {
        memberId: uid, memberName: selectedMember.name || 'Unknown',
        memberEmail: selectedMember.email || '', memberRole: 'member',
        deletedBy: me?.uid || '', deletedByName: adminProfile.name || 'Admin',
        deletedAt: serverTimestamp(), reason: 'Admin permanent deletion',
      });
      // Delete sub-collections
      const collections = [
        query(collection(db, 'bookings'),          where('userId', '==', uid)),
        query(collection(db, 'feedback'),           where('memberId', '==', uid)),
        query(collection(db, 'messages'),           where('participants', 'array-contains', uid)),
        query(collection(db, 'notifications'),      where('targetUserId', '==', uid)),
        query(collection(db, 'adaptiveDecisions'),  where('userId', '==', uid)),
        query(collection(db, 'levelChanges'),       where('memberId', '==', uid)),
      ];
      for (const q of collections) {
        const snap = await getDocs(q);
        if (snap.docs.length > 0) {
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      try { await deleteDoc(doc(db, 'stats', uid)); }    catch (_) {}
      try { await deleteDoc(doc(db, 'workouts', uid)); } catch (_) {}
      await deleteDoc(doc(db, 'users', uid));
      logActivity({
        type: 'member_deleted', actorId: me?.uid || '', actorName: adminProfile.name || 'Admin', actorRole: 'admin',
        payload: { memberId: uid, memberName: selectedMember.name || 'Member' },
      });
      setMembers(prev => prev.filter(m => m.uid !== uid));
      setSelectedMember(null);
      setShowDelete(false);
      setDeleteTyped('');
      Alert.alert('Done', `${selectedMember.name} has been permanently deleted.`);
    } catch (e) { Alert.alert('Error', e.message); console.error(e); }
    finally { setDeleting(false); }
  };

  // ── COACH ACTIONS ─────────────────────────────────────────────
  const approveCoach = async (coach) => {
    Alert.alert('Approve Coach?', `Approve ${coach.name} as a coach?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve', onPress: async () => {
          try {
            await updateDoc(doc(db, 'users', coach.uid), { role: 'coach', approved: true, status: 'active' });
            loadUsers();
          } catch (e) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const rejectCoach = async (coach) => {
    Alert.alert('Reject Coach?', `Reject ${coach.name}'s application?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject', style: 'destructive', onPress: async () => {
          try {
            await updateDoc(doc(db, 'users', coach.uid), { role: 'coach_rejected', approved: false });
            loadUsers();
          } catch (e) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const toggleCoachStatus = async (coach) => {
    const next = coach.status === 'inactive' ? 'active' : 'inactive';
    Alert.alert(
      next === 'inactive' ? 'Deactivate Coach?' : 'Activate Coach?',
      next === 'inactive' ? `Block ${coach.name} from logging in?` : `Restore ${coach.name}'s coach access?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next === 'inactive' ? 'Deactivate' : 'Activate',
          style: next === 'inactive' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', coach.uid), { status: next });
              setCoaches(prev => prev.map(c => c.uid === coach.uid ? { ...c, status: next } : c));
            } catch (e) { Alert.alert('Error', e.message); }
          },
        },
      ]
    );
  };

  const filteredMembers = members.filter(m =>
    !searchQ || m.name?.toLowerCase().includes(searchQ.toLowerCase()) || m.email?.toLowerCase().includes(searchQ.toLowerCase())
  );

  const deleteMatch = deleteTyped.trim().toLowerCase() === (selectedMember?.name || '').trim().toLowerCase()
    && (selectedMember?.name || '').length > 0;

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* ── LEVEL CONTROL MODAL ── */}
      <Modal visible={showLevel} transparent animationType="slide" onRequestClose={() => setShowLevel(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>🎚 Level Control</Text>
              <TouchableOpacity onPress={() => setShowLevel(false)}>
                <Ionicons name="close" size={22} color={C.gray} />
              </TouchableOpacity>
            </View>
            {selectedMember && (
              <Text style={s.modalSub}>
                Move <Text style={{ color: C.white, fontWeight: '800' }}>{selectedMember.name}</Text> — currently <Text style={{ color: LEVEL_COLORS[selectedMember.experience] || C.gold }}>{selectedMember.experience || 'Beginner'}</Text>
              </Text>
            )}
            <View style={{ gap: 10, marginTop: 16 }}>
              {LEVELS.map(level => {
                const lc       = LEVEL_COLORS[level] || C.gold;
                const isCurrent = level === (selectedMember?.experience || 'Beginner');
                const isPromote = LEVELS.indexOf(level) > LEVELS.indexOf(selectedMember?.experience || 'Beginner');
                return (
                  <TouchableOpacity
                    key={level}
                    style={[s.levelOpt, { borderColor: lc + '44', backgroundColor: lc + '11' }, isCurrent && { opacity: 0.4 }]}
                    onPress={() => selectedMember && !isCurrent && changeLevel(selectedMember, level)}
                    disabled={isCurrent}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 22 }}>{LEVEL_ICONS[level]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.levelOptName, { color: isCurrent ? C.gray : lc }]}>{level}</Text>
                      <Text style={s.levelOptSub}>
                        {isCurrent ? 'Current level' : isPromote ? '⬆ Promote — harder workouts' : '⬇ Move down — lighter workouts'}
                      </Text>
                    </View>
                    {!isCurrent && (
                      <View style={[s.levelArrow, { backgroundColor: lc + '22', borderColor: lc + '44' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: lc }}>{isPromote ? 'UP →' : 'DOWN →'}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── DELETE CONFIRM MODAL ── */}
      <Modal visible={showDelete} transparent animationType="slide" onRequestClose={() => !deleting && setShowDelete(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={s.modalOverlay}>
            <View style={[s.modalCard, { borderColor: C.red + '44' }]}>
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: C.red }]}>🗑 Permanent Delete</Text>
                {!deleting && (
                  <TouchableOpacity onPress={() => { setShowDelete(false); setDeleteTyped(''); }}>
                    <Ionicons name="close" size={22} color={C.gray} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.modalSub}>This will permanently erase all data for this member including bookings, feedback, messages, workouts and stats. This cannot be undone.</Text>

              {selectedMember && (
                <View style={[s.deleteMemberCard, { borderColor: C.red + '33' }]}>
                  <View style={[s.deleteAvatar, { backgroundColor: C.red + '22', borderColor: C.red }]}>
                    <Text style={[s.deleteAvatarText, { color: C.red }]}>{(selectedMember.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.deleteName}>{selectedMember.name}</Text>
                    <Text style={s.deleteEmail}>{selectedMember.email || '—'}</Text>
                  </View>
                </View>
              )}

              <Text style={s.deletePrompt}>
                Type <Text style={{ color: C.gold, fontWeight: '800' }}>{selectedMember?.name}</Text> to confirm:
              </Text>
              <TextInput
                style={[s.deleteInput, deleteMatch && { borderColor: C.green, color: C.green }]}
                value={deleteTyped}
                onChangeText={setDeleteTyped}
                placeholder={`Type "${selectedMember?.name}"`}
                placeholderTextColor={C.gray}
                autoCapitalize="words"
                editable={!deleting}
              />
              {deleteMatch && <Text style={{ color: C.green, fontSize: 11, fontWeight: '700' }}>✓ Name matches — deletion unlocked</Text>}

              <View style={s.deleteActions}>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => { setShowDelete(false); setDeleteTyped(''); }}
                  disabled={deleting}
                >
                  <Text style={s.cancelBtnText}>Keep User</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.deleteBtn, !deleteMatch && { opacity: 0.4 }]}
                  onPress={permanentlyDelete}
                  disabled={!deleteMatch || deleting}
                  activeOpacity={0.85}
                >
                  {deleting
                    ? <ActivityIndicator size="small" color={C.white} />
                    : <Text style={s.deleteBtnText}>🗑 Delete Forever</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MESSAGE MODAL ── */}
      <Modal visible={showMsg} transparent animationType="slide" onRequestClose={() => setShowMsg(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '85%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>💬 Message {selectedMember?.name?.split(' ')[0]}</Text>
              <TouchableOpacity onPress={() => setShowMsg(false)}>
                <Ionicons name="close" size={22} color={C.gray} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1, marginVertical: 10 }}>
              {msgThread.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 30 }}>
                  <Text style={{ fontSize: 32 }}>💬</Text>
                  <Text style={{ color: C.gray, fontSize: 13, marginTop: 8 }}>Start a conversation</Text>
                </View>
              ) : msgThread.map((m, i) => {
                const isMe = m.from === auth.currentUser?.uid;
                return (
                  <View key={m.id || i} style={[s.msgRow, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                    <View style={[s.msgBubble, isMe ? s.msgMe : s.msgThem]}>
                      <Text style={s.msgText}>{m.text}</Text>
                      <Text style={s.msgMeta}>{isMe ? 'You' : m.fromName}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={s.msgInputRow}>
              <TextInput
                style={s.msgInput}
                value={msgText}
                onChangeText={setMsgText}
                placeholder="Type a message..."
                placeholderTextColor={C.gray}
                multiline
              />
              <TouchableOpacity
                style={[s.msgSendBtn, (!msgText.trim() || sendingMsg) && { opacity: 0.4 }]}
                onPress={sendMessage}
                disabled={!msgText.trim() || sendingMsg}
              >
                {sendingMsg ? <ActivityIndicator size="small" color={C.white} /> : <Ionicons name="send" size={18} color={C.white} />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MEMBER ACTION MODAL ── */}
      {selectedMember && !showLevel && !showDelete && !showMsg && (
        <Modal visible={!!selectedMember} transparent animationType="slide" onRequestClose={() => setSelectedMember(null)}>
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>{selectedMember.name}</Text>
                <TouchableOpacity onPress={() => setSelectedMember(null)}>
                  <Ionicons name="close" size={22} color={C.gray} />
                </TouchableOpacity>
              </View>

              {/* Member stats strip */}
              {(() => {
                const lc = LEVEL_COLORS[selectedMember.experience] || C.gold;
                const isActive = selectedMember.status !== 'inactive';
                return (
                  <>
                    <View style={[s.memberDetailCard, { borderColor: lc + '33' }]}>
                      <View style={[s.memberDetailAvatar, { borderColor: lc, backgroundColor: lc + '22' }]}>
                        <Text style={[s.memberDetailAvatarText, { color: lc }]}>{(selectedMember.name || '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                          <View style={[s.chip, { backgroundColor: lc + '22', borderColor: lc + '44' }]}>
                            <Text style={[s.chipText, { color: lc }]}>{LEVEL_ICONS[selectedMember.experience]} {selectedMember.experience || 'Beginner'}</Text>
                          </View>
                          <View style={[s.chip, { backgroundColor: isActive ? C.green + '22' : C.red + '22', borderColor: isActive ? C.green + '44' : C.red + '44' }]}>
                            <Text style={[s.chipText, { color: isActive ? C.green : C.red }]}>{isActive ? 'Active' : 'Inactive'}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 10, color: C.gray }}>{selectedMember.email || '—'}</Text>
                      </View>
                    </View>

                    {/* Quick stats */}
                    <View style={s.statsStrip}>
                      {[
                        { icon: '🥊', val: selectedMember.totalWorkouts || 0, color: C.gold   },
                        { icon: '🔥', val: `${selectedMember.streak || 0}d`, color: C.red    },
                        { icon: '📅', val: `${selectedMember.weeklyPct || 0}%`, color: C.green },
                      ].map((st, i) => (
                        <View key={i} style={[s.statCell, i < 2 && { borderRightWidth: 1, borderRightColor: C.border }]}>
                          <Text style={{ fontSize: 16 }}>{st.icon}</Text>
                          <Text style={[{ fontSize: 16, fontWeight: '800', color: st.color }]}>{st.val}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Action buttons */}
                    <View style={s.actionGrid}>
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.purple + '44', backgroundColor: C.purple + '18' }]}
                        onPress={() => setShowLevel(true)}>
                        <Ionicons name="bar-chart-outline" size={20} color={C.purple} />
                        <Text style={[s.actionBtnText, { color: C.purple }]}>Level</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[s.actionBtn, { borderColor: (isActive ? C.red : C.green) + '44', backgroundColor: (isActive ? C.red : C.green) + '18' }]}
                        onPress={() => toggleMemberStatus(selectedMember)}
                      >
                        <Ionicons name={isActive ? 'pause-outline' : 'play-outline'} size={20} color={isActive ? C.red : C.green} />
                        <Text style={[s.actionBtnText, { color: isActive ? C.red : C.green }]}>{isActive ? 'Deactivate' : 'Activate'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.blue + '44', backgroundColor: C.blue + '18' }]}
                        onPress={() => setShowMsg(true)}>
                        <Ionicons name="chatbubble-outline" size={20} color={C.blue} />
                        <Text style={[s.actionBtnText, { color: C.blue }]}>Message</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[s.actionBtn, { borderColor: C.red + '44', backgroundColor: C.red + '18' }]}
                        onPress={() => { setDeleteTyped(''); setShowDelete(true); }}
                      >
                        <Ionicons name="trash-outline" size={20} color={C.red} />
                        <Text style={[s.actionBtnText, { color: C.red }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>
      )}

      {/* ── HEADER ── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>👥 Users</Text>
        <View style={s.headerCounts}>
          <Text style={s.headerCount}>{members.length} members</Text>
          {pending.length > 0 && (
            <View style={s.pendingBadge}>
              <Text style={s.pendingBadgeText}>⏳ {pending.length} pending</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── SUB-TABS ── */}
      <View style={s.subTabRow}>
        {[
          { id: 'members', label: 'Members', count: members.length },
          { id: 'coaches', label: 'Coaches', count: coaches.length + pending.length },
        ].map(t => {
          const active = subTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[s.subTab, active && s.subTabActive]}
              onPress={() => setSubTab(t.id)}
            >
              <Text style={[s.subTabText, active && s.subTabTextActive]}>{t.label}</Text>
              <View style={[s.subTabCount, active && s.subTabCountActive]}>
                <Text style={[s.subTabCountText, active && { color: C.red }]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── MEMBERS TAB ── */}
      {subTab === 'members' && (
        <>
          <View style={s.searchRow}>
            <View style={s.searchBox}>
              <Ionicons name="search-outline" size={16} color={C.gray} />
              <TextInput
                style={s.searchInput}
                placeholder="Search by name or email..."
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
          </View>

          <ScrollView
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadUsers(); }} tintColor={C.red} />}
          >
            {filteredMembers.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={{ fontSize: 40 }}>👥</Text>
                <Text style={s.emptyTitle}>No members found</Text>
              </View>
            ) : (
              filteredMembers.map(m => {
                const lc       = LEVEL_COLORS[m.experience] || C.gold;
                const li       = LEVEL_ICONS[m.experience]  || '🥊';
                const isActive = m.status !== 'inactive';
                return (
                  <TouchableOpacity
                    key={m.uid}
                    style={[s.memberRow, { borderColor: lc + '22', opacity: isActive ? 1 : 0.6 }]}
                    onPress={() => setSelectedMember(m)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.memberAccent, { backgroundColor: lc }]} />
                    <View style={[s.memberAvatar, { borderColor: lc, backgroundColor: lc + '22' }]}>
                      <Text style={[s.memberAvatarText, { color: lc }]}>{(m.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={s.memberInfo}>
                      <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <View style={[s.chip, { backgroundColor: lc + '22', borderColor: lc + '44' }]}>
                          <Text style={[s.chipText, { color: lc }]}>{li} {m.experience || 'Beginner'}</Text>
                        </View>
                        <View style={[s.chip, { backgroundColor: isActive ? C.green + '18' : C.red + '18', borderColor: isActive ? C.green + '33' : C.red + '33' }]}>
                          <Text style={[s.chipText, { color: isActive ? C.green : C.red }]}>{isActive ? 'Active' : 'Inactive'}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.memberMeta}>
                      <Text style={[s.memberStat, { color: C.gold }]}>{m.totalWorkouts || 0}🥊</Text>
                      <Text style={[s.memberStat, { color: C.red }]}>🔥{m.streak || 0}d</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={C.gray} />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </>
      )}

      {/* ── COACHES TAB ── */}
      {subTab === 'coaches' && (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadUsers(); }} tintColor={C.red} />}
        >
          {/* Pending approvals */}
          {pending.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>⏳ Pending Approvals ({pending.length})</Text>
              {pending.map(p => (
                <View key={p.uid} style={s.pendingRow}>
                  <View style={[s.coachAvatar, { backgroundColor: C.gold + '22', borderColor: C.gold }]}>
                    <Text style={[s.coachAvatarText, { color: C.gold }]}>{(p.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.coachName}>{p.name}</Text>
                    <Text style={s.coachEmail}>{p.email || '—'}</Text>
                  </View>
                  <View style={s.pendingActions}>
                    <TouchableOpacity style={s.approveBtn} onPress={() => approveCoach(p)}>
                      <Text style={s.approveBtnText}>✓ Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.rejectBtn} onPress={() => rejectCoach(p)}>
                      <Text style={s.rejectBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Active coaches */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🥊 Approved Coaches ({coaches.length})</Text>
            {coaches.length === 0 ? (
              <Text style={s.emptyText}>No approved coaches yet</Text>
            ) : coaches.map(c => {
              const isActive = c.status !== 'inactive';
              return (
                <View key={c.uid} style={[s.coachRow, { opacity: isActive ? 1 : 0.6 }]}>
                  <View style={[s.coachAvatar, { backgroundColor: C.blue + '22', borderColor: C.blue }]}>
                    <Text style={[s.coachAvatarText, { color: C.blue }]}>{(c.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.coachName}>{c.name}</Text>
                    <Text style={s.coachEmail}>{c.email || '—'}</Text>
                  </View>
                  <View style={[s.statusDot, { backgroundColor: isActive ? C.green : C.red }]} />
                  <TouchableOpacity style={s.coachActionBtn} onPress={() => toggleCoachStatus(c)}>
                    <Ionicons name={isActive ? 'pause-outline' : 'play-outline'} size={16} color={isActive ? C.red : C.green} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.coachActionBtn, { borderColor: C.blue + '44' }]} onPress={() => {
                    setSelectedMember(null); // use a simple alert message modal for coaches
                    Alert.alert('Message', `Message ${c.name} — coming soon.`);
                  }}>
                    <Ionicons name="chatbubble-outline" size={16} color={C.blue} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 10, paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.white },
  headerCounts: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerCount: { fontSize: 12, color: C.gray },
  pendingBadge: { backgroundColor: C.gold + '22', borderRadius: 50, borderWidth: 1, borderColor: C.gold + '44', paddingHorizontal: 10, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 10, fontWeight: '800', color: C.gold },
  subTabRow: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  subTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  subTabActive: { backgroundColor: C.red + '18', borderColor: C.red + '44' },
  subTabText: { fontSize: 13, fontWeight: '700', color: C.gray },
  subTabTextActive: { color: C.red },
  subTabCount: { backgroundColor: C.border, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 1 },
  subTabCountActive: { backgroundColor: C.red + '22' },
  subTabCountText: { fontSize: 11, fontWeight: '700', color: C.gray },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },
  emptyBox: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.white },
  emptyText: { fontSize: 12, color: C.gray, textAlign: 'center', paddingVertical: 20 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.border, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.white },

  // Member row
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, padding: 14, overflow: 'hidden', position: 'relative' },
  memberAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  memberAvatarText: { fontSize: 18, fontWeight: '900' },
  memberInfo: { flex: 1, gap: 6 },
  memberName: { fontSize: 14, fontWeight: '800', color: C.white },
  memberMeta: { alignItems: 'flex-end', gap: 4 },
  memberStat: { fontSize: 12, fontWeight: '700' },
  chip: { borderRadius: 50, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 9, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: C.white },
  modalSub: { fontSize: 13, color: C.gray, lineHeight: 20, marginBottom: 8 },

  // Member detail in modal
  memberDetailCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  memberDetailAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  memberDetailAvatarText: { fontSize: 22, fontWeight: '900' },
  statsStrip: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 16 },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 4 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5, paddingVertical: 14 },
  actionBtnText: { fontSize: 13, fontWeight: '800' },

  // Level options
  levelOpt: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  levelOptName: { fontSize: 15, fontWeight: '800' },
  levelOptSub: { fontSize: 11, color: C.gray, marginTop: 2 },
  levelArrow: { borderRadius: 50, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },

  // Delete modal
  deleteMemberCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, backgroundColor: C.red + '08', padding: 12, marginVertical: 12 },
  deleteAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  deleteAvatarText: { fontSize: 18, fontWeight: '900' },
  deleteName: { fontSize: 14, fontWeight: '800', color: C.white },
  deleteEmail: { fontSize: 11, color: C.gray },
  deletePrompt: { fontSize: 12, color: C.gray, marginBottom: 8 },
  deleteInput: { backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: C.red + '44', paddingHorizontal: 14, height: 48, color: C.white, fontSize: 14, fontFamily: 'monospace', marginBottom: 6 },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, backgroundColor: C.inputBg, borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: C.gray },
  deleteBtn: { flex: 1.3, backgroundColor: C.red, borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center' },
  deleteBtnText: { fontSize: 13, fontWeight: '800', color: C.white },

  // Messaging
  msgRow: { flexDirection: 'row', marginVertical: 3, paddingHorizontal: 4 },
  msgBubble: { maxWidth: '78%', borderRadius: 14, padding: 10, borderWidth: 1 },
  msgMe: { backgroundColor: C.red + '22', borderColor: C.red + '44' },
  msgThem: { backgroundColor: C.inputBg, borderColor: C.border },
  msgText: { fontSize: 13, color: C.white, lineHeight: 20 },
  msgMeta: { fontSize: 9, color: C.gray, marginTop: 4 },
  msgInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 10 },
  msgInput: { flex: 1, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, color: C.white, fontSize: 14, maxHeight: 100 },
  msgSendBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center' },

  // Coach list
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  coachAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  coachAvatarText: { fontSize: 16, fontWeight: '900' },
  coachName: { fontSize: 13, fontWeight: '700', color: C.white },
  coachEmail: { fontSize: 10, color: C.gray },
  pendingActions: { flexDirection: 'row', gap: 6 },
  approveBtn: { backgroundColor: C.green + '22', borderRadius: 50, borderWidth: 1, borderColor: C.green + '44', paddingHorizontal: 12, paddingVertical: 6 },
  approveBtnText: { fontSize: 11, fontWeight: '800', color: C.green },
  rejectBtn: { backgroundColor: C.red + '18', borderRadius: 50, borderWidth: 1, borderColor: C.red + '33', paddingHorizontal: 10, paddingVertical: 6 },
  rejectBtnText: { fontSize: 11, fontWeight: '800', color: C.red },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  coachActionBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
});