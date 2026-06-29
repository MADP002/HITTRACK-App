import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet,  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import {
  collection, onSnapshot, addDoc, deleteDoc, updateDoc,
  doc, getDoc, serverTimestamp, setDoc, writeBatch, getDocs,
} from 'firebase/firestore';
import { ACTIVITY_TYPES } from '../../lib/activityLog';

import { C } from '../../lib/theme';

const SYSTEM_EVENT_TYPES = [
  'booking_created','booking_cancelled','class_created','class_deleted',
  'class_ended','class_thanks','level_change','member_signup',
  'member_deactivated','member_reactivated','member_deleted',
];

function formatRelTime(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminNotificationsScreen() {
  const [subTab,       setSubTab]       = useState('announcements');
  const [allNotifs,    setAllNotifs]    = useState([]);
  const [activity,     setActivity]     = useState([]);
  const [adminProfile, setAdminProfile] = useState({ name: 'Admin' });
  const [showPost,     setShowPost]     = useState(false);
  const [editingId,    setEditingId]    = useState(null);
  const [form,         setForm]         = useState({ title: '', message: '', audience: 'all' });
  const [posting,      setPosting]      = useState(false);
  const [clearingActivity, setClearingActivity] = useState(false);
 
  // Load admin profile
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(s => { if (s.exists()) setAdminProfile(s.data()); })
      .catch(console.error);
  }, []);
 
  // Live notifications
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'notifications'), snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAllNotifs(all);
    }, console.error);
    return () => unsub();
  }, []);
 
  // Live activity
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'activity'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setActivity(items);
    }, console.error);
    return () => unsub();
  }, []);

  const realAnnouncements = allNotifs.filter(n => !n.type || !SYSTEM_EVENT_TYPES.includes(n.type));
 
  const openEdit = (n) => {
    setEditingId(n.id);
    setForm({ title: n.title || '', message: n.message || '', audience: n.audience || 'all' });
    setShowPost(true);
  };
 
  const closePost = () => {
    setShowPost(false);
    setEditingId(null);
    setForm({ title: '', message: '', audience: 'all' });
  };
 
  const postAnnouncement = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      Alert.alert('Missing info', 'Please fill in both title and message.');
      return;
    }
    setPosting(true);
    try {
      const me = auth.currentUser;
      if (editingId) {
        await updateDoc(doc(db, 'notifications', editingId), {
          title:    form.title.trim(),
          message:  form.message.trim(),
          audience: form.audience,
          editedAt: serverTimestamp(),
          editedBy: adminProfile.name || 'Admin',
        });
      } else {
        const ref = doc(collection(db, 'notifications'));
        await setDoc(ref, {
          id:        ref.id,
          title:     form.title.trim(),
          message:   form.message.trim(),
          audience:  form.audience,
          from:      adminProfile.name || 'Admin',
          fromUid:   me?.uid || '',
          createdAt: serverTimestamp(),
        });
      }
      closePost();
    } catch (e) {
      Alert.alert('Error', 'Could not post announcement. Check Firestore rules.');
      console.error(e);
    } finally { setPosting(false); }
  };
 
  const deleteAnnouncement = (id) => {
    Alert.alert('Delete Announcement?', 'This removes it for everyone permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteDoc(doc(db, 'notifications', id)); }
          catch (e) { Alert.alert('Error', 'Could not delete.'); }
        },
      },
    ]);
  };

  const deleteActivityEvent = async (id) => {
    try { await deleteDoc(doc(db, 'activity', id)); }
    catch (e) { Alert.alert('Error', 'Could not delete.'); }
  };
 
  const clearAllActivity = () => {
    Alert.alert('Clear All Activity?', `This permanently deletes all ${activity.length} events.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive',
        onPress: async () => {
          setClearingActivity(true);
          try {
            const chunks = [];
            for (let i = 0; i < activity.length; i += 500) chunks.push(activity.slice(i, i + 500));
            for (const chunk of chunks) {
              const batch = writeBatch(db);
              chunk.forEach(ev => batch.delete(doc(db, 'activity', ev.id)));
              await batch.commit();
            }
          } catch (e) { Alert.alert('Error', e.message); }
          finally { setClearingActivity(false); }
        },
      },
    ]);
  };
 
  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* Post/Edit modal */}
      <Modal visible={showPost} transparent animationType="slide" onRequestClose={closePost}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingId ? '✏️ Edit Announcement' : '📢 Post Announcement'}</Text>
              <TouchableOpacity onPress={closePost}>
                <Ionicons name="close" size={22} color={C.gray} />
              </TouchableOpacity>
            </View>
      
            {/* Audience picker — admin has full control */}
            <Text style={s.fieldLabel}>Audience</Text>
            <View style={s.audienceRow}>
              {[
                { id: 'all',     label: '📢 All Members'  },
                { id: 'coaches', label: '🥊 Coaches Only' },
              ].map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={[s.audienceBtn, form.audience === a.id && s.audienceBtnActive]}
                  onPress={() => setForm(p => ({ ...p, audience: a.id }))}
                >
                  <Text style={[s.audienceBtnText, form.audience === a.id && s.audienceBtnTextActive]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
     
            <Text style={s.fieldLabel}>Title</Text>
            <TextInput
              style={s.formInput}
              value={form.title}
              onChangeText={v => setForm(p => ({ ...p, title: v }))}
              placeholder="Announcement title..."
              placeholderTextColor={C.gray}
              autoCapitalize="sentences"
            />
    
            <Text style={[s.fieldLabel, { marginTop: 12 }]}>Message</Text>
            <TextInput
              style={[s.formInput, { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }]}
              value={form.message}
              onChangeText={v => setForm(p => ({ ...p, message: v }))}
              placeholder="Write your message..."
              placeholderTextColor={C.gray}
              multiline
              numberOfLines={4}
              autoCapitalize="sentences"
            />
     
            <TouchableOpacity
              style={[s.postBtn, { backgroundColor: editingId ? C.blue : C.gold }, posting && { opacity: 0.6 }]}
              onPress={postAnnouncement}
              disabled={posting}
            >
              {posting
                ? <ActivityIndicator size="small" color={editingId ? C.white : '#000'} />
                : <Text style={[s.postBtnText, { color: editingId ? C.white : '#000' }]}>
                    {editingId ? 'Save Changes ✏️' : 'Send Announcement 📢'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
 
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>📢 Notifications</Text>
        <TouchableOpacity style={s.postFab} onPress={() => setShowPost(true)}>
          <Ionicons name="add" size={18} color="#000" />
          <Text style={s.postFabText}>Post</Text>
        </TouchableOpacity>
      </View>
    
      {/* Sub-tab toggle */}
      <View style={s.subTabRow}>
        {[
          { id: 'announcements', icon: 'megaphone-outline', label: 'Announcements', count: realAnnouncements.length, color: C.gold },
          { id: 'activity',      icon: 'flash-outline',     label: 'Activity Feed',  count: activity.length,            color: C.blue },
        ].map(t => {
          const active = subTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[s.subTab, active && { backgroundColor: t.color + '18', borderColor: t.color + '44' }]}
              onPress={() => setSubTab(t.id)}
              activeOpacity={0.8}
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
     
      {/* ── ANNOUNCEMENTS ── */}
      {subTab === 'announcements' && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {realAnnouncements.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={{ fontSize: 48 }}>📭</Text>
              <Text style={s.emptyTitle}>No Announcements Yet</Text>
              <Text style={s.emptySub}>Post your first announcement to the gym</Text>
              <TouchableOpacity style={s.postBtn} onPress={() => setShowPost(true)}>
                <Text style={s.postBtnText}>📢 Post Announcement</Text>
              </TouchableOpacity>
            </View>
          ) : (
            realAnnouncements.map(n => {
              const isAll = n.audience === 'all';
              const ac    = isAll ? C.gold : C.blue;
              return (
                <View key={n.id} style={[s.announcementCard, { borderColor: ac + '33' }]}>
                  <View style={[s.announcementAccent, { backgroundColor: ac }]} />
                  <View style={[s.announcementIcon, { backgroundColor: ac + '22' }]}>
                    <Text style={{ fontSize: 18 }}>{isAll ? '📢' : '🥊'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.announcementTitleRow}>
                      <Text style={s.announcementTitle} numberOfLines={2}>{n.title}</Text>
                      <View style={[s.audiencePill, { backgroundColor: ac + '22', borderColor: ac + '44' }]}>
                        <Text style={[s.audiencePillText, { color: ac }]}>{isAll ? 'All' : 'Coaches'}</Text>
                      </View>
                      {n.editedAt && <Text style={s.editedTag}>edited</Text>}
                    </View>
                    <Text style={s.announcementMsg} numberOfLines={3}>{n.message}</Text>
                    <Text style={s.announcementFrom}>By {n.from || 'Admin'}</Text>
                  </View>
                  <View style={s.announcementActions}>
                    <TouchableOpacity style={s.editBtn} onPress={() => openEdit(n)}>
                      <Ionicons name="create-outline" size={16} color={C.gold} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.deleteAnnouncementBtn} onPress={() => deleteAnnouncement(n.id)}>
                      <Ionicons name="trash-outline" size={16} color={C.red} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── ACTIVITY FEED ── */}
      {subTab === 'activity' && (
        <>
          <View style={s.activityHeader}>
            <View style={s.liveIndicator}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>Live</Text>
            </View>
            {activity.length > 0 && (
              <TouchableOpacity
                style={s.clearAllBtn}
                onPress={clearAllActivity}
                disabled={clearingActivity}
              >
                {clearingActivity
                  ? <ActivityIndicator size="small" color={C.red} />
                  : <Text style={s.clearAllBtnText}>🧹 Clear All</Text>
                }
              </TouchableOpacity>
            )}
          </View>
       
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            {activity.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={{ fontSize: 48 }}>⚡</Text>
                <Text style={s.emptyTitle}>No Activity Yet</Text>
                <Text style={s.emptySub}>System events appear here in real time</Text>
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
                    <View style={{ flex: 1, gap: 4 }}>
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
                        {ts && <Text style={s.activityTime}>{formatRelTime(ts)}</Text>}
                      </View>
                    </View>
                    <TouchableOpacity style={s.actDeleteBtn} onPress={() => deleteActivityEvent(ev.id)}>
                      <Ionicons name="trash-outline" size={14} color={C.gray} />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.white },
  postFab: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.gold, borderRadius: 50, paddingHorizontal: 16, paddingVertical: 10 },
  postFabText: { color: '#000', fontSize: 13, fontWeight: '800' },
  subTabRow: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  subTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  subTabText:      { fontSize: 12, fontWeight: '700', color: C.gray },
  subTabCount:     { backgroundColor: C.border, borderRadius: 50, paddingHorizontal: 7, paddingVertical: 1 },
  subTabCountText: { fontSize: 10, fontWeight: '700', color: C.gray },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 12, paddingTop: 12 },
  emptyBox:   { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  emptySub:   { fontSize: 13, color: C.gray, textAlign: 'center', paddingHorizontal: 20 },
 
  // Announcement card
  announcementCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, padding: 14, overflow: 'hidden' },
  announcementAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  announcementIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  announcementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  announcementTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: C.white },
  audiencePill: { borderRadius: 50, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  audiencePillText: { fontSize: 8, fontWeight: '800' },
  editedTag: { fontSize: 8, color: C.gray, fontStyle: 'italic' },
  announcementMsg:  { fontSize: 13, color: C.gray, lineHeight: 20, marginBottom: 6 },
  announcementFrom: { fontSize: 10, color: '#555' },
  announcementActions: { gap: 6 },
  editBtn: { backgroundColor: C.gold + '18', borderRadius: 8, borderWidth: 1, borderColor: C.gold + '33', padding: 8 },
  deleteAnnouncementBtn: { backgroundColor: C.red + '18', borderRadius: 8, borderWidth: 1, borderColor: C.red + '33', padding: 8 },
 
  // Activity
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  liveIndicator:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  liveText:       { fontSize: 12, color: C.green, fontWeight: '700' },
  clearAllBtn:    { backgroundColor: C.red + '18', borderRadius: 50, borderWidth: 1, borderColor: C.red + '33', paddingHorizontal: 14, paddingVertical: 7 },
  clearAllBtnText:{ fontSize: 11, fontWeight: '800', color: C.red },
  activityCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, padding: 12 },
  activityIcon:   { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  activityTopRow: { flexDirection: 'row', gap: 6 },
  activityTypeBadge: { borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  activityTypeText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  activityRoleBadge: { backgroundColor: C.inputBg, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  activityRoleText:  { fontSize: 8, color: C.gray, fontWeight: '700', textTransform: 'uppercase' },
  activityDesc:  { fontSize: 12, color: C.lightGray, lineHeight: 18 },
  activityMeta:  { flexDirection: 'row', gap: 8 },
  activityActor: { fontSize: 9, color: C.gray, fontStyle: 'italic' },
  activityTime:  { fontSize: 9, color: C.gray },
  actDeleteBtn:  { padding: 4 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: C.white },
  fieldLabel: { fontSize: 11, color: C.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  audienceRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  audienceBtn: { flex: 1, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: 'center' },
  audienceBtnActive: { backgroundColor: C.red + '22', borderColor: C.red + '55' },
  audienceBtnText: { fontSize: 12, fontWeight: '700', color: C.gray },
  audienceBtnTextActive: { color: C.red },
  formInput: { backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.white, fontSize: 14, marginBottom: 4 },
  postBtn: { backgroundColor: C.gold, borderRadius: 14, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  postBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
});