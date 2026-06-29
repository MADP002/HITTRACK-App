import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

import { C } from '../../lib/theme';

export default function LoginScreen() {
  const router = useRouter();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [errors,       setErrors]       = useState({});

  // Forgot password state
  const [showForgot,    setShowForgot]    = useState(false);
  const [resetEmail,    setResetEmail]    = useState('');
  const [resetSent,     setResetSent]     = useState(false);
  const [resetLoading,  setResetLoading]  = useState(false);
  const [resetError,    setResetError]    = useState('');

  const validate = () => {
    const e = {};
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email.';
    if (!password) e.password = 'Password is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const cred    = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid     = cred.user.uid;
      const userDoc = await getDoc(doc(db, 'users', uid));

      if (!userDoc.exists()) {
        setErrors({ general: 'Account not found. Please contact support.' });
        setLoading(false);
        return;
      }

      const data = userDoc.data();

      // Disabled account
      if (data.disabled === true || data.status === 'inactive') {
        await signOut(auth);
        setErrors({ general: 'Your account has been disabled. Please contact the admin.' });
        setLoading(false);
        return;
      }

      const role = data.role;

      // Coach pending approval
      if (role === 'coach_pending') {
        await signOut(auth);
        setErrors({ general: 'Your coach account is pending admin approval. You will be notified once approved.' });
        setLoading(false);
        return;
      }

      // Coach rejected
      if (role === 'coach_rejected') {
        await signOut(auth);
        setErrors({ general: 'Your coach application was not approved. Please contact the gym for more information.' });
        setLoading(false);
        return;
      }

      // Route based on role
      if (role === 'member') {
        if (!data.programSetupDone) {
          router.replace({ pathname: '/(auth)/program-builder', params: { name: data.name || '' } });
        } else {
          router.replace('/(member)/home');
        }
      } else if (role === 'coach') {
        router.replace('/(coach)/home');
      } else if (role === 'admin') {
        router.replace('/(admin)/overview');
      } else {
        setErrors({ general: 'Unknown account type. Please contact support.' });
      }

    } catch (error) {
      let msg = 'Login failed. Please try again.';
      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          msg = 'Incorrect email or password.'; break;
        case 'auth/user-disabled':
          msg = 'Your account has been disabled. Please contact the admin.'; break;
        case 'auth/too-many-requests':
          msg = 'Too many failed attempts. Please try again later.'; break;
        case 'auth/network-request-failed':
          msg = 'No internet connection. Please check your network.'; break;
        default:
          msg = 'Login failed. Please try again.';
      }
      setErrors({ general: msg });
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password ────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) { setResetError('Please enter your email address.'); return; }
    if (!/\S+@\S+\.\S+/.test(resetEmail)) { setResetError('Enter a valid email address.'); return; }
    setResetLoading(true);
    setResetError('');
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetSent(true);
    } catch (e) {
      if (e.code === 'auth/user-not-found') setResetError('No account found with that email address.');
      else if (e.code === 'auth/network-request-failed') setResetError('No internet connection.');
      else setResetError('Could not send reset email. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const closeForgot = () => {
    setShowForgot(false);
    setResetEmail('');
    setResetSent(false);
    setResetError('');
  };

  return (
    <SafeAreaView style={s.safe}>

      {/* ── FORGOT PASSWORD MODAL ── */}
      <Modal visible={showForgot} transparent animationType="slide" onRequestClose={closeForgot}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>🔑 Reset Password</Text>
              <TouchableOpacity onPress={closeForgot}>
                <Ionicons name="close" size={22} color={C.gray} />
              </TouchableOpacity>
            </View>

            {!resetSent ? (
              <>
                <Text style={s.modalSub}>
                  Enter your email address and we'll send you a link to reset your password.
                </Text>

                {resetError ? (
                  <View style={s.resetErrorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color={C.red} />
                    <Text style={s.resetErrorText}>{resetError}</Text>
                  </View>
                ) : null}

                <View style={[s.inputRow, { marginTop: 16, marginBottom: 20 }, resetError && s.inputError]}>
                  <Ionicons name="mail-outline" size={18} color={C.gray} style={{ marginRight: 10 }} />
                  <TextInput
                    style={s.input}
                    placeholder="Enter your email"
                    placeholderTextColor={C.gray}
                    value={resetEmail}
                    onChangeText={t => { setResetEmail(t); setResetError(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[s.resetBtn, resetLoading && { opacity: 0.6 }]}
                  onPress={handleForgotPassword}
                  disabled={resetLoading}
                  activeOpacity={0.85}
                >
                  {resetLoading
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={s.resetBtnText}>Send Reset Link</Text>
                  }
                </TouchableOpacity>
              </>
            ) : (
              /* Success state */
              <View style={s.resetSuccess}>
                <Text style={s.resetSuccessIcon}>✅</Text>
                <Text style={s.resetSuccessTitle}>Email Sent!</Text>
                <Text style={s.resetSuccessText}>
                  A password reset link has been sent to{'\n'}
                  <Text style={{ color: C.white, fontWeight: '700' }}>{resetEmail}</Text>.{'\n\n'}
                  Check your inbox and follow the link to reset your password.
                </Text>
                <TouchableOpacity style={s.resetDoneBtn} onPress={closeForgot}>
                  <Text style={s.resetDoneBtnText}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MAIN LOGIN FORM ── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={s.header}>
            <View style={s.logoBox}>
              <Text style={s.logoGlove}>🥊</Text>
            </View>
            <Text style={s.appName}>HITTRACK</Text>
            <Text style={s.tagline}>Train Smarter. Hit Harder.</Text>
          </View>

          {/* Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Welcome Back</Text>
            <Text style={s.cardSub}>Log in to your account</Text>

            {errors.general && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={C.red} />
                <Text style={s.errorBoxText}>{errors.general}</Text>
              </View>
            )}

            {/* Email */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Email</Text>
              <View style={[s.inputRow, errors.email && s.inputError]}>
                <Ionicons name="mail-outline" size={18} color={C.gray} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Enter your email"
                  placeholderTextColor={C.gray}
                  value={email}
                  onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: null, general: null })); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && <Text style={s.errorText}>{errors.email}</Text>}
            </View>

            {/* Password */}
            <View style={s.fieldGroup}>
              <View style={s.labelRow}>
                <Text style={s.label}>Password</Text>
                <TouchableOpacity onPress={() => setShowForgot(true)}>
                  <Text style={s.forgotLink}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.inputRow, errors.password && s.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color={C.gray} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Enter your password"
                  placeholderTextColor={C.gray}
                  value={password}
                  onChangeText={t => { setPassword(t); setErrors(e => ({ ...e, password: null, general: null })); }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.gray} />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={s.errorText}>{errors.password}</Text>}
            </View>

            {/* Login button */}
            <TouchableOpacity
              style={[s.loginBtn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.loginBtnText}>LOG IN</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Sign up link */}
          <View style={s.signupRow}>
            <Text style={s.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
              <Text style={s.signupLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 40 },

  // Header
  header:    { alignItems: 'center', marginBottom: 36 },
  logoBox:   { width: 80, height: 80, borderRadius: 24, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 14, shadowColor: C.red, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  logoGlove: { fontSize: 38 },
  appName:   { fontSize: 28, fontWeight: '900', color: C.white, letterSpacing: 4, marginBottom: 4 },
  tagline:   { fontSize: 13, color: C.gray, letterSpacing: 1 },

  // Card
  card:     { backgroundColor: C.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: C.border },
  cardTitle:{ fontSize: 22, fontWeight: '900', color: C.white, marginBottom: 4 },
  cardSub:  { fontSize: 13, color: C.gray, marginBottom: 24 },

  // Error
  errorBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.errorBg, borderRadius: 10, borderWidth: 1, borderColor: C.red, padding: 12, marginBottom: 16, gap: 8 },
  errorBoxText: { color: C.red, fontSize: 13, flex: 1, lineHeight: 18 },
  errorText:    { color: C.red, fontSize: 12, marginTop: 5 },

  // Fields
  fieldGroup: { marginBottom: 16 },
  labelRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label:      { fontSize: 13, fontWeight: '600', color: C.lightGray, letterSpacing: 0.5 },
  forgotLink: { fontSize: 12, color: C.red, fontWeight: '700' },
  inputRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 52 },
  inputError: { borderColor: C.red },
  inputIcon:  { marginRight: 10 },
  input:      { flex: 1, color: C.white, fontSize: 15 },
  eyeBtn:     { padding: 4 },

  // Login button
  loginBtn:     { backgroundColor: C.red, borderRadius: 12, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 8, shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  loginBtnText: { color: C.white, fontSize: 16, fontWeight: '800', letterSpacing: 2 },

  // Sign up link
  signupRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  signupText: { color: C.gray, fontSize: 14 },
  signupLink: { color: C.red, fontSize: 14, fontWeight: '700' },

  // Forgot password modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: C.border },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 18, fontWeight: '900', color: C.white },
  modalSub:     { fontSize: 13, color: C.gray, lineHeight: 20 },

  resetErrorBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.errorBg, borderRadius: 10, borderWidth: 1, borderColor: C.red, padding: 10, marginTop: 12 },
  resetErrorText: { color: C.red, fontSize: 12, flex: 1 },

  resetBtn:     { backgroundColor: C.red, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center' },
  resetBtnText: { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 1 },

  resetSuccess:      { alignItems: 'center', gap: 12, paddingVertical: 16 },
  resetSuccessIcon:  { fontSize: 48 },
  resetSuccessTitle: { fontSize: 20, fontWeight: '900', color: C.white },
  resetSuccessText:  { fontSize: 13, color: C.gray, textAlign: 'center', lineHeight: 22 },
  resetDoneBtn:      { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, height: 50, paddingHorizontal: 32, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  resetDoneBtnText:  { color: C.white, fontSize: 14, fontWeight: '700' },
});