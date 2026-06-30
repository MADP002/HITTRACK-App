import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { auth, db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getRequiredReps } from '../../lib/trainingPrograms';
import { loadPoseModel, detectPoseFromPhoto } from '../../lib/poseDetection';
import { createDetector } from '../../lib/moveDetector';
import { playSuccessSound, speakEncouragement, ENCOURAGEMENT_PHRASES } from '../../lib/sounds';

import { C } from '../../lib/theme';

const CAPTURE_INTERVAL_MS = 60;    // floor between captures — real cadence is paced by device speed
const SAFETY_MAX_DURATION_SEC = 1800; // 30 min battery-safety net only, not a real workout timer
// FEEDBACK_PHRASES removed — now sourced from lib/sounds.js so the on-screen
// text and the spoken voice always say the exact same thing per rep.

export default function TrainingCameraScreen() {
  const router = useRouter();
  const { trainingId, level } = useLocalSearchParams();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [phase, setPhase]           = useState('loading'); // loading | ready | active | finishing
  const [training, setTraining]     = useState(null);
  const [requiredReps, setRequiredReps] = useState(0);
  const [reps, setReps]             = useState(0);
  const [elapsed, setElapsed]       = useState(0); // counts UP — no forced cutoff
  const [modelReady, setModelReady] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [facing, setFacing]         = useState('back');

  // Refs mirror state so the async capture loop never reads stale values
  const phaseRef        = useRef(phase);
  const requiredRepsRef = useRef(0);
  const trainingRef      = useRef(null);
  const repsRef          = useRef(0);
  const detectorRef      = useRef(null);
  const isProcessingRef  = useRef(false);
  const loopTimeoutRef   = useRef(null);
  const timerIntervalRef = useRef(null);
  const startTimeRef     = useRef(null);
  // trainingIdRef mirrors the route param so finishSession always has the
  // correct id even when called from inside a stale useCallback closure.
  // Without this, finishSession captured via runCaptureLoop's closure reads
  // the trainingId value from the render in which runCaptureLoop was created,
  // which can be undefined on first render before params are parsed.
  const trainingIdRef   = useRef(trainingId);
  // levelRef mirrors level for the same reason — finishSession passes it to
  // training-complete, and must always have the current value, not a stale one.
  const levelRef        = useRef(level);

  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { requiredRepsRef.current = requiredReps; }, [requiredReps]);
  useEffect(() => { trainingIdRef.current = trainingId; }, [trainingId]);
  useEffect(() => { levelRef.current = level; }, [level]);

  // ── Full reset every time this screen gains focus ─────────────────────
  // When the user exits mid-session and returns to the same training,
  // React Navigation reuses the existing screen instance instead of
  // remounting it — so the old frozen state (paused phase, stale elapsed
  // time, half-run capture loop) persists until something forces a reset.
  // useFocusEffect guarantees a clean slate every single visit.
  useFocusEffect(
    useCallback(() => {
      // Stop anything that might still be running
      phaseRef.current = 'loading';
      if (loopTimeoutRef.current)  { clearTimeout(loopTimeoutRef.current);   loopTimeoutRef.current  = null; }
      if (timerIntervalRef.current){ clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
      isProcessingRef.current = false;
      repsRef.current = 0;

      // Reset visible state — if training data is already loaded from a
      // previous visit, go straight to 'ready' so the user sees the
      // "Get In Position" screen immediately. If it's a fresh mount and
      // the data hasn't arrived yet, keep 'loading' so the fetch can run.
      // IMPORTANT: do NOT set trainingRef.current = null here. The useEffect
      // that populates trainingRef only re-runs when [trainingId, level] deps
      // change — on a second visit to the same training those deps are
      // identical, so the effect doesn't re-fire. Nulling the ref here leaves
      // trainingRef empty for the whole second session and causes finishSession
      // to pass trainingId=undefined, making completeTraining silently skip
      // marking the training as complete (findIndex returns -1).
      setPhase(trainingRef.current ? 'ready' : 'loading');
      setReps(0);
      setElapsed(0);
      setFeedbackText('');
      detectorRef.current?.reset();

      return () => {
        // Stop everything when the screen loses focus
        phaseRef.current = 'stopped';
        if (loopTimeoutRef.current)  { clearTimeout(loopTimeoutRef.current);   loopTimeoutRef.current  = null; }
        if (timerIntervalRef.current){ clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
      };
    }, [])
  );


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const [workSnap, userSnap] = await Promise.all([
          getDoc(doc(db, 'workouts', user.uid)),
          getDoc(doc(db, 'users', user.uid)),
        ]);
        const program = workSnap.exists() ? (workSnap.data().trainingProgram || []) : [];
        const found = program.find((t) => t.id === trainingId);
        const userStance = userSnap.exists() ? (userSnap.data().stance || 'Orthodox') : 'Orthodox';

        if (cancelled) return;
        if (!found) {
          Alert.alert('Training not found', 'Please go back and select a training again.', [
            { text: 'OK', onPress: () => router.back() },
          ]);
          return;
        }

        setTraining(found);
        trainingRef.current = found;
        const req = getRequiredReps(found, level);
        setRequiredReps(req);
        requiredRepsRef.current = req;
        detectorRef.current = createDetector(found, userStance);

        loadPoseModel()
          .then(() => { if (!cancelled) setModelReady(true); })
          .catch((e) => {
            console.error('[TrainingCamera] model load failed:', e);
            Alert.alert('Setup Error', 'Could not load the movement detection model. Please try again.');
          });

        setPhase('ready');
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Could not load this training session.');
      }
    })();
    return () => { cancelled = true; };
  }, [trainingId, level]);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // ── Visual feedback flash on a completed rep ─────────────────────────
  const triggerFeedback = useCallback((phrase) => {
    setFeedbackText(phrase);
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: true }).start();
  }, []);

  // ── Capture + detect loop (self-pacing — never overlaps itself) ──────
  const runCaptureLoop = useCallback(async () => {
    if (phaseRef.current !== 'active') return;
    if (isProcessingRef.current) {
      loopTimeoutRef.current = setTimeout(runCaptureLoop, CAPTURE_INTERVAL_MS);
      return;
    }
    isProcessingRef.current = true;
    try {
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.15, skipProcessing: true, base64: false, shutterSound: false,
        });
        const keypoints = await detectPoseFromPhoto(photo.uri);
        const repCompleted = detectorRef.current?.update(keypoints);
        if (repCompleted) {
          repsRef.current += 1;
          setReps(repsRef.current);
          const isLastRep = repsRef.current >= requiredRepsRef.current;

          // Feedback effects are wrapped individually and never allowed to
          // block session completion — if a sound call throws (e.g. a
          // native module not yet present in the current build), the rep
          // count and finish check must still proceed normally.
          const phrase = ENCOURAGEMENT_PHRASES[Math.floor(Math.random() * ENCOURAGEMENT_PHRASES.length)];
          try { triggerFeedback(phrase); } catch (e) { console.warn('[TrainingCamera] feedback flash error:', e); }
          try { playSuccessSound(); } catch (e) { console.warn('[TrainingCamera] chime error:', e); }
          try { speakEncouragement(phrase); } catch (e) { console.warn('[TrainingCamera] speech error:', e); }

          if (isLastRep) {
            isProcessingRef.current = false;
            finishSession('completed');
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[TrainingCamera] frame error:', e);
    }
    isProcessingRef.current = false;
    if (phaseRef.current === 'active') {
      loopTimeoutRef.current = setTimeout(runCaptureLoop, CAPTURE_INTERVAL_MS);
    }
  }, [triggerFeedback]);

  // ── Start the session ─────────────────────────────────────────────────
  const handleStart = () => {
    repsRef.current = 0;
    setReps(0);
    setElapsed(0);
    detectorRef.current?.reset();
    startTimeRef.current = Date.now();
    setPhase('active');
    phaseRef.current = 'active';

    timerIntervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= SAFETY_MAX_DURATION_SEC) {
          clearInterval(timerIntervalRef.current);
          finishSession('timeout');
        }
        return next;
      });
    }, 1000);

    loopTimeoutRef.current = setTimeout(runCaptureLoop, CAPTURE_INTERVAL_MS);
  };

  // ── Stop everything immediately — used by both finish and manual exit ──
  const stopLoopAndTimer = () => {
    phaseRef.current = 'stopped';
    if (loopTimeoutRef.current) { clearTimeout(loopTimeoutRef.current); loopTimeoutRef.current = null; }
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
  };

  // ── Finish and navigate to results ────────────────────────────────────
  const finishSession = (reason) => {
    stopLoopAndTimer();
    setPhase('finishing');

    const duration = startTimeRef.current
      ? Math.round((Date.now() - startTimeRef.current) / 1000)
      : 0;

    const summary = detectorRef.current?.getSessionSummary();

    // trainingIdRef.current is the most reliable source — it's set directly
    // from the route param and kept in sync via useEffect, so it's never
    // affected by stale closures in the async capture loop. trainingRef.current?.id
    // and the raw trainingId param are kept as fallbacks for safety.
    const resolvedTrainingId = trainingIdRef.current ?? trainingRef.current?.id ?? trainingId;
    const resolvedLevel      = levelRef.current ?? level;

    router.replace({
      pathname: '/(member)/training-complete',
      params: {
        trainingId: resolvedTrainingId,
        level:      resolvedLevel,
        properReps: repsRef.current,
        requiredReps: requiredRepsRef.current,
        duration,
        trainingName: trainingRef.current?.name,
        avgQualityPct:    summary?.avgQualityPct ?? '',
        paceRepsPerMin:   summary?.paceRepsPerMin ?? '',
        consistencyPct:   summary?.consistencyPct ?? '',
        bestStreak:       summary?.bestStreak ?? '',
      },
    });
  };

  const handleExit = () => {
    if (phase === 'active' && repsRef.current > 0) {
      Alert.alert(
        'Leave Training?',
        `You've done ${repsRef.current} rep${repsRef.current === 1 ? '' : 's'}. Save them to your results, or discard the session?`,
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => { stopLoopAndTimer(); router.replace('/(member)/training-lab'); } },
          { text: 'Finish & Save', onPress: () => finishSession('manual') },
        ]
      );
    } else {
      stopLoopAndTimer();
      router.replace('/(member)/training-lab');
    }
  };

  // ── Camera permission gate ─────────────────────────────────────────────
  if (!permission) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}>
          <Ionicons name="camera-outline" size={56} color={C.gray} />
          <Text style={s.permTitle}>Camera Access Needed</Text>
          <Text style={s.permBody}>
            HitTrack needs your camera to track your movements during training.
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={s.permBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: C.gray, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'loading' || !training) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.red} />
          <Text style={{ color: C.gray, marginTop: 12 }}>Loading training session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const fmtTime = (secs) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

  return (
    <View style={s.safe}>
      <CameraView ref={cameraRef} style={s.camera} facing={facing} animateShutter={false} />

      {/* ── READY overlay ── */}
      {phase === 'ready' && (
        <View style={s.readyOverlay}>
          <View style={s.readyCard}>
            <Text style={{ fontSize: 40 }}>📱</Text>
            <Text style={s.readyTitle}>Get In Position</Text>
            <Text style={s.readyBody}>{training.cameraDistance}</Text>
            <View style={s.readyReqRow}>
              <Ionicons name="repeat-outline" size={16} color={C.gold} />
              <Text style={s.readyReqText}>{requiredReps} proper reps to complete</Text>
            </View>
            <TouchableOpacity
              style={[s.startBtn, !modelReady && { opacity: 0.5 }]}
              onPress={handleStart}
              disabled={!modelReady}
              activeOpacity={0.85}
            >
              {modelReady ? (
                <>
                  <Ionicons name="play" size={20} color={C.white} />
                  <Text style={s.startBtnText}>Start Training</Text>
                </>
              ) : (
                <>
                  <ActivityIndicator size="small" color={C.white} />
                  <Text style={s.startBtnText}>Loading model...</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── ACTIVE HUD ── */}
      {phase === 'active' && (
        <>
          <View style={s.hudBottom}>
            <View style={s.repsCard}>
              <Text style={s.repsNum}>{reps}</Text>
              <Text style={s.repsSlash}>/</Text>
              <Text style={s.repsTarget}>{requiredReps}</Text>
              <Text style={s.repsLabel}>REPS</Text>
            </View>
          </View>

          {/* Green flash + feedback text on completed rep */}
          <Animated.View
            pointerEvents="none"
            style={[s.flashOverlay, { opacity: flashAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[s.feedbackTextWrap, { opacity: flashAnim }]}
          >
            <Text style={s.feedbackTextStyle}>{feedbackText}</Text>
          </Animated.View>
        </>
      )}

      {/* ── FINISHING ── */}
      {phase === 'finishing' && (
        <View style={s.readyOverlay}>
          <ActivityIndicator size="large" color={C.red} />
          <Text style={{ color: C.white, marginTop: 16, fontSize: 16, fontWeight: '700' }}>
            Saving your session...
          </Text>
        </View>
      )}

      {/* ── Top bar — rendered LAST so it always sits above any overlay and stays clickable ── */}
      <SafeAreaView edges={['top']} style={s.topBarWrap} pointerEvents="box-none">
        <View style={s.topBar}>
          <TouchableOpacity style={s.iconBtn} onPress={handleExit}>
            <Ionicons name="close" size={22} color={C.white} />
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>{training.name}</Text>
          {phase !== 'active' && (
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            >
              <Ionicons name="camera-reverse-outline" size={22} color={C.white} />
            </TouchableOpacity>
          )}
          {phase === 'active' && <View style={{ width: 38 }} />}
        </View>

        {/* Timer sits naturally below the title row — never overlaps regardless
            of device safe-area / notch size, since it flows in the same column. */}
        {phase === 'active' && (
          <View style={s.timerRow} pointerEvents="none">
            <View style={s.timerPill}>
              <Ionicons name="time-outline" size={14} color={C.white} />
              <Text style={s.timerText}>{fmtTime(elapsed)}</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  camera: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, paddingHorizontal: 30 },

  topBarWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10 },
  iconBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  topBarTitle:{ flex: 1, textAlign: 'center', color: C.white, fontSize: 15, fontWeight: '800' },

  // Permission screen
  permTitle: { fontSize: 18, fontWeight: '800', color: C.white, textAlign: 'center' },
  permBody:  { fontSize: 13, color: C.gray, textAlign: 'center', lineHeight: 20 },
  permBtn:   { backgroundColor: C.red, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  permBtnText:{ color: C.white, fontWeight: '800', fontSize: 14 },

  // Ready overlay
  readyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  readyCard:    { backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 26, alignItems: 'center', gap: 12, width: '100%' },
  readyTitle:   { fontSize: 20, fontWeight: '900', color: C.white },
  readyBody:    { fontSize: 13, color: C.gray, textAlign: 'center', lineHeight: 20 },
  readyReqRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.gold + '18', borderRadius: 50, paddingHorizontal: 14, paddingVertical: 8 },
  readyReqText: { fontSize: 12, color: C.gold, fontWeight: '700' },
  startBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.red, borderRadius: 14, height: 54, paddingHorizontal: 28, justifyContent: 'center', marginTop: 8, width: '100%' },
  startBtnText: { color: C.white, fontWeight: '800', fontSize: 15 },

  // Active HUD
  timerRow:  { alignItems: 'center', marginTop: 10 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 50, paddingHorizontal: 14, paddingVertical: 8 },
  timerText: { color: C.white, fontWeight: '800', fontSize: 14 },

  hudBottom: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  repsCard:  { flexDirection: 'row', alignItems: 'flex-end', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 14 },
  repsNum:   { fontSize: 42, fontWeight: '900', color: C.green, lineHeight: 44 },
  repsSlash: { fontSize: 24, color: C.gray, marginBottom: 4 },
  repsTarget:{ fontSize: 24, fontWeight: '800', color: C.white, marginBottom: 4 },
  repsLabel: { fontSize: 11, color: C.gray, fontWeight: '700', marginLeft: 8, marginBottom: 8, letterSpacing: 1 },

  flashOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.green },
  feedbackTextWrap: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' },
  feedbackTextStyle: { fontSize: 34, fontWeight: '900', color: C.white, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
});