import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E',
  green: '#4ade80', gold: '#F5C842',
};

const COACHES = [
  {
    name: 'Coach Rafael Labordo', role: 'Head Coach · 12 Years Experience',
    initial: 'RL', specialty: 'Combination Work · Defense Strategy',
    color: '#e84a2f', students: 24, wins: 38,
    quote: 'Boxing is chess with your fists. Every move is calculated.',
  },
  {
    name: 'Coach Joey Mendoza', role: 'Assistant Coach · 8 Years Experience',
    initial: 'JM', specialty: 'Footwork · Conditioning',
    color: '#f5c842', students: 18, wins: 22,
    quote: 'Train hard, fight easy. Discipline is the foundation of every champion.',
  },
];

const VALUES = [
  { icon: '🥊', title: 'Discipline',    desc: 'We believe discipline in training translates to discipline in life. Every session builds mental toughness alongside physical strength.' },
  { icon: '🤝', title: 'Community',     desc: "Wild Bout is more than a gym — it's a family. We push each other to be better every single day." },
  { icon: '🏆', title: 'Excellence',    desc: "We don't just train fighters. We build athletes who carry the champion mindset into everything they do." },
  { icon: '🛡️', title: 'Safety First', desc: 'Every technique is taught with safety as the priority. Our coaches ensure every member trains smart and injury-free.' },
];

const GYM_STATS = [
  { val: '5+',  label: 'Years Running',  icon: '📅' },
  { val: '40+', label: 'Active Members', icon: '👊' },
  { val: '2',   label: 'Expert Coaches', icon: '🥊' },
  { val: '10+', label: 'Class Types',    icon: '📋' },
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
  { icon: '📞', label: 'Phone',    val: '+63 900 000 0000' },
  { icon: '📧', label: 'Email',    val: 'wildbout@boxing.ph' },
  { icon: '🕐', label: 'Hours',   val: 'Mon–Sat: 6:00 AM – 9:00 PM' },
];

export default function AboutUsScreen() {
  const router = useRouter();
  const [msgForm, setMsgForm] = useState({ name: '', email: '', message: '' });

  const handleSend = () => {
    if (!msgForm.name.trim() || !msgForm.email.trim() || !msgForm.message.trim()) {
      Alert.alert('Missing info', 'Please fill in all fields before sending.');
      return;
    }
    Alert.alert('Message Sent! 🥊', 'Thanks for reaching out. We\'ll get back to you shortly.');
    setMsgForm({ name: '', email: '', message: '' });
  };

  return (
    <SafeAreaView style={s.safe}>
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
          <Text style={s.heroEst}>Est. 2019 · Wild Bout Boxing Gym</Text>
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

                {/* Coach top row */}
                <View style={s.coachTop}>
                  <View style={[s.coachAvatar, { borderColor: coach.color, backgroundColor: coach.color + '22' }]}>
                    <Text style={[s.coachAvatarText, { color: coach.color }]}>{coach.initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.coachName}>{coach.name}</Text>
                    <Text style={[s.coachRole, { color: coach.color }]}>{coach.role}</Text>
                    {/* Mini stats */}
                    <View style={s.coachStatsRow}>
                      {[{ label: 'Students', val: coach.students }, { label: 'Victories', val: coach.wins }].map((st, j) => (
                        <View key={j} style={[s.coachStat, { backgroundColor: coach.color + '18', borderColor: coach.color + '33' }]}>
                          <Text style={[s.coachStatVal, { color: coach.color }]}>{st.val}</Text>
                          <Text style={s.coachStatLabel}>{st.label}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={s.coachSpecialtyLabel}>Specialty</Text>
                    <Text style={s.coachSpecialty}>{coach.specialty}</Text>
                  </View>
                </View>

                {/* Quote */}
                <View style={[s.coachQuoteBox, { borderColor: coach.color + '22' }]}>
                  <Text style={[s.coachQuoteMark, { color: coach.color }]}>"</Text>
                  <Text style={s.coachQuote}>{coach.quote}</Text>
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

        {/* ── SEND MESSAGE FORM ── */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Send a Message</Text>
          <Text style={[s.bodyText, { marginBottom: 16 }]}>Have a question or want to visit? Reach out and we'll get back to you.</Text>
          <View style={{ gap: 12 }}>
            <TextInput
              style={s.formInput}
              placeholder="Full Name"
              placeholderTextColor={C.gray}
              value={msgForm.name}
              onChangeText={v => setMsgForm(p => ({ ...p, name: v }))}
              autoCapitalize="words"
            />
            <TextInput
              style={s.formInput}
              placeholder="Email Address"
              placeholderTextColor={C.gray}
              value={msgForm.email}
              onChangeText={v => setMsgForm(p => ({ ...p, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={[s.formInput, { minHeight: 110, textAlignVertical: 'top' }]}
              placeholder="Your message..."
              placeholderTextColor={C.gray}
              value={msgForm.message}
              onChangeText={v => setMsgForm(p => ({ ...p, message: v }))}
              multiline
              numberOfLines={4}
              autoCapitalize="sentences"
            />
            <TouchableOpacity style={s.sendBtn} onPress={handleSend} activeOpacity={0.85}>
              <Text style={s.sendBtnText}>Send Message 🥊</Text>
            </TouchableOpacity>
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
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:   { width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white },

  // Hero
  heroCard: { backgroundColor: C.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: C.red + '33', marginTop: 14, overflow: 'hidden', alignItems: 'center' },
  heroAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: C.red },
  heroEst:    { fontSize: 11, fontWeight: '700', color: C.red, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 },
  heroTitle:  { fontSize: 48, fontWeight: '900', color: C.white, letterSpacing: 3, lineHeight: 52 },
  heroTitleRed: { fontSize: 48, fontWeight: '900', color: 'transparent', letterSpacing: 3, lineHeight: 56, textDecorationLine: 'none', borderWidth: 2, borderColor: 'transparent', textShadowColor: C.red, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 0 },
  heroTagline:{ fontSize: 13, color: C.gray, lineHeight: 22, textAlign: 'center', marginTop: 14, maxWidth: 300 },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:  { width: '47.5%', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, alignItems: 'center' },
  statVal:   { fontSize: 36, fontWeight: '900', color: C.red, lineHeight: 40 },
  statLabel: { fontSize: 10, color: C.gray, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginTop: 4 },

  // Generic card
  card: { backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.border },

  sectionTag:   { fontSize: 10, fontWeight: '700', color: C.red, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: C.white, marginBottom: 12 },
  sectionTitleCenter: { fontSize: 26, fontWeight: '900', color: C.white, marginBottom: 16, textAlign: 'center' },
  bodyText:     { fontSize: 13, color: C.gray, lineHeight: 22 },

  // Offerings
  offeringRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.inputBg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.red + '18' },
  offeringDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  offeringText:{ fontSize: 13, color: C.white, fontWeight: '500', flex: 1 },

  // Coaches
  coachCard:  { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, padding: 18, overflow: 'hidden', position: 'relative' },
  coachGlow:  { position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: 50 },
  coachTop:   { flexDirection: 'row', gap: 14, marginBottom: 14 },
  coachAvatar:{ width: 70, height: 70, borderRadius: 35, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center' },
  coachAvatarText: { fontSize: 24, fontWeight: '900' },
  coachName:  { fontSize: 15, fontWeight: '800', color: C.white, marginBottom: 3 },
  coachRole:  { fontSize: 11, fontWeight: '600', marginBottom: 10 },
  coachStatsRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
  coachStat:      { borderRadius: 8, borderWidth: 1, padding: 8, alignItems: 'center', minWidth: 64 },
  coachStatVal:   { fontSize: 18, fontWeight: '900', lineHeight: 20 },
  coachStatLabel: { fontSize: 8, color: C.gray, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  coachSpecialtyLabel: { fontSize: 9, color: C.gray, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  coachSpecialty:      { fontSize: 12, color: C.lightGray },
  coachQuoteBox:  { backgroundColor: C.inputBg, borderRadius: 12, padding: 14, borderWidth: 1, marginTop: 4 },
  coachQuoteMark: { fontSize: 22, fontFamily: 'Georgia', opacity: 0.5, marginBottom: -4 },
  coachQuote:     { fontSize: 12, color: C.gray, fontStyle: 'italic', lineHeight: 20 },

  // Values
  valuesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  valueCard:  { width: '47.5%', backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, alignItems: 'center' },
  valueTitle: { fontSize: 14, fontWeight: '800', color: C.white, marginBottom: 8, textAlign: 'center' },
  valueDesc:  { fontSize: 11, color: C.gray, lineHeight: 18, textAlign: 'center' },

  // Contact
  contactRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  contactIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.red + '18', borderWidth: 1, borderColor: C.red + '33', justifyContent: 'center', alignItems: 'center' },
  contactLabel:{ fontSize: 9, fontWeight: '700', color: C.gray, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  contactVal:  { fontSize: 13, color: C.white, fontWeight: '500' },

  // Form
  formInput: { backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.white, fontSize: 14 },
  sendBtn:    { backgroundColor: C.red, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  sendBtnText:{ color: C.white, fontSize: 15, fontWeight: '800' },
});