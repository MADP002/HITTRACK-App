import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { loadPunchAnalytics } from '../../lib/punchAnalytics';

import { C } from '../../lib/theme';

// Mirrors web PunchAnalyticsCard METRIC_DEFS. powerOutput stays null in
// recordings mode (the pose pipeline owns it) — shown as "—".
// Only metrics we can ACTUALLY derive from the rep data. Power Output was
// removed — 2D keypoints can't measure force, it was always null. "Combo Flow"
// was really timing consistency, so it's honestly labeled "Rhythm"; "Form
// Accuracy" is a rough extension proxy, labeled "Form Quality".
const METRICS = [
  { key: 'punchSpeed', icon: '⚡', label: 'Punch Speed',  color: C.gold,  poseUnit: 'ppm', recUnit: 'rpm', max: 120 },
  { key: 'accuracy',   icon: '🎯', label: 'Form Quality', color: C.green, poseUnit: '%',   recUnit: '%',   max: 100 },
  { key: 'comboFlow',  icon: '🔄', label: 'Rhythm',       color: C.blue,  poseUnit: '%',   recUnit: '%',   max: 100 },
];

export default function TrainingReportScreen() {
  const router = useRouter();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setData(null); setLoading(false); return; }
    setLoading(true);
    loadPunchAnalytics(uid)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const source = data?.source || 'none';
  const isPose = source === 'pose';

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>📊 Training Report</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Source banner */}
        <View style={s.bannerCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.bannerTitle}>Punch Analytics</Text>
            <Text style={s.bannerSub}>Powered by AI Pose Detection · TensorFlow</Text>
          </View>
          {source !== 'none' && (
            <View style={[s.badge, { backgroundColor: (isPose ? C.green : C.gold) + '18', borderColor: (isPose ? C.green : C.gold) + '40' }]}>
              <Text style={[s.badgeText, { color: isPose ? C.green : C.gold }]}>{isPose ? 'LIVE' : 'SESSION SUMMARY'}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={C.red} />
            <Text style={s.loadingText}>Loading your report…</Text>
          </View>
        ) : source === 'none' ? (
          <View style={s.emptyCard}>
            <Text style={{ fontSize: 44 }}>📱</Text>
            <Text style={s.emptyTitle}>No Training Sessions Yet</Text>
            <Text style={s.emptyBody}>
              Your punch data is captured during live camera sessions in the Training Lab. Finish a session to see your speed, accuracy, and combo flow here.
            </Text>
            <TouchableOpacity style={s.labBtn} onPress={() => router.replace('/(member)/training-lab')} activeOpacity={0.85}>
              <Text style={s.labBtnText}>🥊 Go to Training Lab</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Sessions recorded */}
            <View style={s.sessionsBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={s.dot} />
                <Text style={s.sessionsText}>
                  {data.totalSessions} session{data.totalSessions !== 1 ? 's' : ''} recorded
                </Text>
              </View>
              {data.lastSessionAt && (
                <Text style={s.lastText}>
                  Last: {data.lastSessionAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              )}
            </View>

            {/* Metrics */}
            {METRICS.map((m) => {
              const raw = data.metrics[m.key];
              const missing = raw === null || raw === undefined;
              const unit = isPose ? m.poseUnit : m.recUnit;
              const pct = missing ? 0 : (m.key === 'punchSpeed' ? Math.min((raw / m.max) * 100, 100) : Math.min(raw, 100));
              return (
                <View key={m.key} style={[s.metricRow, { backgroundColor: m.color + '0d', borderColor: m.color + '22' }]}>
                  <Text style={{ fontSize: 22, opacity: missing ? 0.4 : 1 }}>{m.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={s.metricTop}>
                      <Text style={[s.metricLabel, { color: missing ? '#555' : '#aaa' }]}>{m.label}</Text>
                      {missing ? (
                        <Text style={s.metricMissing}>—</Text>
                      ) : (
                        <Text style={[s.metricVal, { color: m.color }]}>{Math.round(raw)}<Text style={s.metricUnit}> {unit}</Text></Text>
                      )}
                    </View>
                    <View style={s.barBg}>
                      <View style={{ height: '100%', borderRadius: 50, width: `${pct}%`, backgroundColor: missing ? 'rgba(255,255,255,0.06)' : m.color }} />
                    </View>
                    {missing && <Text style={s.comingSoon}>Not enough reps logged yet</Text>}
                  </View>
                </View>
              );
            })}

            {/* Recent sessions */}
            {data.recentSessions?.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <Text style={s.sectionLabel}>Recent Sessions</Text>
                <View style={{ gap: 6 }}>
                  {data.recentSessions.map((ss) => (
                    <View key={ss.id} style={s.sessRow}>
                      <View style={s.sessIcon}><Text style={{ fontSize: 14 }}>🥊</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.sessDate}>
                          {ss.date ? ss.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}
                        </Text>
                        <Text style={s.sessMeta}>{Math.round((ss.duration || 0) / 60)}min · {ss.totalPunches || 0} {isPose ? 'punches' : 'reps'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.sessAcc, { color: ss.accuracy >= 80 ? C.green : ss.accuracy >= 60 ? C.gold : C.red }]}>{ss.accuracy || 0}%</Text>
                        <Text style={s.sessAccLabel}>ACCURACY</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: C.white },
  scroll: { paddingHorizontal: 16, paddingBottom: 50, gap: 14, paddingTop: 14 },

  bannerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  bannerTitle: { fontSize: 15, fontWeight: '800', color: C.white },
  bannerSub:   { fontSize: 11, color: C.gray, marginTop: 2 },
  badge:       { borderRadius: 50, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:   { fontSize: 8, fontWeight: '800', letterSpacing: 1 },

  loadingBox:  { padding: 50, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: C.gray },

  emptyCard:  { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 28, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.white },
  emptyBody:  { fontSize: 13, color: C.gray, textAlign: 'center', lineHeight: 20 },
  labBtn:     { marginTop: 6, backgroundColor: C.red, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
  labBtnText: { fontSize: 14, fontWeight: '800', color: C.white },

  sessionsBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.green + '0d', borderWidth: 1, borderColor: C.green + '26', borderRadius: 14, padding: 14 },
  dot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  sessionsText: { fontSize: 12, fontWeight: '700', color: C.green },
  lastText:     { fontSize: 10, color: C.gray },

  metricRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  metricTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  metricLabel:  { fontSize: 11, fontWeight: '700' },
  metricVal:    { fontSize: 18, fontWeight: '900' },
  metricUnit:   { fontSize: 10, color: C.gray, fontWeight: '600' },
  metricMissing:{ fontSize: 18, fontWeight: '900', color: '#444' },
  barBg:        { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 50, overflow: 'hidden' },
  comingSoon:   { fontSize: 9, color: '#555', marginTop: 5, fontStyle: 'italic' },

  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.gray, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  sessRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10 },
  sessIcon:     { width: 32, height: 32, borderRadius: 8, backgroundColor: C.purple + '22', justifyContent: 'center', alignItems: 'center' },
  sessDate:     { fontSize: 11, fontWeight: '700', color: '#bbb' },
  sessMeta:     { fontSize: 9, color: C.gray, marginTop: 1 },
  sessAcc:      { fontSize: 16, fontWeight: '900' },
  sessAccLabel: { fontSize: 8, color: '#555', fontWeight: '700' },
});
