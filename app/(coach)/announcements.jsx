import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import {
  collection, onSnapshot, addDoc, deleteDoc,
  doc, getDoc, orderBy, query, serverTimestamp,
  updateDoc, arrayUnion,
} from 'firebase/firestore';
import { ACTIVITY_TYPES } from '../../lib/activityLog';

const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  blue: '#42a5f5', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842', red: '#E63946',
};

const SYSTEM_EVENT_TYPES = [
  'booking_created','booking_cancelled','class_created','class_deleted',
  'class_ended','class_thanks','level_change','member_signup',
  'member_deactivated','member_reactivated','member_deleted',
];

function formatRelativeTime(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AnnouncementsScreen() {
  const [subTab,          setSubTab]          = useState('announcements');
  const [allNotifs,       setAllNotifs]        = useState([]);
  const [activity,        setActivity]         = useState([]);
  const [dismissedNotifs, setDismissedNotifs]  = useState([]);
  const [coachProfile,    setCoachProfile]     = useState({ name: 'Coach' });
  const [showPost,        setShowPost]         = useState(false);
  const [form,            setForm]             = useState({ title: '', message: '' });
  const [posting,         setPosting]          = useState(false);

  // Load coach profile + dismissed list (real-time)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (s) => {
      if (!s.exists()) return;
      const d = s.data();
      setCoachProfile(d);
      setDismissedNotifs(Array.isArray(d.dismissedNotifs) ? d.dismissedNotifs : []);
    }, console.error);
    return () => unsub();
  }, []);

  // Load notifications (real-time)
  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllNotifs(all);
    }, console.error);
    return () => unsub();
  }, []);

  // Load activity feed (real-time)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'activity'), (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setActivity(items);
    }, console.error);
    return () => unsub();
  }, []);

  // Derived
  const realAnnouncements  = allNotifs.filter(n => !n.type || !SYSTEM_EVENT_TYPES.includes(n.type));
  const visibleAnnouncements = realAnnouncements.filter(n => !dismissedNotifs.includes(n.id));
  const myUid = auth.currentUser?.uid;

  const postAnnouncement = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      Alert.alert('Missing info', 'Please fill in both title and message.');
      return;
    }
    setPosting(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title:    form.title.trim(),
        message:  form.message.trim(),
        audience: 'all',
        from:     coachProfile.name || 'Coach',
        fromUid:  myUid || '',
        createdAt: serverTimestamp(),
      });
      setForm({ title: '', message: '' });
      setShowPost(false);
    } catch (e) {
      Alert.alert('Error', 'Could not post announcement. Check Firestore rules.');
      console.error(e);
    } finally { setPosting(false); }
  };

  const dismissAnnouncement = async (notifId) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { dismissedNotifs: arrayUnion(notifId) });
    } catch (e) { console.error(e); }
  };

  const deleteActivity = async (eventId) => {
    try { await deleteDoc(doc(db, 'activity', eventId)); }
    catch (e) { Alert.alert('Error', 'Could not delete activity event.'); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Post modal */}
      <Modal visible={showPost} transparent animationType="slide" onRequestClose={() => setShowPost(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📢 Post Announcement</Text>
              <TouchableOpacity onPress={() => setShowPost(false)}>
                <Ionicons name="close" size={22} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Sent to all members</Text>

            <View style={styles.audienceBadge}>
              <Ionicons name="megaphone-outline" size={16} color={COLORS.gold} />
              <Text style={styles.audienceBadgeText}>Audience: All Members 🔒</Text>
            </View>

            <View style={{ gap: 12, marginTop: 16 }}>
              <TextInput
                style={styles.formInput}
                value={form.title}
                onChangeText={v => setForm(p => ({ ...p, title: v }))}
                placeholder="Announcement title..."
                placeholderTextColor={COLORS.gray}
                autoCapitalize="sentences"
              />
              <TextInput
                style={[styles.formInput, { minHeight: 100, textAlignVertical: 'top' }]}
                value={form.message}
                onChangeText={v => setForm(p => ({ ...p, message: v }))}
                placeholder="Write your message..."
                placeholderTextColor={COLORS.gray}
                multiline
                numberOfLines={4}
                autoCapitalize="sentences"
              />
            </View>

            <TouchableOpacity
              style={[styles.postBtn, posting && { opacity: 0.6 }]}
              onPress={postAnnouncement}
              disabled={posting}
            >
              {posting
                ? <ActivityIndicator size="small" color={COLORS.white} />
                : <Text style={styles.postBtnText}>Send 📢</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📢 Announcements</Text>
        <TouchableOpacity style={styles.postFab} onPress={() => setShowPost(true)}>
          <Ionicons name="add" size={18} color={COLORS.white} />
          <Text style={styles.postFabText}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Sub-tab toggle */}
      <View style={styles.subTabRow}>
        {[
          { id: 'announcements', icon: 'megaphone-outline', label: 'Announcements', count: visibleAnnouncements.length, color: COLORS.gold },
          { id: 'activity',      icon: 'flash-outline',     label: 'Activity Feed',  count: activity.length,            color: COLORS.blue },
        ].map(t => {
          const active = subTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.subTab, active && { backgroundColor: t.color + '18', borderColor: t.color + '44' }]}
              onPress={() => setSubTab(t.id)}
              activeOpacity={0.8}
            >
              <Ionicons name={t.icon} size={16} color={active ? t.color : COLORS.gray} />
              <Text style={[styles.subTabText, active && { color: t.color }]}>{t.label}</Text>
              <View style={[styles.subTabCount, active && { backgroundColor: t.color + '33' }]}>
                <Text style={[styles.subTabCountText, active && { color: t.color }]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── ANNOUNCEMENTS TAB ── */}
      {subTab === 'announcements' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {visibleAnnouncements.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 48 }}>📭</Text>
              <Text style={styles.emptyTitle}>No Announcements</Text>
              <Text style={styles.emptySub}>Post your first announcement to your members</Text>
              <TouchableOpacity style={styles.postBtn} onPress={() => setShowPost(true)}>
                <Text style={styles.postBtnText}>📢 Post Announcement</Text>
              </TouchableOpacity>
            </View>
          ) : (
            visibleAnnouncements.map(n => {
              const isOwn = n.fromUid === myUid;
              return (
                <View key={n.id} style={styles.announcementCard}>
                  <View style={styles.announcementAccent} />
                  <View style={styles.announcementIcon}>
                    <Text style={{ fontSize: 18 }}>📢</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.announcementTitleRow}>
                      <Text style={styles.announcementTitle} numberOfLines={2}>{n.title}</Text>
                      {isOwn && (
                        <View style={styles.yoursBadge}>
                          <Text style={styles.yoursBadgeText}>YOURS</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.announcementMsg}>{n.message}</Text>
                    <Text style={styles.announcementFrom}>From: {n.from || 'Coach'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.dismissBtn}
                    onPress={() => dismissAnnouncement(n.id)}
                  >
                    <Ionicons name="eye-off-outline" size={16} color={COLORS.gray} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── ACTIVITY TAB ── */}
      {subTab === 'activity' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {activity.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 48 }}>⚡</Text>
              <Text style={styles.emptyTitle}>No Activity Yet</Text>
              <Text style={styles.emptySub}>System events will appear here as members interact with the gym</Text>
            </View>
          ) : (
            activity.map(ev => {
              const t  = ACTIVITY_TYPES[ev.type] || { icon: '⚡', color: COLORS.gray, label: 'Event' };
              const ts = ev.createdAt?.seconds ? new Date(ev.createdAt.seconds * 1000) : null;
              return (
                <View key={ev.id} style={[styles.activityCard, { borderColor: t.color + '33' }]}>
                  <View style={[styles.activityIcon, { backgroundColor: t.color + '22', borderColor: t.color + '44' }]}>
                    <Text style={{ fontSize: 16 }}>{t.icon}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.activityHeaderRow}>
                      <View style={[styles.activityTypeBadge, { backgroundColor: t.color + '18' }]}>
                        <Text style={[styles.activityTypeText, { color: t.color }]}>{t.label}</Text>
                      </View>
                      {ev.actorRole && (
                        <View style={styles.activityRoleBadge}>
                          <Text style={styles.activityRoleText}>{ev.actorRole}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.activityDesc}>{ev.description}</Text>
                    <View style={styles.activityMeta}>
                      {ev.actorName && <Text style={styles.activityActor}>by {ev.actorName}</Text>}
                      {ts && <Text style={styles.activityTime}>{formatRelativeTime(ts)}</Text>}
                    </View>
                  </View>
                  <TouchableOpacity style={styles.activityDelete} onPress={() => deleteActivity(ev.id)}>
                    <Ionicons name="trash-outline" size={14} color={COLORS.gray} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white },
  postFab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.gold, borderRadius: 50,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  postFabText: { color: '#000', fontSize: 13, fontWeight: '800' },

  subTabRow: { flexDirection: 'row', gap: 8, padding: 12 },
  subTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  subTabText:      { fontSize: 12, fontWeight: '700', color: COLORS.gray },
  subTabCount: {
    backgroundColor: COLORS.border, borderRadius: 50,
    paddingHorizontal: 7, paddingVertical: 1,
  },
  subTabCountText: { fontSize: 10, fontWeight: '700', color: COLORS.gray },

  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },

  emptyBox:   { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  emptySub:   { fontSize: 13, color: COLORS.gray, textAlign: 'center', paddingHorizontal: 20 },

  // Announcement card
  announcementCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.gold + '33',
    padding: 14, overflow: 'hidden',
  },
  announcementAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, backgroundColor: COLORS.gold,
  },
  announcementIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: COLORS.gold + '22',
    justifyContent: 'center', alignItems: 'center',
  },
  announcementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  announcementTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.white },
  yoursBadge: {
    backgroundColor: COLORS.green + '22', borderRadius: 50,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: COLORS.green + '44',
  },
  yoursBadgeText: { fontSize: 8, fontWeight: '800', color: COLORS.green },
  announcementMsg:  { fontSize: 13, color: COLORS.gray, lineHeight: 20, marginBottom: 6 },
  announcementFrom: { fontSize: 10, color: '#555' },
  dismissBtn:       { padding: 4 },

  // Activity card
  activityCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, padding: 12,
  },
  activityIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  activityHeaderRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  activityTypeBadge: { borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  activityTypeText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  activityRoleBadge: {
    backgroundColor: COLORS.inputBg, borderRadius: 50,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: COLORS.border,
  },
  activityRoleText: { fontSize: 8, color: COLORS.gray, fontWeight: '700', textTransform: 'uppercase' },
  activityDesc:     { fontSize: 12, color: COLORS.lightGray, lineHeight: 18 },
  activityMeta:     { flexDirection: 'row', gap: 8 },
  activityActor:    { fontSize: 9, color: COLORS.gray, fontStyle: 'italic' },
  activityTime:     { fontSize: 9, color: COLORS.gray },
  activityDelete:   { padding: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, borderWidth: 1, borderColor: COLORS.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle:  { fontSize: 18, fontWeight: '900', color: COLORS.white },
  modalSub:    { fontSize: 13, color: COLORS.gray, marginBottom: 12 },
  audienceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.gold + '11', borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.gold + '33', padding: 12,
  },
  audienceBadgeText: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },
  formInput: {
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.white, fontSize: 14,
  },
  postBtn: {
    backgroundColor: COLORS.gold, borderRadius: 14, height: 52,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  postBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
});