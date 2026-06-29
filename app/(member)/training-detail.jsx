import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet,  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getTypeInfo, getLevelLabel, getRequiredReps } from '../../lib/trainingPrograms';

import { C } from '../../lib/theme';

export default function TrainingDetailScreen() {
  const router = useRouter();
  const { trainingId, level } = useLocalSearchParams();

  const [training, setTraining] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'workouts', user.uid)).then(snap => {
      if (snap.exists()) {
        const program = snap.data().trainingProgram || [];
        const found   = program.find(t => t.id === trainingId);
        setTraining(found || null);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [trainingId]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>
      </SafeAreaView>
    );
  }

  if (!training) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}>
          <Text style={{ fontSize: 48 }}>❓</Text>
          <Text style={{ color: C.white, fontSize: 18, fontWeight: '800', marginTop: 12 }}>Training not found</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/(member)/training-lab')}>
            <Text style={{ color: C.red, fontWeight: '700' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const typeInfo    = getTypeInfo(training.type);
  const levelLabel  = getLevelLabel(level);
  const reps        = getRequiredReps(training, level);
  const repUnit     = training.type === 'strength' ? 'reps' : 'proper reps';

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.replace('/(member)/training-lab')}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{training.name}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ── */}
        <View style={[s.heroCard, { borderColor: typeInfo.color + '44' }]}>
          <View style={[s.heroAccent, { backgroundColor: typeInfo.color }]} />
          <Text style={s.heroEmoji}>{training.icon}</Text>
          <Text style={s.heroName}>{training.name}</Text>

          {/* Badges row */}
          <View style={s.badgesRow}>
            <View style={[s.badge, { backgroundColor: typeInfo.color + '22', borderColor: typeInfo.color + '55' }]}>
              <Text style={[s.badgeText, { color: typeInfo.color }]}>{typeInfo.emoji} {typeInfo.label}</Text>
            </View>
            {training.handLabel && (
              <View style={[s.badge, { backgroundColor: C.gold + '18', borderColor: C.gold + '44' }]}>
                <Text style={[s.badgeText, { color: C.gold }]}>🥊 {training.handLabel}</Text>
              </View>
            )}
            <View style={[s.badge, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <Text style={[s.badgeText, { color: C.gray }]}>⭐ {levelLabel}</Text>
            </View>
          </View>
        </View>

        {/* ── REQUIREMENT CARD ── */}
        <View style={s.requirementCard}>
          <View style={s.requirementLeft}>
            <Text style={s.requirementNum}>{reps}</Text>
            <Text style={s.requirementUnit}>{repUnit}</Text>
          </View>
          <View style={s.requirementRight}>
            <Text style={s.requirementTitle}>To Complete This Training</Text>
            <Text style={s.requirementSub}>
              Perform {reps} {repUnit} correctly to unlock the next training in your program.
            </Text>
          </View>
        </View>

        {/* ── DESCRIPTION ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionDot, { backgroundColor: C.red }]} />
            <Text style={s.sectionTitle}>What is the {training.name}?</Text>
          </View>
          <Text style={s.sectionBody}>{training.description}</Text>
        </View>

        {/* ── WHY USE IT ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionDot, { backgroundColor: C.gold }]} />
            <Text style={s.sectionTitle}>Why Use It?</Text>
          </View>
          <Text style={s.sectionBody}>{training.whyUse}</Text>
        </View>

        {/* ── HOW TO ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionDot, { backgroundColor: C.green }]} />
            <Text style={s.sectionTitle}>How To Do It</Text>
          </View>
          <View style={s.stepsList}>
            {(training.howTo || []).map((step, i) => (
              <View key={i} style={s.stepRow}>
                <View style={s.stepNum}>
                  <Text style={s.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={s.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── CAMERA DISTANCE ── */}
        <View style={[s.section, s.cameraSection]}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionDot, { backgroundColor: C.blue }]} />
            <Text style={s.sectionTitle}>Camera Setup</Text>
          </View>
          <View style={s.cameraCard}>
            <Text style={{ fontSize: 32 }}>📱</Text>
            <Text style={s.cameraText}>{training.cameraDistance}</Text>
          </View>
        </View>

        {/* Spacer for fixed button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── BEGIN TRAINING BUTTON (fixed at bottom) ── */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={s.beginBtn}
          onPress={() => router.push({
            pathname: '/(member)/training-camera',
            params: { trainingId: training.id, level },
          })}
          activeOpacity={0.85}
        >
          <Ionicons name="videocam-outline" size={20} color={C.white} />
          <Text style={s.beginBtnText}>Begin Training</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  scroll: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 30, gap: 14 },

  // Header
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  iconBtn:   { width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white, flex: 1, textAlign: 'center' },

  // Hero
  heroCard:  { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'center', gap: 12, overflow: 'hidden' },
  heroAccent:{ position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  heroEmoji: { fontSize: 64, marginBottom: 4 },
  heroName:  { fontSize: 26, fontWeight: '900', color: C.white, textAlign: 'center' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  badge:     { borderRadius: 50, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // Requirement card
  requirementCard:  { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: C.red + '18', borderRadius: 18, borderWidth: 1.5, borderColor: C.red + '55', padding: 20 },
  requirementLeft:  { alignItems: 'center', minWidth: 70 },
  requirementNum:   { fontSize: 42, fontWeight: '900', color: C.red, lineHeight: 46 },
  requirementUnit:  { fontSize: 10, color: C.red, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  requirementRight: { flex: 1 },
  requirementTitle: { fontSize: 14, fontWeight: '800', color: C.white, marginBottom: 4 },
  requirementSub:   { fontSize: 12, color: C.gray, lineHeight: 18 },

  // Sections
  section:       { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, gap: 12 },
  cameraSection: { borderColor: C.blue + '33', backgroundColor: C.blue + '08' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionDot:    { width: 10, height: 10, borderRadius: 5 },
  sectionTitle:  { fontSize: 15, fontWeight: '800', color: C.white },
  sectionBody:   { fontSize: 13, color: C.gray, lineHeight: 22 },

  // Steps
  stepsList: { gap: 12 },
  stepRow:   { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum:   { width: 26, height: 26, borderRadius: 13, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  stepNumText:{ fontSize: 12, fontWeight: '900', color: C.white },
  stepText:  { flex: 1, fontSize: 13, color: C.lightGray, lineHeight: 22 },

  // Camera card
  cameraCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: C.blue + '12', borderRadius: 14, padding: 14 },
  cameraText: { flex: 1, fontSize: 13, color: C.lightGray, lineHeight: 22 },

  // Bottom bar
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border, padding: 16, paddingBottom: 28 },
  beginBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.red, borderRadius: 14, height: 56, shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  beginBtnText: { fontSize: 16, fontWeight: '800', color: C.white, letterSpacing: 0.5 },

  backBtn: { marginTop: 16, padding: 12 },
});