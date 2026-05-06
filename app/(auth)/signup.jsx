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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  bg: '#0A0A0A',
  card: '#161616',
  border: '#2A2A2A',
  red: '#E63946',
  white: '#FFFFFF',
  gray: '#888888',
  lightGray: '#CCCCCC',
  inputBg: '#1E1E1E',
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
    setErrors((prev) => ({ ...prev, [field]: null }));
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

    // ── TODO: Replace with your real API call ──────────────────────────────
    // const response = await axios.post(`${API_URL}/api/auth/register`, {
    //   firstName: form.firstName,
    //   lastName: form.lastName,
    //   email: form.email,
    //   phone: form.phone,
    //   password: form.password,
    //   role: 'member',
    // });
    // router.replace('/(auth)/login');
    // ──────────────────────────────────────────────────────────────────────

    setTimeout(() => {
      setLoading(false);
      Alert.alert(
        'Account Created!',
        `Welcome, ${form.firstName}!\n\nYour member account has been created.\n(Connect your backend to save this data)`,
        [{ text: 'Go to Login', onPress: () => router.replace('/(auth)/login') }]
      );
    }, 1400);
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

            {/* First Name + Last Name Row */}
            <View style={styles.nameRow}>
              <View style={[styles.fieldGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>First Name</Text>
                <View style={[styles.inputRow, errors.firstName && styles.inputError]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Juan"
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
                  placeholder="juandelacruz@email.com"
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
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={18}
                    color={COLORS.gray}
                  />
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
                  <Ionicons
                    name={showConfirm ? 'eye-outline' : 'eye-off-outline'}
                    size={18}
                    color={COLORS.gray}
                  />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && (
                <Text style={styles.errorText}>{errors.confirmPassword}</Text>
              )}
            </View>

            {/* Hint */}
            <View style={styles.hintBox}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.gray} />
              <Text style={styles.hintText}>
                Password must be at least 8 characters long.
              </Text>
            </View>

            {/* Sign Up Button */}
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

          {/* ── LOGIN LINK ── */}
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
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  headerText: { flex: 1 },
  appName: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.red,
    letterSpacing: 3,
    marginBottom: 2,
  },
  pageTitle: { fontSize: 22, fontWeight: '900', color: COLORS.white },
  pageSub: { fontSize: 13, color: COLORS.gray, marginTop: 1 },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Name Row
  nameRow: { flexDirection: 'row' },

  // Fields
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.lightGray,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    height: 52,
  },
  inputError: { borderColor: COLORS.red },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: COLORS.white, fontSize: 15 },
  eyeBtn: { padding: 4 },
  errorText: { color: COLORS.red, fontSize: 12, marginTop: 5, marginLeft: 2 },

  // Hint
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    gap: 6,
  },
  hintText: { color: COLORS.gray, fontSize: 12, flex: 1 },

  // Sign Up Button
  signupBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 12,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  btnDisabled: { opacity: 0.7 },
  signupBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // Login Row
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  loginText: { color: COLORS.gray, fontSize: 14 },
  loginLink: { color: COLORS.red, fontSize: 14, fontWeight: '700' },
});