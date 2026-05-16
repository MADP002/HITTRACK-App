import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
  Modal, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import {
  collection, getDocs, addDoc, deleteDoc, doc,
  serverTimestamp, getDoc, query, where, onSnapshot,
} from 'firebase/firestore';
import { isClassActive, endClass, autoEndPastClasses } from '../../lib/classLifecycle';
import { logActivity } from '../../lib/activityLog';

const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  blue: '#42a5f5', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842', red: '#E63946',
};
const LEVEL_COLORS = { Beginner:'#fb923c', Intermediate:'#F5C842', Advanced:'#4ade80' };
const LEVEL_ICONS  = { Beginner:'🥊', Intermediate:'⚡', Advanced:'🔥' };
const DAYS   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const TIMES  = ['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM'];
const LEVELS = ['Beginner','Intermediate','Advanced'];
const SPOTS  = ['6','8','10','12','15','20','25','30'];

export default function ClassesScreen() {
  const [classes,      setClasses]      = useState([]);
  const [bookings,     setBookings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [coachProfile, setCoachProfile] = useState({ name: 'Coach' });
  const [creating,     setCreating]     = useState(false);
  const [ending,       setEnding]       = useState(null);
  const [newClass, setNewClass] = useState({
    name: '', day: 'Monday', time: '6:00 AM', level: 'Beginner', spots: '12',
  });

  // Load coach profile
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(s => { if (s.exists()) setCoachProfile(s.data()); })
      .catch(console.error);
  }, []);

  // Load classes
  const loadClasses = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'classes'));
      const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClasses(all);
      autoEndPastClasses(all).catch(console.warn);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadClasses(); }, []);

  // Live bookings stream
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bookings'), snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, console.warn);
    return () => unsub();
  }, []);

  const activeClasses = classes.filter(isClassActive);

  const createClass = async () => {
    if (!newClass.name.trim()) { Alert.alert('Missing info', 'Please enter a class name.'); return; }
    setCreating(true);
    try {
      const me = auth.currentUser;
      const ref = await addDoc(collection(db, 'classes'), {
        ...newClass,
        spots:    parseInt(newClass.spots) || 12,
        enrolled: 0,
        coach:    coachProfile.name || 'Coach',
        createdAt: serverTimestamp(),
      });
      logActivity({
        type: 'class_created', actorId: me?.uid || '',
        actorName: coachProfile.name || 'Coach', actorRole: 'coach',
        payload: { classId: ref.id, className: newClass.name.trim(), classDay: newClass.day, classTime: newClass.time, level: newClass.level },
      });
      setNewClass({ name: '', day: 'Monday', time: '6:00 AM', level: 'Beginner', spots: '12' });
      setShowCreate(false);
      loadClasses();
    } catch (e) { Alert.alert('Error', 'Could not create class.'); console.error(e); }
    finally { setCreating(false); }
  };

  const handleEndClass = (cls) => {
    Alert.alert(
      '🏁 Mark as Done?',
      `End "${cls.name}"? All booked members will receive a thank-you notification.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Class', style: 'default',
          onPress: async () => {
            setEnding(cls.id);
            try {
              const result = await endClass(cls, { isAuto: false, actorName: coachProfile.name || 'Coach' });
              if (result.ended) {
                Alert.alert('Done!', `Class ended. ${result.notified} member${result.notified !== 1 ? 's' : ''} thanked.`);
                loadClasses();
              } else {
                Alert.alert('Already ended', 'This class was already marked as done.');
              }
            } catch (e) { Alert.alert('Error', 'Could not end class.'); console.error(e); }
            finally { setEnding(null); }
          },
        },
      ]
    );
  };

  const handleDeleteClass = (cls) => {
    Alert.alert(
      'Delete Class?',
      `Remove "${cls.name}"? Members will NOT be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const me = auth.currentUser;
              await deleteDoc(doc(db, 'classes', cls.id));
              logActivity({
                type: 'class_deleted', actorId: me?.uid || '',
                actorName: coachProfile.name || 'Coach', actorRole: 'coach',
                payload: { classId: cls.id, className: cls.name, classDay: cls.day, classTime: cls.time },
              });
              loadClasses();
            } catch (e) { Alert.alert('Error', 'Could not delete class.'); }
          },
        },
      ]
    );
  };

  // ── PICKER ROW ─────────────────────────────────────────────────────────────
  const PickerRow = ({ label, options, value, onSelect }) => (
    <View style={styles.pickerField}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.pickerOpt, value === opt && styles.pickerOptActive]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.pickerOptText, value === opt && styles.pickerOptTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
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
      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🥊 Create New Class</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={22} color={COLORS.gray} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              {/* Class name */}
              <View style={styles.pickerField}>
                <Text style={styles.pickerLabel}>Class Name *</Text>
                <TextInput
                  style={styles.nameInput}
                  value={newClass.name}
                  onChangeText={v => setNewClass(p => ({ ...p, name: v }))}
                  placeholder="e.g. Heavy Bag Basics"
                  placeholderTextColor={COLORS.gray}
                  autoCapitalize="words"
                />
              </View>

              <PickerRow label="Day"   options={DAYS}   value={newClass.day}   onSelect={v => setNewClass(p => ({ ...p, day: v }))} />
              <PickerRow label="Time"  options={TIMES}  value={newClass.time}  onSelect={v => setNewClass(p => ({ ...p, time: v }))} />
              <PickerRow label="Level" options={LEVELS} value={newClass.level} onSelect={v => setNewClass(p => ({ ...p, level: v }))} />
              <PickerRow label="Max Spots" options={SPOTS} value={newClass.spots} onSelect={v => setNewClass(p => ({ ...p, spots: v }))} />
            </ScrollView>

            <TouchableOpacity
              style={[styles.createBtn, creating && { opacity: 0.6 }]}
              onPress={createClass}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator size="small" color={COLORS.white} />
                : <Text style={styles.createBtnText}>✓ Create Class</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>📋 Classes</Text>
          <Text style={styles.headerSub}>{activeClasses.length} active class{activeClasses.length !== 1 ? 'es' : ''}</Text>
        </View>
        <TouchableOpacity style={styles.createFab} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={18} color={COLORS.white} />
          <Text style={styles.createFabText}>Create</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadClasses(); }} tintColor={COLORS.blue} />
        }
      >
        {activeClasses.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 56 }}>📋</Text>
            <Text style={styles.emptyTitle}>No Active Classes</Text>
            <Text style={styles.emptySub}>Create a class to fill the gym 🥊</Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.createBtnText}>+ Create Your First Class</Text>
            </TouchableOpacity>
          </View>
        ) : (
          activeClasses.map(cls => {
            const classBookings  = bookings.filter(b => b.classId === cls.id);
            const enrolledCount  = classBookings.length;
            const pct            = cls.spots > 0 ? Math.round((enrolledCount / cls.spots) * 100) : 0;
            const fillColor      = pct >= 90 ? COLORS.red : pct >= 60 ? COLORS.gold : COLORS.green;
            const lc             = LEVEL_COLORS[cls.level] || COLORS.gold;
            const li             = LEVEL_ICONS[cls.level]  || '🥊';
            const isEnding       = ending === cls.id;

            return (
              <View key={cls.id} style={[styles.classCard, { borderColor: lc + '33' }]}>
                <View style={[styles.classAccent, { backgroundColor: lc }]} />

                {/* Top row */}
                <View style={styles.classTop}>
                  {/* Day badge */}
                  <View style={[styles.dayBadge, { backgroundColor: lc, shadowColor: lc }]}>
                    <Text style={styles.dayBadgeDay}>{(cls.day || '').slice(0, 3).toUpperCase()}</Text>
                    <Text style={styles.dayBadgeTime}>{cls.time}</Text>
                  </View>

                  {/* Info */}
                  <View style={styles.classInfo}>
                    <Text style={styles.className}>{cls.name}</Text>
                    <View style={styles.classTags}>
                      <View style={[styles.chip, { backgroundColor: lc + '22', borderColor: lc + '44' }]}>
                        <Text style={[styles.chipText, { color: lc }]}>{li} {cls.level}</Text>
                      </View>
                      {cls.coach && (
                        <View style={[styles.chip, { backgroundColor: COLORS.inputBg, borderColor: COLORS.border }]}>
                          <Text style={[styles.chipText, { color: COLORS.gray }]}>👨‍🏫 {cls.coach}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Action buttons */}
                  <View style={styles.classActions}>
                    <TouchableOpacity
                      style={styles.doneBtn}
                      onPress={() => handleEndClass(cls)}
                      disabled={isEnding}
                    >
                      {isEnding
                        ? <ActivityIndicator size="small" color={COLORS.green} />
                        : <Text style={styles.doneBtnText}>🏁 Done</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteClass(cls)}>
                      <Ionicons name="trash-outline" size={16} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Enrollment bar */}
                <View style={styles.enrollSection}>
                  <View style={styles.enrollHeader}>
                    <Text style={styles.enrollLabel}>Enrollment</Text>
                    <View style={styles.enrollCount}>
                      <Text style={[styles.enrollNum, { color: fillColor }]}>{enrolledCount}</Text>
                      <Text style={styles.enrollTotal}>/ {cls.spots}</Text>
                      <View style={[styles.pctBadge, { backgroundColor: fillColor + '22' }]}>
                        <Text style={[styles.pctText, { color: fillColor }]}>{pct}%</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.enrollBarBg}>
                    <View style={[styles.enrollBarFill, { width: `${pct}%`, backgroundColor: fillColor }]} />
                  </View>
                  {pct >= 90 && (
                    <Text style={[styles.almostFull, { color: COLORS.red }]}>🔥 Almost Full!</Text>
                  )}
                </View>

                {/* Booked members */}
                {classBookings.length > 0 && (
                  <View style={styles.bookedSection}>
                    <Text style={styles.bookedTitle}>👥 Booked ({classBookings.length})</Text>
                    <View style={styles.bookedPills}>
                      {classBookings.slice(0, 6).map(b => (
                        <View key={b.id} style={styles.bookedPill}>
                          <Text style={styles.bookedPillText}>{b.userName || 'Member'}</Text>
                        </View>
                      ))}
                      {classBookings.length > 6 && (
                        <View style={[styles.bookedPill, { backgroundColor: COLORS.inputBg }]}>
                          <Text style={styles.bookedPillText}>+{classBookings.length - 6} more</Text>
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
  createFab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.red, borderRadius: 50,
    paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: COLORS.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  createFabText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 14, paddingTop: 14 },

  emptyBox:   { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  emptySub:   { fontSize: 13, color: COLORS.gray },

  // Class card
  classCard: {
    backgroundColor: COLORS.card, borderRadius: 20,
    borderWidth: 1, overflow: 'hidden',
  },
  classAccent: { height: 4 },
  classTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  dayBadge: {
    width: 64, height: 64, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  dayBadgeDay:  { fontSize: 15, fontWeight: '900', color: '#000', letterSpacing: 1 },
  dayBadgeTime: { fontSize: 8,  fontWeight: '800', color: '#000', opacity: 0.7 },
  classInfo:    { flex: 1 },
  className:    { fontSize: 16, fontWeight: '900', color: COLORS.white, marginBottom: 6 },
  classTags:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 50, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 9, fontWeight: '700' },
  classActions: { gap: 6 },
  doneBtn: {
    backgroundColor: COLORS.green + '18', borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.green + '44',
    paddingHorizontal: 10, paddingVertical: 6, minWidth: 70, alignItems: 'center',
  },
  doneBtnText: { fontSize: 11, fontWeight: '800', color: COLORS.green },
  deleteBtn: {
    backgroundColor: COLORS.red + '18', borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.red + '33',
    padding: 8, alignItems: 'center',
  },

  // Enrollment
  enrollSection: { paddingHorizontal: 14, paddingBottom: 14 },
  enrollHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  enrollLabel:   { fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  enrollCount:   { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  enrollNum:     { fontSize: 20, fontWeight: '900' },
  enrollTotal:   { fontSize: 12, color: COLORS.gray },
  pctBadge:      { borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2 },
  pctText:       { fontSize: 10, fontWeight: '700' },
  enrollBarBg:   { height: 8, backgroundColor: COLORS.border, borderRadius: 50, overflow: 'hidden' },
  enrollBarFill: { height: '100%', borderRadius: 50 },
  almostFull:    { fontSize: 11, fontWeight: '700', marginTop: 6 },

  // Booked
  bookedSection: {
    paddingHorizontal: 14, paddingBottom: 14,
    borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12,
  },
  bookedTitle: { fontSize: 10, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  bookedPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bookedPill: {
    backgroundColor: COLORS.blue + '18', borderRadius: 50,
    borderWidth: 1, borderColor: COLORS.blue + '33',
    paddingHorizontal: 10, paddingVertical: 3,
  },
  bookedPillText: { fontSize: 10, color: COLORS.blue, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, borderWidth: 1, borderColor: COLORS.border, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle:  { fontSize: 18, fontWeight: '900', color: COLORS.white },

  // Picker
  pickerField: { marginBottom: 18 },
  pickerLabel: { fontSize: 11, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  pickerOpt: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 50, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
  },
  pickerOptActive: { backgroundColor: COLORS.red + '22', borderColor: COLORS.red + '66' },
  pickerOptText:       { fontSize: 12, fontWeight: '700', color: COLORS.gray },
  pickerOptTextActive: { color: COLORS.red },

  nameInput: {
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 48, color: COLORS.white, fontSize: 15,
  },

  createBtn: {
    backgroundColor: COLORS.red, borderRadius: 14, height: 52,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
    shadowColor: COLORS.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  createBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
});