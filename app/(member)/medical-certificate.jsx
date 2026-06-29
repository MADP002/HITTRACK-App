import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
   ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { auth, db } from '../../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

import { C } from '../../lib/theme';

export default function MedicalCertificateScreen() {
  const router = useRouter();

  const [injury,      setInjury]      = useState('');
  const [existing,    setExisting]    = useState(null); // existing cert data
  const [file,        setFile]        = useState(null); // { uri, name, type }
  const [preview,     setPreview]     = useState(null); // image preview uri
  const [uploading,   setUploading]   = useState(false);
  const [loading,     setLoading]     = useState(true);

  // Load user injury + any existing cert
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(s => {
      if (s.exists()) {
        const d = s.data();
        setInjury(d.injuries || '');
        if (d.medicalCert?.submitted) setExisting(d.medicalCert);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setFile({ uri: asset.uri, name: `cert_${Date.now()}.jpg`, type: 'image/jpeg' });
      setPreview(asset.uri);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setFile({ uri: asset.uri, name: asset.name, type: asset.mimeType });
      setPreview(asset.mimeType?.startsWith('image/') ? asset.uri : null);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      Alert.alert('No file selected', 'Please select your medical certificate first.');
      return;
    }
    setUploading(true);
    try {
      const user = auth.currentUser;

      // Read file as base64 data URI and store directly in Firestore
      // Works on Firebase free plan — no external storage service needed
      const base64 = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror  = reject;
          reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = () => reject(new Error('Failed to read file'));
        xhr.responseType = 'blob';
        xhr.open('GET', file.uri, true);
        xhr.send(null);
      });

      await updateDoc(doc(db, 'users', user.uid), {
        medicalCert: {
          submitted:   true,
          base64,
          fileName:    file.name,
          fileType:    file.type,
          submittedAt: serverTimestamp(),
        },
      });

      Alert.alert(
        '✅ Certificate Submitted',
        'Your medical certificate has been submitted. You may now proceed to training.',
        [{ text: 'Start Training', onPress: () => router.replace('/(member)/training-lab') }]
      );
    } catch (e) {
      console.error(e);
      Alert.alert('Upload failed', 'Could not upload your certificate. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleProceed = () => {
    router.replace('/(member)/training-lab');
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Medical Certificate</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.content}>

        {/* Icon */}
        <View style={s.iconBox}>
          <Text style={{ fontSize: 56 }}>🏥</Text>
        </View>

        {/* Message */}
        <Text style={s.title}>Medical Clearance Required</Text>
        <Text style={s.body}>
          Because of your reported injury or medical condition:
        </Text>
        <View style={s.injuryPill}>
          <Ionicons name="medical-outline" size={14} color={C.gold} />
          <Text style={s.injuryText}>{injury}</Text>
        </View>
        <Text style={s.body}>
          A <Text style={{ color: C.white, fontWeight: '700' }}>medical certificate</Text> is required to be submitted before proceeding to training. This ensures your safety during exercise.
        </Text>

        {/* Already submitted */}
        {existing ? (
          <View style={s.existingCard}>
            <View style={s.existingTop}>
              <View style={s.existingIcon}>
                <Ionicons name="checkmark-circle" size={24} color={C.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.existingTitle}>Certificate Submitted</Text>
                <Text style={s.existingFile} numberOfLines={1}>{existing.fileName}</Text>
              </View>
            </View>
            <TouchableOpacity style={s.proceedBtn} onPress={handleProceed} activeOpacity={0.85}>
              <Text style={s.proceedBtnText}>Proceed to Training →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.resubmitBtn} onPress={() => setExisting(null)}>
              <Text style={s.resubmitBtnText}>Submit a new certificate</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Upload section */
          <View style={s.uploadSection}>
            {/* Preview */}
            {preview && (
              <View style={s.previewBox}>
                <Image source={{ uri: preview }} style={s.previewImage} resizeMode="contain" />
                <TouchableOpacity style={s.removePreview} onPress={() => { setFile(null); setPreview(null); }}>
                  <Ionicons name="close-circle" size={22} color={C.red} />
                </TouchableOpacity>
              </View>
            )}
            {file && !preview && (
              <View style={s.fileCard}>
                <Ionicons name="document-outline" size={28} color={C.blue} />
                <Text style={s.fileName} numberOfLines={1}>{file.name}</Text>
                <TouchableOpacity onPress={() => { setFile(null); setPreview(null); }}>
                  <Ionicons name="close-circle" size={20} color={C.red} />
                </TouchableOpacity>
              </View>
            )}

            {/* Pick buttons */}
            {!file && (
              <View style={s.pickRow}>
                <TouchableOpacity style={s.pickBtn} onPress={pickImage} activeOpacity={0.8}>
                  <Ionicons name="image-outline" size={24} color={C.gold} />
                  <Text style={s.pickBtnText}>Photo / Image</Text>
                  <Text style={s.pickBtnSub}>JPG, PNG</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pickBtn} onPress={pickDocument} activeOpacity={0.8}>
                  <Ionicons name="document-text-outline" size={24} color={C.blue} />
                  <Text style={s.pickBtnText}>Document</Text>
                  <Text style={s.pickBtnSub}>PDF or image</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Submit button */}
            <TouchableOpacity
              style={[s.submitBtn, (!file || uploading) && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={!file || uploading}
              activeOpacity={0.85}
            >
              {uploading
                ? <ActivityIndicator color={C.white} />
                : <>
                    <Ionicons name="cloud-upload-outline" size={18} color={C.white} />
                    <Text style={s.submitBtnText}>Submit Certificate</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white },

  content: { flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 16 },
  iconBox: { alignItems: 'center', marginBottom: 8 },
  title:   { fontSize: 22, fontWeight: '900', color: C.white, textAlign: 'center' },
  body:    { fontSize: 14, color: C.gray, lineHeight: 22, textAlign: 'center' },

  injuryPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.gold + '18', borderRadius: 50, borderWidth: 1, borderColor: C.gold + '44', paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'center' },
  injuryText: { fontSize: 13, color: C.gold, fontWeight: '700' },

  // Existing cert
  existingCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.green + '44', padding: 18, gap: 14 },
  existingTop:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  existingIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.green + '18', justifyContent: 'center', alignItems: 'center' },
  existingTitle:{ fontSize: 15, fontWeight: '800', color: C.white },
  existingFile: { fontSize: 12, color: C.gray, marginTop: 2 },
  proceedBtn:   { backgroundColor: C.green, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  proceedBtnText:{ color: '#000', fontSize: 15, fontWeight: '800' },
  resubmitBtn:  { alignItems: 'center', paddingVertical: 4 },
  resubmitBtnText: { fontSize: 12, color: C.gray },

  // Upload
  uploadSection: { gap: 14 },
  previewBox:    { position: 'relative', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, height: 180 },
  previewImage:  { width: '100%', height: '100%' },
  removePreview: { position: 'absolute', top: 8, right: 8 },
  fileCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.blue + '44', padding: 14 },
  fileName:      { flex: 1, fontSize: 13, color: C.white, fontWeight: '600' },

  pickRow:  { flexDirection: 'row', gap: 12 },
  pickBtn:  { flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20, alignItems: 'center', gap: 8 },
  pickBtnText: { fontSize: 13, fontWeight: '700', color: C.white, textAlign: 'center' },
  pickBtnSub:  { fontSize: 10, color: C.gray, textAlign: 'center' },

  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.red, borderRadius: 12, height: 54, shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  submitBtnText: { color: C.white, fontSize: 15, fontWeight: '800' },
});