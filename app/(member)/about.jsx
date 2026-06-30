import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { C } from '../../lib/theme';

const COACHES = [
  {
    name: 'Coach Rafael Labordo', role: 'Head Coach · 16 Years Experience',
    initial: 'RL', specialty: 'Boxing · Muay Thai',
    color: '#e84a2f',
    achievement: '2x Awardee of Makati Government Professional Instructor',
    // Place Coach Rafael's certification photo in assets/coaches/rafael-cert.jpg
    // then replace the require() path below to match.
    certImage: require('../../assets/coaches/rafael-cert.png'),
  },
  {
    name: 'Coach Michael Labordo', role: 'Assistant Coach · 8 Years Experience',
    initial: 'ML', specialty: 'Boxing · Conditioning',
    color: '#f5c842',
    achievement: '3x URCC Winner',
    // Place Coach Michael's certification photo in assets/coaches/michael-cert.jpg
    // then replace the require() path below to match.
    certImage: require('../../assets/coaches/michael-cert.png'),
  },
];

const VALUES = [
  { icon: '🥊', title: 'Discipline',    desc: 'We believe discipline in training translates to discipline in life. Every session builds mental toughness alongside physical strength.' },
  { icon: '🤝', title: 'Community',     desc: "Wild Bout is more than a gym — it's a family. We push each other to be better every single day." },
  { icon: '🏆', title: 'Excellence',    desc: "We don't just train fighters. We build athletes who carry the champion mindset into everything they do." },
  { icon: '🛡️', title: 'Safety First', desc: 'Every technique is taught with safety as the priority. Our coaches ensure every member trains smart and injury-free.' },
];

const GYM_STATS = [
  { val: '8+',  label: 'Years Running',  icon: '📅' },
  { val: '40+', label: 'Active Members', icon: '👊' },
  { val: '2',   label: 'Expert Coaches', icon: '🥊' },
  { val: '4',   label: 'Class Types',    icon: '📋' },
];

const OFFERINGS = [
  'Private 1-on-1 Coaching Sessions',
  'Group Boxing Classes (all levels)',
  'Sparring & Competition Prep',
  'Strength & Conditioning Programs',
  'Youth Boxing Development',
  'HITTRACK Digital Training Platform',
];

const CONTACT = [
  { icon: '📍', label: 'Location', val: 'Wild Bout Boxing Gym, Metro Manila, Philippines' },
  { icon: '📞', label: 'Phone',    val: '+63 927 365 9145' },
  { icon: '📧', label: 'Email',    val: 'wildbouthittrack@gmail.com' },
  { icon: '🕐', label: 'Hours',    val: 'Mon–Sun: 6:00 AM – 9:00 PM' },
];

export default function AboutUsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/(member)/home')}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>About Us</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── HERO ── */}
        <View style={s.heroCard}>
          <View style={s.heroAccent} />
          <Text style={s.heroEst}>Est. 2018 · Wild Bout Boxing Gym</Text>
          <Text style={s.heroTitle}>WILD BOUT</Text>
          <Text style={s.heroTitleRed}>BOXING GYM</Text>
          <Text style={s.heroTagline}>
            Where champions are forged. We train fighters, build athletes, and create warriors who carry the boxing spirit into every area of life.
          </Text>
        </View>

        {/* ── GYM STATS ── */}
        <View style={s.statsGrid}>
          {GYM_STATS.map((st, i) => (
            <View key={i} style={s.statCard}>
              <Text style={{ fontSize: 26, marginBottom: 6 }}>{st.icon}</Text>
              <Text style={s.statVal}>{st.val}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* ── OUR STORY ── */}
        <View style={s.card}>
          <Text style={s.sectionTag}>Our Story</Text>
          <Text style={s.sectionTitle}>Built for Fighters, By Fighters</Text>
          <Text style={s.bodyText}>
            Wild Bout Boxing Gym was founded with one mission: to give every person — regardless of background or experience — access to world-class boxing training in a welcoming, high-energy environment.
          </Text>
          <Text style={[s.bodyText, { marginTop: 10 }]}>
            From complete beginners to competitive fighters, our coaches tailor every program to the individual. We believe boxing is more than a sport — it's a lifestyle that builds confidence, discipline, and resilience.
          </Text>

          <Text style={[s.sectionTag, { marginTop: 20 }]}>What We Offer</Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {OFFERINGS.map((item, i) => (
              <View key={i} style={s.offeringRow}>
                <View style={s.offeringDot} />
                <Text style={s.offeringText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── COACHES ── */}
        <View>
          <Text style={s.sectionTag}>Meet The Team</Text>
          <Text style={s.sectionTitleCenter}>Our Coaches</Text>
          <View style={{ gap: 14 }}>
            {COACHES.map((coach, i) => (
              <View key={i} style={[s.coachCard, { borderColor: coach.color + '33' }]}>
                <View style={[s.coachGlow, { backgroundColor: coach.color + '18' }]} />

                {/* Coach top row — avatar + name/role/specialty */}
                <View style={s.coachTop}>
                  <View style={[s.coachAvatar, { borderColor: coach.color, backgroundColor: coach.color + '22' }]}>
                    <Text style={[s.coachAvatarText, { color: coach.color }]}>{coach.initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.coachName}>{coach.name}</Text>
                    <Text style={[s.coachRole, { color: coach.color }]}>{coach.role}</Text>
                    <Text style={s.coachSpecialtyLabel}>Specialty</Text>
                    <Text style={s.coachSpecialty}>{coach.specialty}</Text>
                  </View>
                </View>

                {/* Achievement badge */}
                <View style={[s.achievementRow, { borderColor: coach.color + '44', backgroundColor: coach.color + '11' }]}>
                  <Ionicons name="trophy" size={15} color={coach.color} />
                  <Text style={[s.achievementText, { color: coach.color }]}>{coach.achievement}</Text>
                </View>

                {/* Certification photo */}
                <View style={s.certSection}>
                  <Text style={s.certLabel}>CERTIFICATION</Text>
                  <Image
                    source={coach.certImage}
                    style={s.certImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── VALUES ── */}
        <View>
          <Text style={s.sectionTag}>What We Stand For</Text>
          <Text style={s.sectionTitleCenter}>Our Values</Text>
          <View style={s.valuesGrid}>
            {VALUES.map((v, i) => (
              <View key={i} style={s.valueCard}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>{v.icon}</Text>
                <Text style={s.valueTitle}>{v.title}</Text>
                <Text style={s.valueDesc}>{v.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── CONTACT INFO ── */}
        <View style={s.card}>
          <Text style={s.sectionTag}>Get In Touch</Text>
          <Text style={s.sectionTitle}>Ready to Start Your Journey?</Text>
          <View style={{ gap: 14, marginTop: 4 }}>
            {CONTACT.map((c, i) => (
              <View key={i} style={s.contactRow}>
                <View style={s.contactIcon}>
                  <Text style={{ fontSize: 18 }}>{c.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.contactLabel}>{c.label}</Text>
                  <Text style={s.contactVal}>{c.val}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 50, gap: 16 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:     { width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white },

  // Hero
  heroCard:     { backgroundColor: C.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: C.red + '33', marginTop: 14, overflow: 'hidden', alignItems: 'center' },
  heroAccent:   { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: C.red },
  heroEst:      { fontSize: 11, fontWeight: '700', color: C.red, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 },
  heroTitle:    { fontSize: 48, fontWeight: '900', color: C.white, letterSpacing: 3, lineHeight: 52 },
  heroTitleRed: { fontSize: 48, fontWeight: '900', color: 'transparent', letterSpacing: 3, lineHeight: 56, textDecorationLine: 'none', borderWidth: 2, borderColor: 'transparent', textShadowColor: C.red, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 0 },
  heroTagline:  { fontSize: 13, color: C.gray, lineHeight: 22, textAlign: 'center', marginTop: 14, maxWidth: 300 },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:  { width: '47.5%', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, alignItems: 'center' },
  statVal:   { fontSize: 36, fontWeight: '900', color: C.red, lineHeight: 40 },
  statLabel: { fontSize: 10, color: C.gray, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginTop: 4 },

  // Generic card
  card: { backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.border },

  sectionTag:         { fontSize: 10, fontWeight: '700', color: C.red, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  sectionTitle:       { fontSize: 20, fontWeight: '900', color: C.white, marginBottom: 12 },
  sectionTitleCenter: { fontSize: 26, fontWeight: '900', color: C.white, marginBottom: 16, textAlign: 'center' },
  bodyText:           { fontSize: 13, color: C.gray, lineHeight: 22 },

  // Offerings
  offeringRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.inputBg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.red + '18' },
  offeringDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  offeringText: { fontSize: 13, color: C.white, fontWeight: '500', flex: 1 },

  // Coaches
  coachCard:   { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, padding: 18, overflow: 'hidden', position: 'relative' },
  coachGlow:   { position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: 50 },
  coachTop:    { flexDirection: 'row', gap: 14, marginBottom: 14 },
  coachAvatar: { width: 70, height: 70, borderRadius: 35, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center' },
  coachAvatarText:     { fontSize: 24, fontWeight: '900' },
  coachName:           { fontSize: 15, fontWeight: '800', color: C.white, marginBottom: 3 },
  coachRole:           { fontSize: 11, fontWeight: '600', marginBottom: 10 },
  coachSpecialtyLabel: { fontSize: 9, color: C.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  coachSpecialty:      { fontSize: 12, color: C.lightGray },

  // Achievement badge
  achievementRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 14 },
  achievementText: { fontSize: 12, fontWeight: '700', flex: 1, lineHeight: 18 },

  // Certification photo
  certSection: { gap: 8 },
  certLabel:   { fontSize: 9, fontWeight: '700', color: C.gray, letterSpacing: 1.5, textTransform: 'uppercase' },
  certImage:   { width: '100%', height: 200, borderRadius: 12, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },

  // Values
  valuesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  valueCard:  { width: '47.5%', backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, alignItems: 'center' },
  valueTitle: { fontSize: 14, fontWeight: '800', color: C.white, marginBottom: 8, textAlign: 'center' },
  valueDesc:  { fontSize: 11, color: C.gray, lineHeight: 18, textAlign: 'center' },

  // Contact
  contactRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  contactIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: C.red + '18', borderWidth: 1, borderColor: C.red + '33', justifyContent: 'center', alignItems: 'center' },
  contactLabel: { fontSize: 9, fontWeight: '700', color: C.gray, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  contactVal:   { fontSize: 13, color: C.white, fontWeight: '500' },
});