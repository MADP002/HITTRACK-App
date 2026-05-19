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
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!email.trim()) newErrors.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email.';
    if (!password) newErrors.password = 'Password is required.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      // Step 1: Sign in with Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // Step 2: Get the user's document from Firestore using their uid
      const userDoc = await getDoc(doc(db, 'users', uid));

      if (!userDoc.exists()) {
        setErrors({ general: 'Account not found. Please contact support.' });
        setLoading(false);
        return;
      }

      const userData = userDoc.data();

      // Step 3: Check if account is disabled by admin
      if (userData.disabled === true) {
        setErrors({ general: 'Your account has been disabled. Please contact the admin.' });
        setLoading(false);
        return;
      }

      // Step 4: Route to correct interface based on role field in Firestore
      const role = userData.role;

      if (role === 'member') {
        router.replace('/(member)/home');
      } else if (role === 'coach') {
        router.replace('/(coach)/home');
      } else if (role === 'admin') {
        router.replace('/(admin)/overview');
      } else {
        setErrors({ general: 'Unknown account type. Please contact support.' });
      }

    } catch (error) {
      let message = 'Login failed. Please try again.';

      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          message = 'Incorrect email or password.';
          break;
        case 'auth/user-disabled':
          message = 'Your account has been disabled. Please contact the admin.';
          break;
        case 'auth/too-many-requests':
          message = 'Too many failed attempts. Please try again later.';
          break;
        case 'auth/network-request-failed':
          message = 'No internet connection. Please check your network.';
          break;
        default:
          message = 'Login failed. Please try again.';
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
          {/* ── LOGO / HEADER ── */}
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Text style={styles.logoGlove}>🥊</Text>
            </View>
            <Text style={styles.appName}>HITTRACK</Text>
            <Text style={styles.tagline}>Train Smarter. Hit Harder.</Text>
          </View>

          {/* ── FORM CARD ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back</Text>
            <Text style={styles.cardSub}>Log in to your account</Text>

            {/* General Error Banner */}
            {errors.general && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.red} />
                <Text style={styles.errorBoxText}>{errors.general}</Text>
              </View>
            )}

            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputRow, errors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={18} color={COLORS.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={COLORS.gray}
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    setErrors((e) => ({ ...e, email: null, general: null }));
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputRow, errors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.gray} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.gray}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    setErrors((e) => ({ ...e, password: null, general: null }));
                  }}
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

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.loginBtnText}>LOG IN</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── SIGN UP LINK ── */}
          <View style={styles.signupRow}>
            <Text style={styles.signupText}>New member? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
              <Text style={styles.signupLink}>Create an Account</Text>
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
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: { alignItems: 'center', marginBottom: 36 },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.red,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  logoGlove: { fontSize: 38 },
  appName: { fontSize: 32, fontWeight: '900', color: COLORS.white, letterSpacing: 6 },
  tagline: { fontSize: 13, color: COLORS.gray, marginTop: 4, letterSpacing: 1.5 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: COLORS.white, marginBottom: 4 },
  cardSub: { fontSize: 14, color: COLORS.gray, marginBottom: 24 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.red,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorBoxText: { color: COLORS.red, fontSize: 13, flex: 1 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.lightGray, marginBottom: 8, letterSpacing: 0.5 },
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
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 24, marginTop: -4 },
  forgotText: { color: COLORS.red, fontSize: 13, fontWeight: '600' },
  loginBtn: {
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
  loginBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  signupText: { color: COLORS.gray, fontSize: 14 },
  signupLink: { color: COLORS.red, fontSize: 14, fontWeight: '700' },
});