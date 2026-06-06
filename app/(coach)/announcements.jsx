import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import {
  collection, onSnapshot, addDoc, deleteDoc,
  doc, orderBy, query, serverTimestamp,
  updateDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { ACTIVITY_TYPES } from '../../lib/activityLog';

const C = {
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

function fmtRelTime(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AnnouncementsScreen() {
  const router = useRouter();
  const [subTab,          setSubTab]         = useState('announcements');
  const [allNotifs,       setAllNotifs]      = useState([]);
  const [activity,        setActivity]       = useState([]);
  const [dismissedNotifs, setDismissedNotifs]= useState([]);
  const [coachProfile,    setCoachProfile]   = useState({ name: 'Coach' });
  const [showPost,        setShowPost]       = useState(false);
  const [form,            setForm]           = useState({ title: '', message: '' });
  const [posting,         setPosting]        = useState(false);
  const [showHidden,      setShowHidden]     = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), s => {
      if (!s.exists()) return;
      const d = s.data();
      setCoachProfile(d);
      setDismissedNotifs(Array.isArray(d.dismissedNotifs) ? d.dismissedNotifs : []);
    }, console.error);
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setAllNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, console.error);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'activity'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setActivity(items);
    }, console.error);
    return () => unsub();
  }, []);

  const realAnnouncements    = allNotifs.filter(n => !n.type || !SYSTEM_EVENT_TYPES.includes(n.type));
  const visibleAnnouncements = realAnnouncements.filter(n => !dismissedNotifs.includes(n.id));
  const hiddenAnnouncements  = realAnnouncements.filter(n =>  dismissedNotifs.includes(n.id));
  const myUid = auth.currentUser?.uid;

  const postAnnouncement = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      Alert.alert('Missing info', 'Please fill in both title and message.');
      return;
    }
    setPosting(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title: form.title.trim(), message: form.message.trim(),
        audience: 'all', from: coachProfile.name || 'Coach',
        fromUid: myUid || '', createdAt: serverTimestamp(),
      });
      setForm({ title: '', message: '' });
      setShowPost(false);
    } catch (e) {
      Alert.alert('Error', 'Could not post. Check Firestore rules.');
    } finally { setPosting(false); }
  };

  const dismissAnnouncement = async (id) => {
    const user = auth.currentUser;
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid), { dismissedNotifs: arrayUnion(id) }); }
    catch (e) { console.error(e); }
  };

  const unhideAnnouncement = async (id) => {
    const user = auth.currentUser;
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid), { dismissedNotifs: arrayRemove(id) }); }
    catch (e) { console.error(e); }
  };

  const deleteActivity = async (id) => {
    try { await deleteDoc(doc(db, 'activity', id)); }
    catch (e) { Alert.alert('Error', 'Could not delete.'); }
  };

  return (
    <SafeAreaView style={s.safe}>

      {/* ── POST MODAL ── */}
      <Modal visible={showPost} transparent animationType="slide" onRequestClose={() => setShowPost(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>📢 Post Announcement</Text>
              <TouchableOpacity onPress={() => setShowPost(false)}>
                <Ionicons name="close" size={22} color={C.gray} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>Sent to all members</Text>
            <View style={s.audienceBadge}>
              <Ionicons name="megaphone-outline" size={16} color={C.gold} />
              <Text style={s.audienceBadgeText}>Audience: All Members 🔒</Text>
            </View>
            <View style={{ gap: 12, marginTop: 16 }}>
              <TextInput
                style={s.formInput}
                value={form.title}
                onChangeText={v => setForm(p => ({ ...p, title: v }))}
                placeholder="Announcement title..."
                placeholderTextColor={C.gray}
                autoCapitalize="sentences"
              />
              <TextInput
                style={[s.formInput, { minHeight: 100, textAlignVertical: 'top' }]}
                value={form.message}
                onChangeText={v => setForm(p => ({ ...p, message: v }))}
                placeholder="Write your message..."
                placeholderTextColor={C.gray}
                multiline numberOfLines={4}
                autoCapitalize="sentences"
              />
            </View>
            <TouchableOpacity
              style={[s.postBtn, posting && { opacity: 0.6 }]}
              onPress={postAnnouncement} disabled={posting}
            >
              {posting
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={s.postBtnText}>Send 📢</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── HEADER ── */}
       <View style={s.header}>
        <TouchableOpacity style={s.coachBackBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>📢 Announcements</Text>
        <TouchableOpacity style={s.postFab} onPress={() => setShowPost(true)}>
          <Ionicons name="add" size={18} color="#000" />
          <Text style={s.postFabText}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* ── SUB-TABS ── */}
      <View style={s.subTabRow}>
        {[
          { id: 'announcements', icon: 'megaphone-outline', label: 'Announcements', count: visibleAnnouncements.length, color: C.gold },
          { id: 'activity',      icon: 'flash-outline',     label: 'Activity Feed',  count: activity.length,            color: C.blue },
        ].map(t => {
          const active = subTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[s.subTab, active && { backgroundColor: t.color + '18', borderColor: t.color + '44' }]}
              onPress={() => setSubTab(t.id)}
            >
              <Ionicons name={t.icon} size={16} color={active ? t.color : C.gray} />
              <Text style={[s.subTabText, active && { color: t.color }]}>{t.label}</Text>
              <View style={[s.subTabCount, active && { backgroundColor: t.color + '33' }]}>
                <Text style={[s.subTabCountText, active && { color: t.color }]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ══════════════════════════════════════════
           ANNOUNCEMENTS TAB
      ══════════════════════════════════════════ */}
      {subTab === 'announcements' && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── HIDDEN SECTION TOGGLE ── */}
          {hiddenAnnouncements.length > 0 && (
            <TouchableOpacity
              style={[s.hiddenToggle, showHidden && s.hiddenToggleOpen]}
              onPress={() => setShowHidden(v => !v)}
              activeOpacity={0.8}
            >
              <View style={s.hiddenToggleLeft}>
                <Ionicons
                  name={showHidden ? 'eye-outline' : 'eye-off-outline'}
                  size={16}
                  color={showHidden ? C.gold : C.gray}
                />
                <Text style={[s.hiddenToggleText, showHidden && { color: C.gold }]}>
                  Hidden Section ({hiddenAnnouncements.length})
                </Text>
              </View>
              <Ionicons
                name={showHidden ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={showHidden ? C.gold : C.gray}
              />
            </TouchableOpacity>
          )}

          {/* ── HIDDEN ANNOUNCEMENTS (top, grayed out) ── */}
          {showHidden && hiddenAnnouncements.map(n => (
            <View key={n.id} style={s.hiddenCard}>
              <View style={s.hiddenAccent} />
              <View style={s.hiddenIconBox}>
                <Ionicons name="eye-off-outline" size={18} color={C.gray} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={s.hiddenTitle} numberOfLines={1}>{n.title}</Text>
                  <View style={s.hiddenBadge}>
                    <Text style={s.hiddenBadgeText}>HIDDEN</Text>
                  </View>
                  {n.fromUid === myUid && (
                    <View style={s.yoursBadge}>
                      <Text style={s.yoursBadgeText}>YOURS</Text>
                    </View>
                  )}
                </View>
                <Text style={s.hiddenMsg} numberOfLines={2}>{n.message}</Text>
                <Text style={s.hiddenFrom}>From: {n.from || 'Coach'}</Text>
              </View>
              {/* Eye icon = restore/unhide */}
              <TouchableOpacity style={s.restoreBtn} onPress={() => unhideAnnouncement(n.id)}>
                <Ionicons name="eye-outline" size={16} color={C.gold} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Divider shown between hidden and visible sections */}
          {showHidden && hiddenAnnouncements.length > 0 && visibleAnnouncements.length > 0 && (
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerLabel}>VISIBLE TO YOU</Text>
              <View style={s.dividerLine} />
            </View>
          )}

          {/* ── VISIBLE ANNOUNCEMENTS ── */}
          {visibleAnnouncements.length === 0 && hiddenAnnouncements.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={{ fontSize: 48 }}>📭</Text>
              <Text style={s.emptyTitle}>No Announcements</Text>
              <Text style={s.emptySub}>Post your first announcement to your members</Text>
              <TouchableOpacity style={s.postBtn} onPress={() => setShowPost(true)}>
                <Text style={s.postBtnText}>📢 Post Announcement</Text>
              </TouchableOpacity>
            </View>
          ) : visibleAnnouncements.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={{ fontSize: 40 }}>👁</Text>
              <Text style={s.emptyTitle}>All Hidden</Text>
              <Text style={s.emptySub}>Tap the eye icon on a hidden announcement above to restore it.</Text>
            </View>
          ) : (
            visibleAnnouncements.map(n => (
              <View key={n.id} style={s.announcementCard}>
                <View style={s.announcementAccent} />
                <View style={s.announcementIconBox}>
                  <Text style={{ fontSize: 18 }}>📢</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.titleRow}>
                    <Text style={s.announcementTitle} numberOfLines={2}>{n.title}</Text>
                    {n.fromUid === myUid && (
                      <View style={s.yoursBadge}>
                        <Text style={s.yoursBadgeText}>YOURS</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.announcementMsg}>{n.message}</Text>
                  <Text style={s.announcementFrom}>From: {n.from || 'Coach'}</Text>
                </View>
                {/* Slashed eye = dismiss/hide */}
                <TouchableOpacity style={s.dismissBtn} onPress={() => dismissAnnouncement(n.id)}>
                  <Ionicons name="eye-off-outline" size={16} color={C.gray} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════
           ACTIVITY TAB
      ══════════════════════════════════════════ */}
      {subTab === 'activity' && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {activity.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={{ fontSize: 48 }}>⚡</Text>
              <Text style={s.emptyTitle}>No Activity Yet</Text>
              <Text style={s.emptySub}>System events will appear here as members interact with the gym</Text>
            </View>
          ) : (
            activity.map(ev => {
              const t  = ACTIVITY_TYPES[ev.type] || { icon: '⚡', color: C.gray, label: 'Event' };
              const ts = ev.createdAt?.seconds ? new Date(ev.createdAt.seconds * 1000) : null;
              return (
                <View key={ev.id} style={[s.activityCard, { borderColor: t.color + '33' }]}>
                  <View style={[s.activityIcon, { backgroundColor: t.color + '22', borderColor: t.color + '44' }]}>
                    <Text style={{ fontSize: 16 }}>{t.icon}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={s.activityTopRow}>
                      <View style={[s.activityTypeBadge, { backgroundColor: t.color + '18' }]}>
                        <Text style={[s.activityTypeText, { color: t.color }]}>{t.label}</Text>
                      </View>
                      {ev.actorRole && (
                        <View style={s.activityRoleBadge}>
                          <Text style={s.activityRoleText}>{ev.actorRole}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.activityDesc}>{ev.description}</Text>
                    <View style={s.activityMeta}>
                      {ev.actorName && <Text style={s.activityActor}>by {ev.actorName}</Text>}
                      {ts && <Text style={s.activityTime}>{fmtRelTime(ts)}</Text>}
                    </View>
                  </View>
                  <TouchableOpacity style={s.activityDelete} onPress={() => deleteActivity(ev.id)}>
                    <Ionicons name="trash-outline" size={14} color={C.gray} />
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.white },
  postFab: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.gold, borderRadius: 50, paddingHorizontal: 16, paddingVertical: 10 },
  postFabText: { color: '#000', fontSize: 13, fontWeight: '800' },

  subTabRow: { flexDirection: 'row', gap: 8, padding: 12 },
  subTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  subTabText:      { fontSize: 12, fontWeight: '700', color: C.gray },
  subTabCount:     { backgroundColor: C.border, borderRadius: 50, paddingHorizontal: 7, paddingVertical: 1 },
  subTabCountText: { fontSize: 10, fontWeight: '700', color: C.gray },

  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  emptyBox:  { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTitle:{ fontSize: 18, fontWeight: '800', color: C.white },
  emptySub:  { fontSize: 13, color: C.gray, textAlign: 'center', paddingHorizontal: 20 },

  // Hidden toggle
  hiddenToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 12 },
  hiddenToggleOpen: { borderColor: C.gold + '55', backgroundColor: C.gold + '08' },
  hiddenToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hiddenToggleText: { fontSize: 13, fontWeight: '700', color: C.gray },

  // Hidden card (grayed out)
  hiddenCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#111111', borderRadius: 16, borderWidth: 1, borderColor: '#252525', padding: 14, overflow: 'hidden', opacity: 0.65 },
  hiddenAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#333' },
  hiddenIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  hiddenTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: C.gray },
  hiddenMsg:   { fontSize: 12, color: '#555', lineHeight: 18, marginBottom: 4 },
  hiddenFrom:  { fontSize: 10, color: '#444' },
  hiddenBadge: { backgroundColor: '#2A2A2A', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#444' },
  hiddenBadgeText: { fontSize: 8, fontWeight: '800', color: C.gray },
  restoreBtn: { padding: 6, backgroundColor: C.gold + '18', borderRadius: 8, borderWidth: 1, borderColor: C.gold + '33' },

  // Divider
  divider:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: C.border },
  dividerLabel: { fontSize: 9, color: C.gray, fontWeight: '800', letterSpacing: 0.8 },

  // Normal announcement card
  announcementCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.gold + '33', padding: 14, overflow: 'hidden' },
  announcementAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.gold },
  announcementIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.gold + '22', justifyContent: 'center', alignItems: 'center' },
  titleRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  announcementTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: C.white },
  yoursBadge:        { backgroundColor: C.green + '22', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: C.green + '44' },
  yoursBadgeText:    { fontSize: 8, fontWeight: '800', color: C.green },
  announcementMsg:   { fontSize: 13, color: C.gray, lineHeight: 20, marginBottom: 6 },
  announcementFrom:  { fontSize: 10, color: '#555' },
  dismissBtn:        { padding: 4 },

  // Activity
  activityCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, padding: 12 },
  activityIcon:     { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  activityTopRow:   { flexDirection: 'row', gap: 6, marginBottom: 4 },
  activityTypeBadge:{ borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  activityTypeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  activityRoleBadge:{ backgroundColor: C.inputBg, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  activityRoleText: { fontSize: 8, color: C.gray, fontWeight: '700', textTransform: 'uppercase' },
  activityDesc:     { fontSize: 12, color: C.lightGray, lineHeight: 18 },
  activityMeta:     { flexDirection: 'row', gap: 8 },
  activityActor:    { fontSize: 9, color: C.gray, fontStyle: 'italic' },
  activityTime:     { fontSize: 9, color: C.gray },
  activityDelete:   { padding: 4 },

  // Modal
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard:         { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border },
  modalHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle:        { fontSize: 18, fontWeight: '900', color: C.white },
  modalSub:          { fontSize: 13, color: C.gray, marginBottom: 12 },
  audienceBadge:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.gold + '11', borderRadius: 10, borderWidth: 1, borderColor: C.gold + '33', padding: 12 },
  audienceBadgeText: { fontSize: 12, color: C.gold, fontWeight: '700' },
  formInput:         { backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.white, fontSize: 14 },
  postBtn:           { backgroundColor: C.gold, borderRadius: 14, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  postBtnText:       { color: '#000', fontSize: 15, fontWeight: '800' },
 
  coachBackBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#2A2A2A',
    justifyContent: 'center', alignItems: 'center',
  },});