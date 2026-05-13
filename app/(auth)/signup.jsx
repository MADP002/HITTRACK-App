import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';

const COLORS = {
  bg: '#0A0A0A',
  card: '#161616',
  border: '#2A2A2A',
  red: '#E63946',
  white: '#FFFFFF',
  gray: '#888888',
  lightGray: '#CCCCCC',
  inputBg: '#1E1E1E',
  errorBg: '#2A1215',
};

export default function SignUpScreen() {
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: null, general: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.firstName.trim()) newErrors.firstName = 'First name is required.';
    if (!form.lastName.trim()) newErrors.lastName = 'Last name is required.';
    if (!form.email.trim()) newErrors.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = 'Enter a valid email.';
    if (!form.phone.trim()) newErrors.phone = 'Phone number is required.';
    else if (!/^\d{10,11}$/.test(form.phone.replace(/\D/g, '')))
      newErrors.phone = 'Enter a valid phone number.';
    if (!form.password) newErrors.password = 'Password is required.';
    else if (form.password.length < 8) newErrors.password = 'Must be at least 8 characters.';
    if (!form.confirmPassword) newErrors.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      // Step 1: Create account in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password
      );
      const uid = userCredential.user.uid;
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;

      // Step 2: Create initial user document in Firestore
      // programSetupDone is false — will be set to true after program builder
      await setDoc(doc(db, 'users', uid), {
        uid,
        name: fullName,
        email: form.email.trim(),
        role: 'member',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        programSetupDone: false,
        disabled: false,
        // Profile fields — filled in during program builder
        age: null,
        bmi: null,
        bmiLabel: null,
        currentLevel: null,
        daysPerWeek: null,
        experience: null,
        goal: null,
        height: null,
        injuries: [],
        nickname: null,
        programGeneratedAt: null,
        stance: null,
        weight: null,
        weeklyProgram: null,
        weeklyPct: 0,
        streak: 0,
        totalWorkouts: 0,
      });

      // Step 3: Go to program builder, passing name so it can pre-fill
      router.replace({
        pathname: '/(auth)/program-builder',
        params: { name: fullName },
      });

    } catch (error) {
      let message = 'Sign up failed. Please try again.';
      switch (error.code) {
        case 'auth/email-already-in-use':
          message = 'This email is already registered. Try logging in instead.';
          break;
        case 'auth/weak-password':
          message = 'Password is too weak. Use at least 8 characters.';
          break;
        case 'auth/invalid-email':
          message = 'Invalid email address.';
          break;
        case 'auth/network-request-failed':
          message = 'No internet connection. Please check your network.';
          break;
        default:
          message = 'Sign up failed. Please try again.';
      }
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── HEADER ── */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.appName}>🥊 HITTRACK</Text>
              <Text style={styles.pageTitle}>Create Account</Text>
              <Text style={styles.pageSub}>Member registration</Text>
            </View>
          </View>

          {/* ── FORM CARD ── */}
          <View style={styles.card}>

            {errors.general && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.red} />
                <Text style={styles.errorBoxText}>{errors.general}</Text>
              </View>
            )}

            {/* First Name + Last Name */}
            <View style={styles.nameRow}>
              <View style={[styles.fieldGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>First Name</Text>
                <View style={[styles.inputRow, errors.firstName && styles.inputError]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Rafael"
                    placeholderTextColor={COLORS.gray}
                    value={form.firstName}
                    onChangeText={(t) => updateField('firstName', t)}
                    autoCapitalize="words"
                  />
                </View>
                {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Last Name</Text>
                <View style={[styles.inputRow, errors.lastName && styles.inputError]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Dela Cruz"
                    placeholderTextColor={COLORS.gray}
                    value={form.lastName}
                    onChangeText={(t) => updateField('lastName', t)}
                    autoCapitalize="words"
                  />
                </View>
                {errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputRow, errors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={18} color={COLORS.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="raf@email.com"
                  placeholderTextColor={COLORS.gray}
                  value={form.email}
                  onChangeText={(t) => updateField('email', t)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={[styles.inputRow, errors.phone && styles.inputError]}>
                <Ionicons name="call-outline" size={18} color={COLORS.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="09XXXXXXXXX"
                  placeholderTextColor={COLORS.gray}
                  value={form.phone}
                  onChangeText={(t) => updateField('phone', t)}
                  keyboardType="phone-pad"
                />
              </View>
              {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputRow, errors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="At least 8 characters"
                  placeholderTextColor={COLORS.gray}
                  value={form.password}
                  onChangeText={(t) => updateField('password', t)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={COLORS.gray} />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>

            {/* Confirm Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={[styles.inputRow, errors.confirmPassword && styles.inputError]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter your password"
                  placeholderTextColor={COLORS.gray}
                  value={form.confirmPassword}
                  onChangeText={(t) => updateField('confirmPassword', t)}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                  <Ionicons name={showConfirm ? 'eye-outline' : 'eye-off-outline'} size={18} color={COLORS.gray} />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
            </View>

            <View style={styles.hintBox}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.gray} />
              <Text style={styles.hintText}>Password must be at least 8 characters long.</Text>
            </View>

            <TouchableOpacity
              style={[styles.signupBtn, loading && styles.btnDisabled]}
              onPress={handleSignUp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.signupBtnText}>CREATE ACCOUNT</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.loginLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  backBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  headerText: { flex: 1 },
  appName: { fontSize: 14, fontWeight: '800', color: COLORS.red, letterSpacing: 3, marginBottom: 2 },
  pageTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white },
  pageSub: { fontSize: 13, color: COLORS.gray, marginTop: 1 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 24, borderWidth: 1, borderColor: COLORS.border,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.errorBg, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.red,
    padding: 12, marginBottom: 16, gap: 8,
  },
  errorBoxText: { color: COLORS.red, fontSize: 13, flex: 1 },
  nameRow: { flexDirection: 'row' },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.lightGray, marginBottom: 8, letterSpacing: 0.5 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 52,
  },
  inputError: { borderColor: COLORS.red },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: COLORS.white, fontSize: 15 },
  eyeBtn: { padding: 4 },
  errorText: { color: COLORS.red, fontSize: 12, marginTop: 5, marginLeft: 2 },
  hintBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A1A', borderRadius: 8,
    padding: 10, marginBottom: 20, gap: 6,
  },
  hintText: { color: COLORS.gray, fontSize: 12, flex: 1 },
  signupBtn: {
    backgroundColor: COLORS.red, borderRadius: 12, height: 54,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  btnDisabled: { opacity: 0.7 },
  signupBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  loginText: { color: COLORS.gray, fontSize: 14 },
  loginLink: { color: COLORS.red, fontSize: 14, fontWeight: '700' },
});