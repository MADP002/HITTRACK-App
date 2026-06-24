import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';

const C = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  lightGray: '#CCCCCC', inputBg: '#1E1E1E', errorBg: '#2A1215',
  gold: '#F5C842', blue: '#42a5f5', green: '#4ade80', orange: '#fb923c',
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Password strength ─────────────────────────────────────────────────────
function getStrength(pw) {
  if (!pw) return null;
  // Score based on the 4 required criteria + bonus for extra length.
  // Password only reaches 'Strong' once all 4 requirements are satisfied.
  const hasLength  = pw.length >= 8;
  const hasUpper   = /[A-Z]/.test(pw);
  const hasDigit   = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const bonusLen   = pw.length >= 12;
  const score = [hasLength, hasUpper, hasDigit, hasSpecial, bonusLen].filter(Boolean).length;
  if (score <= 1) return { label: 'Weak',   color: C.red,    pct: 20  };
  if (score === 2) return { label: 'Fair',   color: C.orange, pct: 45  };
  if (score === 3) return { label: 'Good',   color: C.gold,   pct: 70  };
  if (score === 4) return { label: 'Strong', color: C.green,  pct: 90  };
  return                  { label: 'Strong', color: C.green,  pct: 100 };
}

// ── Age from DOB ──────────────────────────────────────────────────────────
function calcAge(day, month, year) {
  if (!day || !month || !year || year.length < 4) return null;
  const d   = parseInt(day, 10);
  const m   = parseInt(month, 10);
  const y   = parseInt(year, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  const dob   = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export default function SignUpScreen() {
  const router = useRouter();

  const [accountType, setAccountType] = useState('member'); // 'member' | 'coach'
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    phone: '', password: '', confirmPassword: '',
    dobDay: '', dobMonth: '', dobYear: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [errors,       setErrors]       = useState({});

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: null, general: null }));
  };

  const strength = useMemo(() => getStrength(form.password), [form.password]);
  const age      = useMemo(() => calcAge(form.dobDay, form.dobMonth, form.dobYear), [form.dobDay, form.dobMonth, form.dobYear]);
  const isUnder18 = age !== null && age < 18;

  // ── Validation ─────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required.';
    if (!form.lastName.trim())  e.lastName  = 'Last name is required.';
    if (!form.email.trim())     e.email     = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email.';
    if (!form.phone.trim()) e.phone = 'Phone number is required.';
    else {
      const digits = form.phone.replace(/\D/g, '');
      if (digits.length !== 11) e.phone = 'Phone number must be exactly 11 digits.';
    }
    // DOB
    if (!form.dobDay || !form.dobMonth || !form.dobYear)
      e.dob = 'Please enter your complete date of birth.';
    else {
      const d = parseInt(form.dobDay, 10);
      const m = parseInt(form.dobMonth, 10);
      const y = parseInt(form.dobYear, 10);
      if (d < 1 || d > 31)           e.dob = 'Day must be between 1 and 31.';
      else if (m < 1 || m > 12)      e.dob = 'Month must be between 1 and 12.';
      else if (y < 1900 || y > new Date().getFullYear()) e.dob = 'Enter a valid year.';
    }
    if (!form.password) {
      e.password = 'Password is required.';
    } else {
      // Enforce all four password requirements — only applied to new accounts
      // going forward; existing accounts are unaffected (Firebase never re-checks
      // the old password, this validation only runs at the signup form level).
      if (form.password.length < 8)
        e.password = 'Password must be at least 8 characters.';
      else if (!/[A-Z]/.test(form.password))
        e.password = 'Password must include at least 1 uppercase letter.';
      else if (!/[0-9]/.test(form.password))
        e.password = 'Password must include at least 1 number.';
      else if (!/[^A-Za-z0-9]/.test(form.password))
        e.password = 'Password must include at least 1 special character (e.g. !@#$).';
    }
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSignUp = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const cred    = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      const uid     = cred.user.uid;
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
      const dobStr  = `${form.dobYear}-${form.dobMonth.padStart(2,'0')}-${form.dobDay.padStart(2,'0')}`;

      if (accountType === 'coach') {
        // Coach — pending approval, no program builder
        await setDoc(doc(db, 'users', uid), {
          uid, name: fullName, email: form.email.trim(),
          role: 'coach_pending', approved: false,
          programSetupDone: true,
          dob: dobStr,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        // Sign out immediately — they can't use the app until approved
        await signOut(auth);
        Alert.alert(
          '✅ Application Submitted',
          'Your coach account has been submitted for review. You will be notified once an admin approves your account.',
          [{ text: 'Go to Login', onPress: () => router.replace('/(auth)/login') }]
        );
      } else {
        // Member — go to program builder
        await setDoc(doc(db, 'users', uid), {
          uid, name: fullName, email: form.email.trim(),
          role: 'member', programSetupDone: false,
          dob: dobStr,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          age: age ?? null,
          bmi: null, bmiLabel: null, currentLevel: null,
          daysPerWeek: null, experience: null, goal: null,
          height: null, injuries: [], nickname: null,
          programGeneratedAt: null, stance: null, weight: null,
          weeklyProgram: null, weeklyPct: 0, streak: 0, totalWorkouts: 0,
        });
        router.replace({ pathname: '/(auth)/program-builder', params: { name: fullName } });
      }
    } catch (error) {
      let msg = 'Sign up failed. Please try again.';
      if (error.code === 'auth/email-already-in-use') msg = 'This email is already registered. Try logging in instead.';
      else if (error.code === 'auth/weak-password')   msg = 'Password is too weak. Use at least 8 characters.';
      else if (error.code === 'auth/invalid-email')   msg = 'Invalid email address.';
      else if (error.code === 'auth/network-request-failed') msg = 'No internet connection.';
      setErrors({ general: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── HEADER ── */}
          <View style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={C.white} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.appName}>🥊 HITTRACK</Text>
              <Text style={s.pageTitle}>Create Account</Text>
              <Text style={s.pageSub}>{accountType === 'coach' ? 'Coach registration' : 'Member registration'}</Text>
            </View>
          </View>

          <View style={s.card}>
            {errors.general && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={C.red} />
                <Text style={s.errorBoxText}>{errors.general}</Text>
              </View>
            )}

            {/* ── ACCOUNT TYPE TOGGLE ── */}
            <Text style={s.label}>I am signing up as a</Text>
            <View style={s.accountTypeRow}>
              {[
                { id: 'member', label: '🥋 Member' },
                { id: 'coach',  label: '🥊 Coach'  },
              ].map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.accountTypeBtn, accountType === t.id && s.accountTypeBtnActive]}
                  onPress={() => { setAccountType(t.id); setErrors({}); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.accountTypeBtnText, accountType === t.id && s.accountTypeBtnTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Coach notice */}
            {accountType === 'coach' && (
              <View style={s.coachNotice}>
                <Ionicons name="time-outline" size={16} color={C.blue} />
                <Text style={s.coachNoticeText}>
                  Coach accounts require <Text style={{ fontWeight: '800', color: C.blue }}>admin approval</Text> before you can log in. You will be notified once approved.
                </Text>
              </View>
            )}

            {/* ── NAME ROW ── */}
            <View style={s.nameRow}>
              <View style={[s.fieldGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={s.label}>First Name</Text>
                <View style={[s.inputRow, errors.firstName && s.inputError]}>
                  <TextInput style={s.input} placeholder="Juan" placeholderTextColor={C.gray}
                    value={form.firstName} onChangeText={t => updateField('firstName', t)} autoCapitalize="words" />
                </View>
                {errors.firstName && <Text style={s.errorText}>{errors.firstName}</Text>}
              </View>
              <View style={[s.fieldGroup, { flex: 1 }]}>
                <Text style={s.label}>Last Name</Text>
                <View style={[s.inputRow, errors.lastName && s.inputError]}>
                  <TextInput style={s.input} placeholder="Dela Cruz" placeholderTextColor={C.gray}
                    value={form.lastName} onChangeText={t => updateField('lastName', t)} autoCapitalize="words" />
                </View>
                {errors.lastName && <Text style={s.errorText}>{errors.lastName}</Text>}
              </View>
            </View>

            {/* ── EMAIL ── */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Email</Text>
              <View style={[s.inputRow, errors.email && s.inputError]}>
                <Ionicons name="mail-outline" size={18} color={C.gray} style={s.icon} />
                <TextInput style={s.input} placeholder="juandelacruz@email.com" placeholderTextColor={C.gray}
                  value={form.email} onChangeText={t => updateField('email', t)}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              </View>
              {errors.email && <Text style={s.errorText}>{errors.email}</Text>}
            </View>

            {/* ── PHONE — max 11 digits ── */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Phone Number</Text>
              <View style={[s.inputRow, errors.phone && s.inputError]}>
                <Ionicons name="call-outline" size={18} color={C.gray} style={s.icon} />
                <TextInput style={s.input} placeholder="09XXXXXXXXX" placeholderTextColor={C.gray}
                  value={form.phone}
                  onChangeText={t => {
                    const digits = t.replace(/\D/g, '').slice(0, 11);
                    updateField('phone', digits);
                  }}
                  keyboardType="phone-pad" maxLength={11} />
              </View>
              {errors.phone
                ? <Text style={s.errorText}>{errors.phone}</Text>
                : <Text style={s.hintTextSmall}>{form.phone.replace(/\D/g,'').length}/11 digits</Text>
              }
            </View>

            {/* ── DATE OF BIRTH ── */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Date of Birth</Text>
              <View style={[s.dobRow, errors.dob && { opacity: 1 }]}>
                {/* Day */}
                <View style={[s.dobField, errors.dob && s.inputError]}>
                  <TextInput style={s.dobInput} placeholder="DD" placeholderTextColor={C.gray}
                    value={form.dobDay}
                    onChangeText={t => updateField('dobDay', t.replace(/\D/g,'').slice(0,2))}
                    keyboardType="number-pad" maxLength={2} textAlign="center" />
                </View>
                <Text style={s.dobSep}>/</Text>
                {/* Month */}
                <View style={[s.dobField, errors.dob && s.inputError]}>
                  <TextInput style={s.dobInput} placeholder="MM" placeholderTextColor={C.gray}
                    value={form.dobMonth}
                    onChangeText={t => updateField('dobMonth', t.replace(/\D/g,'').slice(0,2))}
                    keyboardType="number-pad" maxLength={2} textAlign="center" />
                </View>
                <Text style={s.dobSep}>/</Text>
                {/* Year */}
                <View style={[s.dobFieldWide, errors.dob && s.inputError]}>
                  <TextInput style={s.dobInput} placeholder="YYYY" placeholderTextColor={C.gray}
                    value={form.dobYear}
                    onChangeText={t => updateField('dobYear', t.replace(/\D/g,'').slice(0,4))}
                    keyboardType="number-pad" maxLength={4} textAlign="center" />
                </View>
              </View>
              {errors.dob
                ? <Text style={s.errorText}>{errors.dob}</Text>
                : form.dobYear.length === 4 && age !== null && (
                    <Text style={s.hintTextSmall}>
                      {age >= 0 ? `Age: ${age} years old` : 'Invalid date'}
                    </Text>
                  )
              }
              {/* Waiver notice — members only, under 18 only */}
              {accountType === 'member' && isUnder18 && (
                <View style={s.waiverNotice}>
                  <Ionicons name="warning-outline" size={14} color={C.gold} />
                  <Text style={s.waiverNoticeText}>
                    Minors are required to sign a <Text style={{ fontWeight: '800' }}>waiver at the gym</Text> before their first training session.
                  </Text>
                </View>
              )}
            </View>

            {/* ── PASSWORD ── */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Password</Text>
              <View style={[s.inputRow, errors.password && s.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color={C.gray} style={s.icon} />
                <TextInput style={s.input} placeholder="Min 8 chars, A-Z, 0-9, symbol" placeholderTextColor={C.gray}
                  value={form.password} onChangeText={t => updateField('password', t)}
                  secureTextEntry={!showPassword} autoCapitalize="none" />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.gray} />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={s.errorText}>{errors.password}</Text>}

              {/* Password strength indicator */}
              {form.password.length > 0 && strength && (
                <View style={s.strengthWrap}>
                  <View style={s.strengthBarBg}>
                    <View style={[s.strengthBarFill, { width: `${strength.pct}%`, backgroundColor: strength.color }]} />
                  </View>
                  <Text style={[s.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                </View>
              )}
              {/* Requirements checklist — shown as user types */}
              {form.password.length > 0 && (
                <View style={s.reqList}>
                  {[
                    { label: 'At least 8 characters',      met: form.password.length >= 8 },
                    { label: 'At least 1 uppercase letter', met: /[A-Z]/.test(form.password) },
                    { label: 'At least 1 number',          met: /[0-9]/.test(form.password) },
                    { label: 'At least 1 special character (e.g. !@#$)', met: /[^A-Za-z0-9]/.test(form.password) },
                  ].map(r => (
                    <View key={r.label} style={s.reqRow}>
                      <Ionicons
                        name={r.met ? 'checkmark-circle' : 'ellipse-outline'}
                        size={13}
                        color={r.met ? C.green : C.gray}
                      />
                      <Text style={[s.reqText, r.met && { color: C.green }]}>{r.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* ── CONFIRM PASSWORD ── */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Confirm Password</Text>
              <View style={[s.inputRow, errors.confirmPassword && s.inputError]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={C.gray} style={s.icon} />
                <TextInput style={s.input} placeholder="Re-enter your password" placeholderTextColor={C.gray}
                  value={form.confirmPassword} onChangeText={t => updateField('confirmPassword', t)}
                  secureTextEntry={!showConfirm} autoCapitalize="none" />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={s.eyeBtn}>
                  <Ionicons name={showConfirm ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.gray} />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && <Text style={s.errorText}>{errors.confirmPassword}</Text>}
              {/* Match indicator */}
              {form.confirmPassword.length > 0 && !errors.confirmPassword && (
                <Text style={{ color: form.password === form.confirmPassword ? C.green : C.red, fontSize: 12, marginTop: 5 }}>
                  {form.password === form.confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                </Text>
              )}
            </View>

            {/* ── SUBMIT ── */}
            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSignUp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.submitBtnText}>
                    {accountType === 'coach' ? 'SUBMIT APPLICATION' : 'CREATE ACCOUNT'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          <View style={s.loginRow}>
            <Text style={s.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={s.loginLink}>Log In</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },

  header:  { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  backBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  appName: { fontSize: 14, fontWeight: '800', color: C.red, letterSpacing: 3, marginBottom: 2 },
  pageTitle: { fontSize: 22, fontWeight: '900', color: C.white },
  pageSub:   { fontSize: 13, color: C.gray, marginTop: 1 },

  card: { backgroundColor: C.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: C.border },

  errorBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.errorBg, borderRadius: 10, borderWidth: 1, borderColor: C.red, padding: 12, marginBottom: 16, gap: 8 },
  errorBoxText: { color: C.red, fontSize: 13, flex: 1 },
  errorText:    { color: C.red, fontSize: 12, marginTop: 5, marginLeft: 2 },
  hintTextSmall:{ color: C.gray, fontSize: 11, marginTop: 5, marginLeft: 2 },

  // Account type toggle
  accountTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  accountTypeBtn: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg, justifyContent: 'center', alignItems: 'center' },
  accountTypeBtnActive: { borderColor: C.red + '88', backgroundColor: C.red + '18' },
  accountTypeBtnText:   { fontSize: 14, fontWeight: '700', color: C.gray },
  accountTypeBtnTextActive: { color: C.red },

  // Coach notice
  coachNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.blue + '11', borderRadius: 12, borderWidth: 1, borderColor: C.blue + '33', padding: 12, marginBottom: 16 },
  coachNoticeText: { flex: 1, fontSize: 12, color: C.blue, lineHeight: 18 },

  nameRow:    { flexDirection: 'row' },
  fieldGroup: { marginBottom: 16 },
  label:      { fontSize: 13, fontWeight: '600', color: C.lightGray, marginBottom: 8, letterSpacing: 0.5 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 52 },
  inputError: { borderColor: C.red },
  icon:       { marginRight: 10 },
  input:      { flex: 1, color: C.white, fontSize: 15 },
  eyeBtn:     { padding: 4 },

  // DOB
  dobRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dobField:    { flex: 1, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, height: 52, justifyContent: 'center' },
  dobFieldWide:{ flex: 1.6, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, height: 52, justifyContent: 'center' },
  dobInput:    { color: C.white, fontSize: 16, fontWeight: '700' },
  dobSep:      { fontSize: 20, color: C.gray, fontWeight: '300' },

  // Waiver notice
  waiverNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.gold + '11', borderRadius: 10, borderWidth: 1, borderColor: C.gold + '44', padding: 10, marginTop: 10 },
  waiverNoticeText: { flex: 1, fontSize: 12, color: C.gold, lineHeight: 18 },

  // Password strength
  strengthWrap:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  strengthBarBg:  { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 50, overflow: 'hidden' },
  strengthBarFill:{ height: '100%', borderRadius: 50 },
  strengthLabel:  { fontSize: 12, fontWeight: '800', minWidth: 46 },
  // Password requirements checklist
  reqList: { marginTop: 10, gap: 5 },
  reqRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reqText: { fontSize: 12, color: C.gray },

  submitBtn:     { backgroundColor: C.red, borderRadius: 12, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 8, shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  submitBtnText: { color: C.white, fontSize: 16, fontWeight: '800', letterSpacing: 2 },

  loginRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  loginText: { color: C.gray, fontSize: 14 },
  loginLink: { color: C.red, fontSize: 14, fontWeight: '700' },
});