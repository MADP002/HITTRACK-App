import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator,
  Animated, Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';

const { width } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', redDark: '#C1121F',
  white: '#FFFFFF', gray: '#888888', lightGray: '#CCCCCC',
  inputBg: '#1E1E1E', green: '#4ade80', errorBg: '#2A1215',
};

// ── CONSTANTS (mirrors web version) ──────────────────────────────────────────

const STEPS = [
  { id: 'basic',  title: 'Basic Info',   icon: 'person-outline',    desc: 'Tell us who you are' },
  { id: 'body',   title: 'Body Stats',   icon: 'body-outline',      desc: 'We calculate your BMI' },
  { id: 'boxing', title: 'Boxing Style', icon: 'fitness-outline',   desc: 'Your stance & experience' },
  { id: 'goals',  title: 'Your Goals',   icon: 'trophy-outline',    desc: 'What you want to achieve' },
];

const STANCES = [
  { id: 'Orthodox', emoji: '🥊', desc: 'Left foot forward, right hand power punch' },
  { id: 'Southpaw', emoji: '🥊', desc: 'Right foot forward, left hand power punch' },
];

const EXPERIENCES = [
  { id: 'Beginner',     icon: '🌱', desc: 'New to boxing, just starting out' },
  { id: 'Intermediate', icon: '⚡', desc: 'Know the basics, ready to level up' },
  { id: 'Advanced',     icon: '🔥', desc: 'Experienced, training to compete' },
];

const GOALS = [
  { id: 'Lose Weight',    icon: '⚡', desc: 'Burn fat through boxing cardio and drills' },
  { id: 'Build Strength', icon: '💪', desc: 'Increase power and muscle through training' },
  { id: 'Learn Boxing',   icon: '🥊', desc: 'Master techniques and fundamentals' },
  { id: 'Compete',        icon: '🏆', desc: 'Train to fight in amateur competitions' },
];

const DAYS = [1, 2, 3, 4, 5, 6, 7];

const PROGRAMS = {
  Beginner: {
    'Lose Weight':    ['Jump Rope Cardio', 'Shadow Boxing', 'Heavy Bag HIIT', 'Core Conditioning', 'Footwork Drills'],
    'Build Strength': ['Heavy Bag Basics', 'Bodyweight Circuit', 'Jab Power Drills', 'Core & Back Work', 'Stance Training'],
    'Learn Boxing':   ['Jab Fundamentals', 'Cross Technique', 'Footwork Basics', 'Guard & Defense', 'Jab-Cross Combos'],
    'Compete':        ['Basic Sparring Prep', 'Combo Basics', 'Stamina Building', 'Defense Fundamentals', 'Speed Drills'],
  },
  Intermediate: {
    'Lose Weight':    ['HIIT Bag Work', 'Cardio Combos', 'Speed Shadow Boxing', 'Interval Training', 'Endurance Circuits'],
    'Build Strength': ['Power Punching', 'Heavy Bag Rounds', 'Resistance Training', 'Core Power', 'Explosive Combos'],
    'Learn Boxing':   ['Advanced Combinations', 'Counter Punching', 'Slips & Rolls', 'Mitt Work', 'Sparring Drills'],
    'Compete':        ['Sparring Sessions', 'Competition Combos', 'Speed & Reaction', 'Ring Strategy', 'Pressure Fighting'],
  },
  Advanced: {
    'Lose Weight':    ['Elite HIIT Circuit', 'Full Cardio Rounds', 'Explosive Bag Work', 'Advanced Footwork', 'Competition Pace'],
    'Build Strength': ['Max Power Rounds', 'Resistance Bag Work', 'Elite Core Circuit', 'Explosive Training', 'Peak Strength'],
    'Learn Boxing':   ['Advanced Defense', 'Complex Combinations', 'Tactical Sparring', 'Elite Mitt Work', 'Match Simulation'],
    'Compete':        ['Full Sparring', 'Competition Strategy', 'Elite Conditioning', 'Fight Simulation', 'Peak Performance'],
  },
};

// ── BMI HELPER ────────────────────────────────────────────────────────────────
function calcBMI(height, weight) {
  if (!height || !weight) return null;
  return (parseFloat(weight) / ((parseFloat(height) / 100) ** 2)).toFixed(1);
}
function bmiLabel(bmi) {
  if (!bmi) return '';
  return bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
}
function bmiColor(bmi) {
  if (!bmi) return COLORS.gray;
  return bmi < 18.5 ? '#42a5f5' : bmi < 25 ? COLORS.green : bmi < 30 ? '#f5c842' : COLORS.red;
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function ProgramBuilder() {
  const router = useRouter();
  const { name: passedName } = useLocalSearchParams();

  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: passedName || '',
    nickname: '',
    age: '',
    height: '',
    weight: '',
    stance: '',
    experience: '',
    goal: '',
    daysPerWeek: 3,
    injuries: '',
  });

  const bmi = calcBMI(form.height, form.weight);
  const label = bmiLabel(bmi);
  const color = bmiColor(bmi);

  const update = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const validate = () => {
    const e = {};
    if (step === 0) {
      if (!form.name.trim()) e.name = 'Name is required.';
      if (!form.age) e.age = 'Age is required.';
      else if (isNaN(form.age) || parseInt(form.age) < 10 || parseInt(form.age) > 80)
        e.age = 'Enter a valid age (10–80).';
    }
    if (step === 1) {
      if (!form.height) e.height = 'Height is required.';
      if (!form.weight) e.weight = 'Weight is required.';
    }
    if (step === 2) {
      if (!form.stance) e.stance = 'Please select your stance.';
      if (!form.experience) e.experience = 'Please select your experience level.';
    }
    if (step === 3) {
      if (!form.goal) e.goal = 'Please select your goal.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = async () => {
    if (!validate()) return;
    if (step < 3) { setStep((s) => s + 1); return; }

    // Final step — generate and save
    setGenerating(true);

    const weeklyProgram = PROGRAMS[form.experience]?.[form.goal] || PROGRAMS['Beginner']['Learn Boxing'];

    const profile = {
      name:               form.name.trim(),
      nickname:           form.nickname.trim(),
      age:                parseInt(form.age),
      height:             parseFloat(form.height),
      weight:             parseFloat(form.weight),
      bmi:                parseFloat(bmi),
      bmiLabel:           label,
      stance:             form.stance,
      experience:         form.experience,
      currentLevel:       form.experience,
      goal:               form.goal,
      daysPerWeek:        form.daysPerWeek,
      injuries:           form.injuries ? [form.injuries] : [],
      programSetupDone:   true,
      programGeneratedAt: new Date().toISOString(),
      weeklyProgram,
      updatedAt:          serverTimestamp(),
    };

    try {
      const user = auth.currentUser;
      if (user) {
        // Save full profile to Firestore
        await setDoc(doc(db, 'users', user.uid), profile, { merge: true });

        // Create initial stats doc so member appears on leaderboard
        await setDoc(doc(db, 'stats', user.uid), {
          uid:           user.uid,
          name:          profile.name,
          goal:          profile.goal,
          experience:    profile.experience,
          currentLevel:  profile.experience,
          totalWorkouts: 0,
          streak:        0,
          weeklyPct:     0,
          updatedAt:     new Date().toISOString(),
        }, { merge: true });
      }
    } catch (err) {
      console.warn('Firestore save warning:', err.message);
    }

    // Show generating animation then done screen
    setTimeout(() => {
      setGenerating(false);
      setDone(true);
    }, 3000);
  };

  if (generating) return <GeneratingScreen form={form} />;
  if (done) return <DoneScreen form={form} bmi={bmi} bmiLabel={label} bmiColor={color} router={router} />;

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── STEP INDICATOR ── */}
      <View style={styles.stepBar}>
        {STEPS.map((st, i) => (
          <React.Fragment key={i}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                i < step && styles.stepDotDone,
                i === step && styles.stepDotActive,
              ]}>
                {i < step
                  ? <Ionicons name="checkmark" size={16} color={COLORS.white} />
                  : <Ionicons name={st.icon} size={16} color={i === step ? COLORS.red : COLORS.gray} />
                }
              </View>
              <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>
                {st.title}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, i < step && styles.stepLineDone]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── STEP HEADER ── */}
        <View style={styles.stepHeader}>
          <View style={styles.stepIconBox}>
            <Ionicons name={STEPS[step].icon} size={24} color={COLORS.red} />
          </View>
          <View>
            <Text style={styles.stepTitle}>{STEPS[step].title}</Text>
            <Text style={styles.stepDesc}>{STEPS[step].desc}</Text>
          </View>
        </View>

        {/* ── STEP CONTENT ── */}
        <View style={styles.card}>
          {step === 0 && <StepBasic form={form} update={update} errors={errors} />}
          {step === 1 && <StepBody  form={form} update={update} errors={errors} bmi={bmi} bmiLabel={label} bmiColor={color} />}
          {step === 2 && <StepStyle form={form} update={update} errors={errors} />}
          {step === 3 && <StepGoals form={form} update={update} errors={errors} />}
        </View>

        {/* ── NAV BUTTONS ── */}
        <View style={styles.navRow}>
          {step > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep((s) => s - 1)}>
              <Ionicons name="arrow-back" size={18} color={COLORS.gray} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          ) : <View style={{ flex: 1 }} />}

          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>
              {step === 3 ? '🚀  Generate My Program' : 'Next'}
            </Text>
            {step < 3 && <Ionicons name="arrow-forward" size={18} color={COLORS.white} />}
          </TouchableOpacity>
        </View>

        <Text style={styles.stepCounter}>Step {step + 1} of {STEPS.length}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── STEP 1: BASIC INFO ────────────────────────────────────────────────────────
function StepBasic({ form, update, errors }) {
  return (
    <View style={styles.stepContent}>
      <FormField label="Full Name *" error={errors.name}>
        <TextInput
          style={styles.input}
          placeholder="e.g. Juan Dela Cruz"
          placeholderTextColor={COLORS.gray}
          value={form.name}
          onChangeText={(t) => update('name', t)}
          autoCapitalize="words"
        />
      </FormField>
      <FormField label="Nickname (optional)">
        <TextInput
          style={styles.input}
          placeholder="e.g. JD"
          placeholderTextColor={COLORS.gray}
          value={form.nickname}
          onChangeText={(t) => update('nickname', t)}
          autoCapitalize="words"
        />
      </FormField>
      <FormField label="Age *" error={errors.age}>
        <TextInput
          style={styles.input}
          placeholder="e.g. 22"
          placeholderTextColor={COLORS.gray}
          value={form.age}
          onChangeText={(t) => update('age', t)}
          keyboardType="number-pad"
        />
      </FormField>
    </View>
  );
}

// ── STEP 2: BODY STATS ────────────────────────────────────────────────────────
function StepBody({ form, update, errors, bmi, bmiLabel, bmiColor }) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.twoCol}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <FormField label="Height (cm) *" error={errors.height}>
            <TextInput
              style={styles.input}
              placeholder="e.g. 170"
              placeholderTextColor={COLORS.gray}
              value={form.height}
              onChangeText={(t) => update('height', t)}
              keyboardType="decimal-pad"
            />
          </FormField>
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="Weight (kg) *" error={errors.weight}>
            <TextInput
              style={styles.input}
              placeholder="e.g. 65"
              placeholderTextColor={COLORS.gray}
              value={form.weight}
              onChangeText={(t) => update('weight', t)}
              keyboardType="decimal-pad"
            />
          </FormField>
        </View>
      </View>

      {/* BMI Display */}
      {bmi && (
        <View style={[styles.bmiCard, { borderColor: bmiColor + '66' }]}>
          <View style={styles.bmiRow}>
            <View>
              <Text style={styles.bmiSmallLabel}>YOUR BMI</Text>
              <Text style={[styles.bmiValue, { color: bmiColor }]}>{bmi}</Text>
              <View style={[styles.bmiTag, { backgroundColor: bmiColor + '22', borderColor: bmiColor + '44' }]}>
                <Text style={[styles.bmiTagText, { color: bmiColor }]}>{bmiLabel}</Text>
              </View>
            </View>
            <View style={styles.bmiBarContainer}>
              <View style={styles.bmiBarBg}>
                <View style={[styles.bmiBarFill, {
                  backgroundColor: bmiColor,
                  width: `${Math.min((parseFloat(bmi) / 40) * 100, 100)}%`,
                }]} />
              </View>
              <View style={styles.bmiBarLabels}>
                {['Under', 'Normal', 'Over', 'Obese'].map((l) => (
                  <Text key={l} style={styles.bmiBarLabel}>{l}</Text>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      <FormField label="Injuries or medical conditions? (optional)">
        <TextInput
          style={styles.input}
          placeholder="e.g. knee injury, asthma — leave blank if none"
          placeholderTextColor={COLORS.gray}
          value={form.injuries}
          onChangeText={(t) => update('injuries', t)}
          autoCapitalize="sentences"
        />
      </FormField>
    </View>
  );
}

// ── STEP 3: BOXING STYLE ──────────────────────────────────────────────────────
function StepStyle({ form, update, errors }) {
  return (
    <View style={styles.stepContent}>
      {/* Stance */}
      <View>
        <Text style={styles.groupLabel}>Boxing Stance *</Text>
        {errors.stance && <Text style={styles.groupError}>{errors.stance}</Text>}
        <View style={styles.twoCol}>
          {STANCES.map((st) => (
            <TouchableOpacity
              key={st.id}
              style={[styles.selectCard, form.stance === st.id && styles.selectCardActive, { flex: 1, marginHorizontal: 4 }]}
              onPress={() => update('stance', st.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.selectCardEmoji}>{st.emoji}</Text>
              <Text style={styles.selectCardTitle}>{st.id}</Text>
              <Text style={styles.selectCardDesc}>{st.desc}</Text>
              {form.stance === st.id && (
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={12} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Experience */}
      <View style={{ marginTop: 20 }}>
        <Text style={styles.groupLabel}>Experience Level *</Text>
        {errors.experience && <Text style={styles.groupError}>{errors.experience}</Text>}
        {EXPERIENCES.map((ex) => (
          <TouchableOpacity
            key={ex.id}
            style={[styles.expCard, form.experience === ex.id && styles.selectCardActive]}
            onPress={() => update('experience', ex.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.expEmoji}>{ex.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.expTitle}>{ex.id}</Text>
              <Text style={styles.expDesc}>{ex.desc}</Text>
            </View>
            {form.experience === ex.id && (
              <View style={styles.checkBadge}>
                <Ionicons name="checkmark" size={12} color={COLORS.white} />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── STEP 4: GOALS ─────────────────────────────────────────────────────────────
function StepGoals({ form, update, errors }) {
  const program = PROGRAMS[form.experience]?.[form.goal];

  return (
    <View style={styles.stepContent}>
      {/* Goals */}
      <View>
        <Text style={styles.groupLabel}>Main Goal *</Text>
        {errors.goal && <Text style={styles.groupError}>{errors.goal}</Text>}
        <View style={styles.twoCol}>
          {GOALS.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[styles.selectCard, form.goal === g.id && styles.selectCardActive, { flex: 1, marginHorizontal: 4, marginBottom: 8 }]}
              onPress={() => update('goal', g.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.selectCardEmoji}>{g.icon}</Text>
              <Text style={styles.selectCardTitle}>{g.id}</Text>
              <Text style={styles.selectCardDesc}>{g.desc}</Text>
              {form.goal === g.id && (
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={12} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Days per week */}
      <View style={{ marginTop: 20 }}>
        <Text style={styles.groupLabel}>Training Days per Week</Text>
        <View style={styles.daysRow}>
          {DAYS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.dayBtn, form.daysPerWeek === d && styles.dayBtnActive]}
              onPress={() => update('daysPerWeek', d)}
            >
              <Text style={[styles.dayBtnText, form.daysPerWeek === d && styles.dayBtnTextActive]}>
                {d}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.daysNote}>
          {form.daysPerWeek} training day{form.daysPerWeek > 1 ? 's' : ''} per week selected
        </Text>
      </View>

      {/* Program preview */}
      {program && (
        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>
            PROGRAM PREVIEW — {form.experience?.toUpperCase()} · {form.goal?.toUpperCase()}
          </Text>
          {program.map((ex, i) => (
            <View key={i} style={[styles.previewRow, i < program.length - 1 && styles.previewRowBorder]}>
              <View style={styles.previewNum}>
                <Text style={styles.previewNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.previewEx}>{ex}</Text>
              <Text style={styles.previewDay}>Day {i + 1}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── GENERATING SCREEN ─────────────────────────────────────────────────────────
function GeneratingScreen({ form }) {
  const [progress, setProgress] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const animWidth = useRef(new Animated.Value(0)).current;

  const genSteps = [
    { icon: '📊', text: 'Analyzing BMI and body stats' },
    { icon: '🥊', text: `Mapping ${form.stance} stance techniques` },
    { icon: '⭐', text: `Building ${form.experience} level curriculum` },
    { icon: '🎯', text: `Aligning with "${form.goal}" goal` },
    { icon: '🤖', text: 'Generating personalized program...' },
  ];

  useEffect(() => {
    let cur = 0;
    const t = setInterval(() => {
      cur += 2;
      const pct = Math.min(cur, 100);
      setProgress(pct);
      setStepIdx(Math.min(Math.floor(pct / 20), genSteps.length - 1));
      Animated.timing(animWidth, { toValue: pct, duration: 100, useNativeDriver: false }).start();
      if (cur >= 100) clearInterval(t);
    }, 60);
    return () => clearInterval(t);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.genPage}>
        <Text style={styles.appNameSmall}>🥊 HITTRACK</Text>
        <Text style={styles.genTitle}>Building Your Program...</Text>
        <Text style={styles.genSub}>Creating a personalized boxing plan just for you</Text>

        <View style={styles.genSteps}>
          {genSteps.map((st, i) => (
            <View key={i} style={[styles.genStep, { opacity: i <= stepIdx ? 1 : 0.3 }]}>
              <Text style={styles.genStepIcon}>{st.icon}</Text>
              <Text style={styles.genStepText}>{st.text}</Text>
              {i < stepIdx && <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />}
              {i === stepIdx && <ActivityIndicator size="small" color={COLORS.red} />}
            </View>
          ))}
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Generating...</Text>
            <Text style={styles.progressPct}>{progress}%</Text>
          </View>
          <View style={styles.progressBg}>
            <Animated.View style={[styles.progressFill, {
              width: animWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── DONE SCREEN ───────────────────────────────────────────────────────────────
function DoneScreen({ form, bmi, bmiLabel, bmiColor, router }) {
  const program = PROGRAMS[form.experience]?.[form.goal] || PROGRAMS['Beginner']['Learn Boxing'];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.doneScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.doneCheck}>
          <Ionicons name="checkmark" size={36} color={COLORS.green} />
        </View>

        <Text style={styles.doneTitle}>Your Program is Ready!</Text>
        <Text style={styles.doneSub}>
          Welcome to HitTrack, {form.name.split(' ')[0]}! Your personalized boxing program has been created.
        </Text>

        {/* Summary Stats */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>YOUR PROFILE SUMMARY</Text>
          <View style={styles.statsGrid}>
            {[
              { label: 'BMI',      val: bmi,                    color: bmiColor, sub: bmiLabel },
              { label: 'Stance',   val: form.stance === 'Orthodox' ? 'ORTH' : 'SOUTH', color: '#f5c842', sub: form.stance },
              { label: 'Level',    val: form.experience?.slice(0, 3).toUpperCase(), color: COLORS.red, sub: form.experience },
              { label: 'Days/Wk', val: `${form.daysPerWeek}x`, color: COLORS.green, sub: 'Training' },
            ].map((item, i) => (
              <View key={i} style={styles.statBox}>
                <Text style={styles.statLabel}>{item.label}</Text>
                <Text style={[styles.statVal, { color: item.color }]}>{item.val}</Text>
                <Text style={styles.statSub}>{item.sub}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.summaryTitle, { marginTop: 16, marginBottom: 10 }]}>
            YOUR FIRST WEEK — {form.goal?.toUpperCase()}
          </Text>
          {program.map((ex, i) => (
            <View key={i} style={[styles.programRow, i < program.length - 1 && styles.programRowBorder]}>
              <View style={styles.programNum}>
                <Text style={styles.programNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.programEx}>{ex}</Text>
              <Text style={styles.programDay}>Day {i + 1}</Text>
            </View>
          ))}
        </View>

        {/* Lock notice */}
        <View style={styles.lockNotice}>
          <Ionicons name="lock-closed" size={14} color={COLORS.red} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.lockTitle}>Program Locked</Text>
            <Text style={styles.lockDesc}>
              Your stance, experience level, and goal are now locked to protect your program.
              You can request a reset from your Profile page.
            </Text>
          </View>
        </View>

        {/* Start Button */}
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => router.replace('/(member)/home')}
          activeOpacity={0.85}
        >
          <Text style={styles.startBtnText}>Let's Start Training 🥊</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── SHARED: FORM FIELD ────────────────────────────────────────────────────────
function FormField({ label, error, children }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error && (
        <View style={styles.fieldError}>
          <Ionicons name="warning-outline" size={12} color={COLORS.red} />
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  // Step Bar
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stepItem: { alignItems: 'center', gap: 4, width: 64 },
  stepDot: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.inputBg,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  stepDotActive: { borderColor: COLORS.red, backgroundColor: '#2A1215' },
  stepDotDone:   { borderColor: COLORS.green, backgroundColor: COLORS.green },
  stepLabel: { fontSize: 9, color: COLORS.gray, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center', width: 60 },
  stepLabelActive: { color: COLORS.red },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.border, marginBottom: 14 },
  stepLineDone: { backgroundColor: COLORS.green },

  // Step Header
  stepHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, paddingVertical: 20,
  },
  stepIconBox: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#2A1215',
    justifyContent: 'center', alignItems: 'center',
  },
  stepTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white },
  stepDesc:  { fontSize: 13, color: COLORS.gray, marginTop: 2 },

  // Card
  card: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 16,
  },
  stepContent: { gap: 4 },

  // Field
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: COLORS.gray, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  input: {
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 16, height: 52,
    color: COLORS.white, fontSize: 15,
  },
  fieldError: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  fieldErrorText: { color: COLORS.red, fontSize: 12, fontWeight: '600' },
  twoCol: { flexDirection: 'row' },

  // BMI
  bmiCard: {
    backgroundColor: '#1A1A1A', borderRadius: 14,
    padding: 16, borderWidth: 1, marginBottom: 16,
  },
  bmiRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bmiSmallLabel: { fontSize: 9, fontWeight: '700', color: COLORS.gray, letterSpacing: 1, marginBottom: 2 },
  bmiValue: { fontSize: 42, fontWeight: '900', lineHeight: 48 },
  bmiTag: { borderRadius: 50, paddingHorizontal: 12, paddingVertical: 3, borderWidth: 1, alignSelf: 'flex-start', marginTop: 6 },
  bmiTagText: { fontSize: 11, fontWeight: '700' },
  bmiBarContainer: { flex: 1 },
  bmiBarBg: { height: 8, backgroundColor: COLORS.border, borderRadius: 50, overflow: 'hidden', marginBottom: 6 },
  bmiBarFill: { height: '100%', borderRadius: 50 },
  bmiBarLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  bmiBarLabel: { fontSize: 8, color: COLORS.gray, fontWeight: '700' },

  // Group
  groupLabel: { fontSize: 11, fontWeight: '700', color: COLORS.gray, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  groupError: { color: COLORS.red, fontSize: 12, fontWeight: '600', marginBottom: 8 },

  // Select Cards
  selectCard: {
    backgroundColor: COLORS.inputBg, borderRadius: 14,
    padding: 16, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', position: 'relative',
  },
  selectCardActive: { borderColor: COLORS.red, backgroundColor: '#2A1215' },
  selectCardEmoji: { fontSize: 28, marginBottom: 8 },
  selectCardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.white, marginBottom: 4, textAlign: 'center', alignSelf: 'stretch' },
  selectCardDesc:  { fontSize: 11, color: COLORS.gray, textAlign: 'center', lineHeight: 16, alignSelf: 'stretch' },
  checkBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: COLORS.red,
    justifyContent: 'center', alignItems: 'center',
  },

  // Experience Cards
  expCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    padding: 14, borderWidth: 2, borderColor: COLORS.border,
    marginBottom: 10, position: 'relative',
  },
  expEmoji: { fontSize: 24 },
  expTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  expDesc:  { fontSize: 12, color: COLORS.gray, marginTop: 2 },

  // Days
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  dayBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.inputBg,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  dayBtnActive: { borderColor: COLORS.red, backgroundColor: '#2A1215' },
  dayBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.gray },
  dayBtnTextActive: { color: COLORS.red },
  daysNote: { fontSize: 12, color: COLORS.gray, marginTop: 4 },

  // Program Preview
  previewBox: {
    backgroundColor: '#141414', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#2A2A2A', marginTop: 16,
  },
  previewTitle: { fontSize: 10, fontWeight: '700', color: COLORS.red, letterSpacing: 0.8, marginBottom: 12 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  previewRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  previewNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#2A1215', justifyContent: 'center', alignItems: 'center',
  },
  previewNumText: { fontSize: 10, fontWeight: '700', color: COLORS.red },
  previewEx: { flex: 1, fontSize: 13, color: COLORS.white, fontWeight: '500' },
  previewDay: { fontSize: 10, color: COLORS.gray },

  // Nav
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, height: 52,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  backBtnText: { color: COLORS.gray, fontSize: 15, fontWeight: '600' },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.red, borderRadius: 12, height: 52,
    shadowColor: COLORS.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  nextBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  stepCounter: { textAlign: 'center', fontSize: 12, color: COLORS.gray, marginBottom: 20 },

  // Generating
  genPage: {
    flex: 1, paddingHorizontal: 24, paddingVertical: 40,
    justifyContent: 'center', alignItems: 'center', gap: 20,
  },
  appNameSmall: { fontSize: 16, fontWeight: '900', color: COLORS.red, letterSpacing: 4 },
  genTitle: { fontSize: 24, fontWeight: '900', color: COLORS.white, textAlign: 'center' },
  genSub:   { fontSize: 13, color: COLORS.gray, textAlign: 'center' },
  genSteps: { width: '100%', gap: 10 },
  genStep: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  genStepIcon: { fontSize: 20 },
  genStepText: { flex: 1, fontSize: 13, color: COLORS.white },
  progressContainer: { width: '100%' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 12, color: COLORS.gray },
  progressPct: { fontSize: 12, color: COLORS.red, fontWeight: '700' },
  progressBg: { height: 6, backgroundColor: COLORS.border, borderRadius: 50, overflow: 'hidden' },
  progressFill: {
    height: '100%', borderRadius: 50,
    backgroundColor: COLORS.red,
  },

  // Done
  doneScroll: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 40, alignItems: 'center', gap: 16 },
  doneCheck: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#0d2b1e', borderWidth: 2, borderColor: COLORS.green,
    justifyContent: 'center', alignItems: 'center',
  },
  doneTitle: { fontSize: 28, fontWeight: '900', color: COLORS.white, textAlign: 'center' },
  doneSub:   { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 22 },
  summaryCard: {
    backgroundColor: COLORS.card, borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: COLORS.border, width: '100%',
  },
  summaryTitle: { fontSize: 10, fontWeight: '700', color: COLORS.red, letterSpacing: 0.8 },
  statsGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statBox: {
    flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12,
    padding: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  statLabel: { fontSize: 8,  fontWeight: '700', color: COLORS.gray, letterSpacing: 0.5, marginBottom: 4 },
  statVal:   { fontSize: 18, fontWeight: '900' },
  statSub:   { fontSize: 9,  color: COLORS.gray, marginTop: 2, textAlign: 'center' },
  programRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  programRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  programNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#2A1215', justifyContent: 'center', alignItems: 'center',
  },
  programNumText: { fontSize: 11, fontWeight: '700', color: COLORS.red },
  programEx: { flex: 1, fontSize: 13, color: COLORS.white, fontWeight: '500' },
  programDay: { fontSize: 11, color: COLORS.gray },
  lockNotice: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#2A1215', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.red + '44',
    padding: 14, width: '100%',
  },
  lockTitle: { fontSize: 12, fontWeight: '700', color: COLORS.red, marginBottom: 4 },
  lockDesc:  { fontSize: 12, color: COLORS.gray, lineHeight: 18 },
  startBtn: {
    backgroundColor: COLORS.red, borderRadius: 50, width: '100%',
    height: 56, justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  startBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});