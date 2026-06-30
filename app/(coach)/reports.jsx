import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { C } from '../../lib/theme';

// Centralized Training-Lab reports for a coach — every trainingRecordings doc
// where coachUid == me (mirrors the web CoachDashboard "Reports" tab). Per-member
// reports also live inside member-detail; this is the cross-member firehose.
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');

export default function CoachReportsScreen() {
  const router = useRouter();
  const [reports, setReports]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all'); // 'all' | 'unviewed'
  const [selected, setSelected]     = useState(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const coachUid = auth.currentUser?.uid;
    if (!coachUid) { setLoading(false); return; }
    // where-only query, sorted client-side (no composite index needed).
    const q = query(collection(db, 'trainingRecordings'), where('coachUid', '==', coachUid));
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      setReports(rows);
      setLoading(false);
    }, e => { console.error(e); setLoading(false); });
    return () => unsub();
  }, []);

  const openReport = async (rec) => {
    setSelected(rec);
    setShowReport(true);
    if (!rec.viewed) {
      try { await updateDoc(doc(db, 'trainingRecordings', rec.id), { viewed: true }); }
      catch (e) { console.warn('mark viewed (non-fatal):', e.message); }
    }
  };

  const unviewed = reports.filter(r => !r.viewed).length;
  const shown = filter === 'unviewed' ? reports.filter(r => !r.viewed) : reports;

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.blue} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>📋 Training Reports</Text>
          <Text style={s.headerSub}>{reports.length} total · {unviewed} new</Text>
        </View>
        {unviewed > 0 && <View style={s.newBadge}><Text style={s.newBadgeText}>{unviewed} NEW</Text></View>}
      </View>

      {/* Filter */}
      <View style={s.filterRow}>
        {[{ id: 'all', label: `All (${reports.length})` }, { id: 'unviewed', label: `Unviewed (${unviewed})` }].map(f => {
          const active = filter === f.id;
          return (
            <TouchableOpacity key={f.id} style={[s.filterChip, active && s.filterChipActive]} onPress={() => setFilter(f.id)}>
              <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {shown.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 44 }}>📋</Text>
            <Text style={s.emptyTitle}>{filter === 'unviewed' ? 'No unviewed reports' : 'No reports yet'}</Text>
            <Text style={s.emptySub}>Training-lab reports your members submit to you will appear here.</Text>
          </View>
        ) : shown.map(rec => {
          const ts = rec.submittedAt?.seconds ? new Date(rec.submittedAt.seconds * 1000) : null;
          return (
            <TouchableOpacity key={rec.id} style={[s.row, !rec.viewed && { borderColor: C.blue + '55' }]} onPress={() => openReport(rec)} activeOpacity={0.85}>
              <View style={s.rowIcon}><Ionicons name="document-text" size={26} color={C.blue} /></View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.rowMember} numberOfLines={1}>{rec.memberName || 'Member'}</Text>
                <Text style={s.rowTraining} numberOfLines={1}>{rec.trainingName || rec.trainingId}</Text>
                <View style={s.rowMeta}>
                  <Text style={s.rowLevel}>{rec.level || 'Beginner'}</Text>
                  <Text style={s.rowDot}>·</Text>
                  <Text style={s.rowReps}>{rec.properReps || 0} proper reps</Text>
                  {ts && <><Text style={s.rowDot}>·</Text><Text style={s.rowDate}>{ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></>}
                </View>
              </View>
              {!rec.viewed && <View style={s.unviewedDot} />}
              <Ionicons name="chevron-forward" size={16} color={C.gray} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Report viewer */}
      <Modal visible={showReport} transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>📋 Training Report</Text>
              <TouchableOpacity onPress={() => setShowReport(false)}><Ionicons name="close" size={22} color={C.gray} /></TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '85%' }}>
                <Text style={s.reportMember}>{selected.memberName || 'Member'}</Text>
                <Text style={s.reportSub}>
                  {selected.trainingName || selected.trainingId} · <Text style={{ color: C.blue }}>{selected.level || 'Beginner'}</Text>
                  {selected.submittedAt?.seconds && <Text style={{ color: C.gray }}>{'  ·  '}{new Date(selected.submittedAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
                </Text>

                <View style={s.statsGrid}>
                  <View style={s.statBox}><Text style={s.statBoxVal}>{selected.properReps || 0}</Text><Text style={s.statBoxLabel}>Proper Reps</Text></View>
                  <View style={s.statBox}><Text style={s.statBoxVal}>{fmtDur(selected.duration)}</Text><Text style={s.statBoxLabel}>Duration</Text></View>
                </View>

                {(selected.avgQualityPct != null || selected.paceRepsPerMin != null || selected.consistencyPct != null || selected.bestStreak != null) && (
                  <>
                    <Text style={s.breakdownTitle}>Performance Breakdown</Text>
                    <View style={s.statsGrid}>
                      {selected.avgQualityPct  != null && <View style={[s.statBox, { borderColor: C.gold + '44' }]}><Text style={[s.statBoxVal, { color: C.gold }]}>{selected.avgQualityPct}%</Text><Text style={s.statBoxLabel}>✨ Form Quality</Text></View>}
                      {selected.paceRepsPerMin != null && <View style={[s.statBox, { borderColor: C.blue + '44' }]}><Text style={[s.statBoxVal, { color: C.blue }]}>{selected.paceRepsPerMin}</Text><Text style={s.statBoxLabel}>⚡ Reps / Min</Text></View>}
                      {selected.consistencyPct != null && <View style={[s.statBox, { borderColor: C.green + '44' }]}><Text style={[s.statBoxVal, { color: C.green }]}>{selected.consistencyPct}%</Text><Text style={s.statBoxLabel}>📊 Consistency</Text></View>}
                      {selected.bestStreak     != null && <View style={[s.statBox, { borderColor: C.red + '44' }]}><Text style={[s.statBoxVal, { color: C.red }]}>{selected.bestStreak}</Text><Text style={s.statBoxLabel}>🔥 Best Streak</Text></View>}
                    </View>
                  </>
                )}

                {selected.recordingUrl && (
                  <TouchableOpacity style={s.videoBtn} onPress={() => Linking.openURL(selected.recordingUrl)} activeOpacity={0.85}>
                    <Ionicons name="play-circle" size={20} color="#fff" />
                    <Text style={s.videoBtnText}>Watch Submitted Video</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: C.white },
  headerSub:   { fontSize: 11, color: C.gray, marginTop: 2 },
  newBadge:    { backgroundColor: C.blue + '22', borderRadius: 50, borderWidth: 1, borderColor: C.blue + '44', paddingHorizontal: 10, paddingVertical: 4 },
  newBadgeText:{ fontSize: 10, fontWeight: '800', color: C.blue, letterSpacing: 0.5 },

  filterRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { borderRadius: 50, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 8 },
  filterChipActive: { backgroundColor: C.blue + '18', borderColor: C.blue + '55' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: C.gray },
  filterChipTextActive: { color: C.blue },

  scroll:   { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  rowIcon:  { width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue + '18', justifyContent: 'center', alignItems: 'center' },
  rowMember:  { fontSize: 14, fontWeight: '800', color: C.white },
  rowTraining:{ fontSize: 12, color: C.lightGray },
  rowMeta:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowLevel: { fontSize: 10, color: C.blue, fontWeight: '700', textTransform: 'uppercase' },
  rowDot:   { fontSize: 10, color: C.gray },
  rowReps:  { fontSize: 10, color: C.gray },
  rowDate:  { fontSize: 10, color: C.gray },
  unviewedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },

  emptyBox:  { alignItems: 'center', gap: 10, paddingTop: 70 },
  emptyTitle:{ fontSize: 17, fontWeight: '800', color: C.white },
  emptySub:  { fontSize: 12, color: C.gray, textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },

  // Viewer modal — centered
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 16 },
  modalCard:    { backgroundColor: C.card, borderRadius: 22, padding: 24, borderWidth: 1, borderColor: C.border, maxHeight: '85%' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 18, fontWeight: '900', color: C.white },
  reportMember: { fontSize: 16, fontWeight: '800', color: C.white },
  reportSub:    { fontSize: 12, color: C.gray, marginTop: 2 },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  statBox:      { flexBasis: '47%', flexGrow: 1, backgroundColor: C.inputBg, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 16, alignItems: 'center', gap: 4 },
  statBoxVal:   { fontSize: 22, fontWeight: '900', color: C.white },
  statBoxLabel: { fontSize: 11, color: C.gray, fontWeight: '700' },
  breakdownTitle: { fontSize: 13, fontWeight: '800', color: C.white, marginTop: 22, marginBottom: 2 },
  videoBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.blue, borderRadius: 12, height: 50, marginTop: 20 },
  videoBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
