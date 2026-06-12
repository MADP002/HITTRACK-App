import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet,  ActivityIndicator, Alert,
  Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import {
  collection, getDocs, addDoc, deleteDoc, doc,
  serverTimestamp, getDoc, onSnapshot,
} from 'firebase/firestore';
import { isClassActive, autoEndPastClasses } from '../../lib/classLifecycle';
import { logActivity } from '../../lib/activityLog';

const C = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  green: '#4ade80', gold: '#F5C842', blue: '#42a5f5',
  purple: '#c084fc', inputBg: '#1E1E1E', lightGray: '#CCCCCC',
};
const LEVEL_COLORS = { Beginner: '#fb923c', Intermediate: '#F5C842', Advanced: '#4ade80' };
const LEVEL_ICONS  = { Beginner: '🥊', Intermediate: '⚡', Advanced: '🔥' };
const DAYS   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const TIMES  = ['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM'];
const LEVELS = ['Beginner','Intermediate','Advanced'];
const SPOTS  = ['6','8','10','12','15','20','25','30'];

export default function AdminClassesScreen() {
  const [classes,      setClasses]      = useState([]);
  const [bookings,     setBookings]     = useState([]);
  const [coaches,      setCoaches]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [adminProfile, setAdminProfile] = useState({ name: 'Admin' });
  const [newClass, setNewClass] = useState({
    name: '', day: 'Monday', time: '6:00 AM', level: 'Beginner', spots: '12', coach: '',
  });

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(s => { if (s.exists()) setAdminProfile(s.data()); })
      .catch(console.error);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [clsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'users')),
      ]);
      const all = clsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClasses(all);
      autoEndPastClasses(all).catch(console.warn);
      const coachs = usersSnap.docs
        .filter(d => d.data().role === 'coach')
        .map(d => ({ uid: d.id, name: d.data().name || 'Coach' }));
      setCoaches(coachs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  // Live bookings
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bookings'), snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, console.warn);
    return () => unsub();
  }, []);

  const createClass = async () => {
    if (!newClass.name.trim()) { Alert.alert('Missing info', 'Please enter a class name.'); return; }
    setCreating(true);
    try {
      const me        = auth.currentUser;
      const coachName = newClass.coach || coaches[0]?.name || adminProfile.name || 'Admin';
      const ref = await addDoc(collection(db, 'classes'), {
        name:      newClass.name.trim(),
        day:       newClass.day,
        time:      newClass.time,
        level:     newClass.level,
        spots:     parseInt(newClass.spots) || 12,
        enrolled:  0,
        coach:     coachName,
        createdAt: serverTimestamp(),
      });
      logActivity({
        type: 'class_created', actorId: me?.uid || '',
        actorName: adminProfile.name || 'Admin', actorRole: 'admin',
        payload: { classId: ref.id, className: newClass.name.trim(), classDay: newClass.day, classTime: newClass.time, level: newClass.level, coach: coachName },
      });
      setNewClass({ name: '', day: 'Monday', time: '6:00 AM', level: 'Beginner', spots: '12', coach: '' });
      setShowCreate(false);
      loadData();
    } catch (e) { Alert.alert('Error', 'Could not create class.'); console.error(e); }
    finally { setCreating(false); }
  };

  const deleteClass = (cls) => {
    Alert.alert('Delete Class?', `Remove "${cls.name}"? Members will NOT be notified.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const me = auth.currentUser;
            await deleteDoc(doc(db, 'classes', cls.id));
            logActivity({
              type: 'class_deleted', actorId: me?.uid || '',
              actorName: adminProfile.name || 'Admin', actorRole: 'admin',
              payload: { classId: cls.id, className: cls.name, classDay: cls.day, classTime: cls.time },
            });
            loadData();
          } catch (e) { Alert.alert('Error', 'Could not delete class.'); }
        },
      },
    ]);
  };

  const PickerRow = ({ label, options, value, onSelect }) => (
    <View style={s.pickerField}>
      <Text style={s.pickerLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[s.pickerOpt, value === opt && s.pickerOptActive]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[s.pickerOptText, value === opt && s.pickerOptTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const activeClasses = classes.filter(isClassActive);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>🥊 Create New Class</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={22} color={C.gray} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              <View style={s.pickerField}>
                <Text style={s.pickerLabel}>Class Name *</Text>
                <TextInput
                  style={s.nameInput}
                  value={newClass.name}
                  onChangeText={v => setNewClass(p => ({ ...p, name: v }))}
                  placeholder="e.g. Heavy Bag Basics"
                  placeholderTextColor={C.gray}
                  autoCapitalize="words"
                />
              </View>
              <PickerRow label="Day"   options={DAYS}   value={newClass.day}   onSelect={v => setNewClass(p => ({ ...p, day: v }))} />
              <PickerRow label="Time"  options={TIMES}  value={newClass.time}  onSelect={v => setNewClass(p => ({ ...p, time: v }))} />
              <PickerRow label="Level" options={LEVELS} value={newClass.level} onSelect={v => setNewClass(p => ({ ...p, level: v }))} />
              <PickerRow label="Max Spots" options={SPOTS} value={newClass.spots} onSelect={v => setNewClass(p => ({ ...p, spots: v }))} />

              {/* Coach assignment */}
              {coaches.length > 0 && (
                <View style={s.pickerField}>
                  <Text style={s.pickerLabel}>Assign Coach</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {coaches.map(c => (
                      <TouchableOpacity
                        key={c.uid}
                        style={[s.pickerOpt, newClass.coach === c.name && s.pickerOptActive]}
                        onPress={() => setNewClass(p => ({ ...p, coach: c.name }))}
                      >
                        <Text style={[s.pickerOptText, newClass.coach === c.name && s.pickerOptTextActive]}>
                          🥊 {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[s.createBtn, creating && { opacity: 0.6 }]}
              onPress={createClass}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator size="small" color={C.white} />
                : <Text style={s.createBtnText}>✓ Create Class</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>📋 Classes</Text>
          <Text style={s.headerSub}>{activeClasses.length} active · {bookings.length} total bookings</Text>
        </View>
        <TouchableOpacity style={s.createFab} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={18} color={C.white} />
          <Text style={s.createFabText}>Create</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.red} />}
      >
        {activeClasses.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 56 }}>📋</Text>
            <Text style={s.emptyTitle}>No Active Classes</Text>
            <Text style={s.emptySub}>Create a class to fill the gym</Text>
            <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
              <Text style={s.createBtnText}>+ Create First Class</Text>
            </TouchableOpacity>
          </View>
        ) : (
          activeClasses.map(cls => {
            const classBookings = bookings.filter(b => b.classId === cls.id);
            const enrolled      = classBookings.length;
            const pct           = cls.spots > 0 ? Math.round((enrolled / cls.spots) * 100) : 0;
            const fillColor     = pct >= 90 ? C.red : pct >= 60 ? C.gold : C.green;
            const lc            = LEVEL_COLORS[cls.level] || C.gold;
            const li            = LEVEL_ICONS[cls.level]  || '🥊';
            const dayShort      = (cls.day || '').slice(0, 3).toUpperCase();
            return (
              <View key={cls.id} style={[s.classCard, { borderColor: lc + '33' }]}>
                <View style={[s.classAccent, { backgroundColor: lc }]} />
                <View style={s.classTop}>
                  <View style={[s.dayBadge, { backgroundColor: lc }]}>
                    <Text style={s.dayBadgeDay}>{dayShort}</Text>
                    <Text style={s.dayBadgeTime}>{cls.time}</Text>
                  </View>
                  <View style={s.classInfo}>
                    <Text style={s.className}>{cls.name}</Text>
                    <View style={s.classTags}>
                      <View style={[s.chip, { backgroundColor: lc + '22', borderColor: lc + '44' }]}>
                        <Text style={[s.chipText, { color: lc }]}>{li} {cls.level}</Text>
                      </View>
                      {cls.coach && (
                        <View style={[s.chip, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                          <Text style={[s.chipText, { color: C.gray }]}>👨‍🏫 {cls.coach}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => deleteClass(cls)}>
                    <Ionicons name="trash-outline" size={16} color={C.red} />
                  </TouchableOpacity>
                </View>

                {/* Enrollment bar */}
                <View style={s.enrollSection}>
                  <View style={s.enrollHeader}>
                    <Text style={s.enrollLabel}>Bookings</Text>
                    <View style={s.enrollRight}>
                      <Text style={[s.enrollNum, { color: fillColor }]}>{enrolled}</Text>
                      <Text style={s.enrollTotal}>/ {cls.spots}</Text>
                      <View style={[s.pctBadge, { backgroundColor: fillColor + '22' }]}>
                        <Text style={[s.pctText, { color: fillColor }]}>{pct}%</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.enrollBarBg}>
                    <View style={[s.enrollBarFill, { width: `${pct}%`, backgroundColor: fillColor }]} />
                  </View>
                  {pct >= 90 && <Text style={{ fontSize: 11, color: C.red, fontWeight: '700', marginTop: 4 }}>🔥 Almost Full!</Text>}
                </View>

                {/* Booked members */}
                {classBookings.length > 0 && (
                  <View style={s.bookedSection}>
                    <Text style={s.bookedTitle}>👥 Booked ({classBookings.length})</Text>
                    <View style={s.bookedPills}>
                      {classBookings.slice(0, 5).map(b => (
                        <View key={b.id} style={s.bookedPill}>
                          <Text style={s.bookedPillText}>{b.userName || 'Member'}</Text>
                        </View>
                      ))}
                      {classBookings.length > 5 && (
                        <View style={[s.bookedPill, { backgroundColor: C.inputBg }]}>
                          <Text style={s.bookedPillText}>+{classBookings.length - 5} more</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.white },
  headerSub:   { fontSize: 12, color: C.gray, marginTop: 2 },
  createFab: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.red, borderRadius: 50, paddingHorizontal: 16, paddingVertical: 10 },
  createFabText: { color: C.white, fontSize: 13, fontWeight: '800' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 14, paddingTop: 14 },
  emptyBox: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: C.white },
  emptySub:   { fontSize: 13, color: C.gray },
  classCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  classAccent: { height: 4 },
  classTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  dayBadge: { width: 60, height: 60, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  dayBadgeDay:  { fontSize: 15, fontWeight: '900', color: '#000' },
  dayBadgeTime: { fontSize: 8,  fontWeight: '800', color: '#000', opacity: 0.7 },
  classInfo: { flex: 1 },
  className: { fontSize: 16, fontWeight: '900', color: C.white, marginBottom: 6 },
  classTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 50, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 9, fontWeight: '700' },
  deleteBtn: { backgroundColor: C.red + '18', borderRadius: 10, borderWidth: 1, borderColor: C.red + '33', padding: 8 },
  enrollSection: { paddingHorizontal: 14, paddingBottom: 14 },
  enrollHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  enrollLabel:   { fontSize: 9, color: C.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  enrollRight:   { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  enrollNum:     { fontSize: 20, fontWeight: '900' },
  enrollTotal:   { fontSize: 12, color: C.gray },
  pctBadge:      { borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  pctText:       { fontSize: 10, fontWeight: '700' },
  enrollBarBg:   { height: 8, backgroundColor: C.border, borderRadius: 50, overflow: 'hidden' },
  enrollBarFill: { height: '100%', borderRadius: 50 },
  bookedSection: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  bookedTitle:   { fontSize: 10, color: C.gray, fontWeight: '700', marginBottom: 8 },
  bookedPills:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bookedPill:    { backgroundColor: C.blue + '18', borderRadius: 50, borderWidth: 1, borderColor: C.blue + '33', paddingHorizontal: 10, paddingVertical: 3 },
  bookedPillText:{ fontSize: 10, color: C.blue, fontWeight: '600' },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard:     { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle:    { fontSize: 18, fontWeight: '900', color: C.white },
  pickerField:   { marginBottom: 18 },
  pickerLabel:   { fontSize: 11, color: C.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  pickerOpt:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50, borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg },
  pickerOptActive:   { backgroundColor: C.red + '22', borderColor: C.red + '66' },
  pickerOptText:     { fontSize: 12, fontWeight: '700', color: C.gray },
  pickerOptTextActive:{ color: C.red },
  nameInput: { backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 48, color: C.white, fontSize: 15 },
  createBtn: { backgroundColor: C.red, borderRadius: 14, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  createBtnText: { color: C.white, fontSize: 15, fontWeight: '800' },
});