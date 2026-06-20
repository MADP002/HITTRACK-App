// lib/moveDetector.js
//
// Turns a stream of pose keypoint samples into rep counts for a specific
// movement (jab, hook, squat, slip, etc). Since we sample photos roughly
// 2-3 times per second rather than a continuous video stream, each
// detector tracks a simple resting <-> active state machine: a rep counts
// the moment the body returns to "resting" after having crossed into
// "active" territory. Hysteresis (a lower exit threshold than the entry
// threshold) keeps single noisy frames from causing false double-counts.
//
// NOTE: these thresholds are an educated starting point based on body-
// proportion heuristics, not values tuned against real recorded footage.
// Expect to nudge the `threshold` numbers in trainingPrograms.js after
// testing against an actual phone + person, the same way any pose-based
// fitness app needs a calibration pass.

const MIN_SCORE = 0.2; // ignore keypoints the model isn't confident about — lowered slightly since fast punches cause motion blur that drags confidence down even on real, valid detections

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Angle at vertex b, formed by points a-b-c, in degrees
function angleAt(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const mag1 = Math.sqrt(v1x ** 2 + v1y ** 2);
  const mag2 = Math.sqrt(v2x ** 2 + v2y ** 2);
  if (mag1 === 0 || mag2 === 0) return null;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function confident(...points) {
  return points.every((p) => p && p.score >= MIN_SCORE);
}

// Shoulder width as a scale-invariant reference distance — lets the same
// thresholds work whether the person is closer/farther or built differently.
function bodyScale(kp) {
  if (confident(kp.left_shoulder, kp.right_shoulder)) {
    return dist(kp.left_shoulder, kp.right_shoulder);
  }
  return null;
}

// "lead"/"rear" resolve to actual left/right keypoints based on stance
function resolveSide(handRole, stance) {
  const leadSide = stance === 'Southpaw' ? 'right' : 'left';
  const rearSide = stance === 'Southpaw' ? 'left' : 'right';
  if (handRole === 'lead') return leadSide;
  if (handRole === 'rear') return rearSide;
  return null;
}

export class MoveDetector {
  constructor(movement, stance) {
    this.movement = movement;
    this.stance = stance;
    this.armed = true;          // true = ready to count the next rep
    this.lastMetric = 0;        // previous sample's metric value
    this.history = [];          // rolling window of recent metric readings — personal baseline
    this.lastRepTime = 0;
    this.repLog = [];           // { t: timestamp, quality: 0-1 } for every counted rep — used for the coach report
    this._restingAnkleY = undefined; // used by jump detection as a ground baseline
  }

  reset() {
    this.armed = true;
    this.lastMetric = 0;
    this.history = [];
    this.lastRepTime = 0;
    this.repLog = [];
    this._restingAnkleY = undefined;
  }

  // Summarizes this session's reps into coach-facing stats. Call once the
  // session ends. Returns null if no reps were logged.
  getSessionSummary() {
    const n = this.repLog.length;
    if (n === 0) return null;

    const avgQuality = this.repLog.reduce((s, r) => s + r.quality, 0) / n;

    let gaps = [];
    for (let i = 1; i < n; i++) gaps.push((this.repLog[i].t - this.repLog[i - 1].t) / 1000);

    const avgGapSec = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    let consistencyPct = null;
    if (gaps.length >= 2) {
      const mean = avgGapSec;
      const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
      const stdev = Math.sqrt(variance);
      consistencyPct = Math.max(0, Math.min(100, Math.round((1 - stdev / Math.max(mean, 0.5)) * 100)));
    }

    // Longest streak of reps thrown with no gap longer than 4s between them
    let bestStreak = 1, currentStreak = 1;
    for (const g of gaps) {
      if (g <= 4) { currentStreak++; bestStreak = Math.max(bestStreak, currentStreak); }
      else { currentStreak = 1; }
    }

    const totalSpanSec = n > 1 ? (this.repLog[n - 1].t - this.repLog[0].t) / 1000 : null;
    const paceRepsPerMin = totalSpanSec && totalSpanSec > 0 ? Math.round((n / totalSpanSec) * 60) : null;

    return {
      reps: n,
      avgQualityPct: Math.round(avgQuality * 100),
      paceRepsPerMin,
      consistencyPct,
      bestStreak,
    };
  }

  // Feed one new keypoint sample. Returns true the moment a rep counts.
  //
  // A real punch always starts from a relaxed/guard position and snaps
  // OUT to extension — so we require a genuine RISE before counting, not
  // just "currently extended" (which also matches a static lean or
  // already-raised guard with no real punching motion). Earlier versions
  // required the arm to drop to one fixed near-zero value to count as
  // "relaxed," but real guards vary a lot between people — some hold a
  // tighter tuck, others a looser one. Instead, this tracks each
  // person's own recent baseline (a rolling window of their actual
  // readings) and requires a clear rise relative to THAT, so it adapts
  // to whatever a given person's guard naturally looks like.
  update(kp) {
    const metric = this._computeMetric(kp);
    if (metric === null) return false; // not confident enough this frame — skip it

    const threshold = this.movement.detection?.threshold ?? 0.5;
    const MIN_RISE = 0.22;     // how much higher than the recent baseline counts as a real rise
    const COOLDOWN_MS = 250;   // small extra safety margin against jitter
    const HISTORY_SIZE = 6;    // roughly the last ~1-2 seconds of samples

    // Use the BETTER of this sample and the previous one for the
    // threshold-crossing decision, so one off-peak frame during a fast
    // punch doesn't cause a real rep to be missed.
    const effectiveMetric = Math.max(metric, this.lastMetric);
    this.lastMetric = metric;
    const now = Date.now();

    // Personal baseline = the lowest reading seen recently, BEFORE this sample
    const baseline = this.history.length > 0 ? Math.min(...this.history) : effectiveMetric;
    const rise = effectiveMetric - baseline;

    this.history.push(effectiveMetric);
    if (this.history.length > HISTORY_SIZE) this.history.shift();

    if (this.movement?.id) {
      console.log(`[MoveDetector:${this.movement.id}] metric=${metric.toFixed(2)} effective=${effectiveMetric.toFixed(2)} baseline=${baseline.toFixed(2)} rise=${rise.toFixed(2)} armed=${this.armed}`);
    }

    if (this.armed && effectiveMetric >= threshold && rise >= MIN_RISE && now - this.lastRepTime >= COOLDOWN_MS) {
      this.armed = false;
      this.history = []; // start tracking a fresh baseline after this rep
      this.lastRepTime = now;
      this.repLog.push({ t: now, quality: effectiveMetric });
      return true;
    }
    // Re-arm once the metric settles back down close to its recent baseline
    if (!this.armed && rise <= MIN_RISE * 0.4) {
      this.armed = true; // back to relaxed/guard — ready for the next rep
    }
    return false;
  }

  _computeMetric(kp) {
    const det = this.movement.detection;
    switch (det.method) {
      case 'wrist_extension':       return this._wristExtension(kp, det);
      case 'lateral_arc':           return this._lateralArc(kp, det);
      case 'upward_arc':            return this._upwardArc(kp, det);
      case 'head_lateral':          return this._headLateral(kp, det);
      case 'head_vertical_lateral': return this._headVerticalLateral(kp);
      case 'hip_depth':             return this._hipDepth(kp);
      case 'jump_detection':        return this._jumpDetection(kp);
      case 'torso_rotation':        return this._torsoRotation(kp);
      case 'single_knee_depth':     return this._singleKneeDepth(kp);
      default: return null;
    }
  }

  // Straight punches (jab/cross) — the elbow straightens toward 180°.
  // Also checks the OPPOSITE arm stays relatively relaxed, so sloppy form
  // where both arms move together (or a body sway with arms hanging out)
  // doesn't get counted as a clean single-arm punch.
  _wristExtension(kp, det) {
    const isLead = det.primary.includes('lead');
    const side = resolveSide(isLead ? 'lead' : 'rear', this.stance);
    const otherSide = side === 'left' ? 'right' : 'left';

    const shoulder = kp[`${side}_shoulder`], elbow = kp[`${side}_elbow`], wrist = kp[`${side}_wrist`];
    const scale = bodyScale(kp);
    if (!confident(shoulder, elbow, wrist) || !scale) return null;

    // Punch-zone gate: a hanging/relaxed arm is also nearly fully straight
    // (elbow angle near 180°) — almost identical to a real punch by angle
    // alone. The difference is WHERE the wrist is. Measured relative to the
    // shoulder and normalized by body scale (shoulder width) — this avoids
    // depending on the hip keypoint, which gets noisy or loses confidence
    // during fast dynamic movement and was causing both false accepts
    // (gate silently disabled when hip wasn't confidently tracked) and
    // false rejects (a real punch's forward lean shifting hip position).
    const relativeDrop = (wrist.y - shoulder.y) / scale; // how far below the shoulder, in shoulder-widths
    if (relativeDrop > 1.0) return 0; // wrist has dropped down near hip/thigh level — not a punch

    const ang = angleAt(shoulder, elbow, wrist);
    if (ang === null) return null;
    const targetMetric = Math.max(0, Math.min(1, (ang - 90) / 85));

    // Differential check against the other arm, if we can see it clearly
    const oShoulder = kp[`${otherSide}_shoulder`], oElbow = kp[`${otherSide}_elbow`], oWrist = kp[`${otherSide}_wrist`];
    if (confident(oShoulder, oElbow, oWrist)) {
      const oAng = angleAt(oShoulder, oElbow, oWrist);
      if (oAng !== null) {
        const otherMetric = Math.max(0, Math.min(1, (oAng - 90) / 85));
        if (targetMetric - otherMetric < 0.25) return 0; // both arms moving together — not a clean single punch
      }
    }
    return targetMetric;
  }

  // Hooks — wrist swings laterally away from the body while the elbow stays bent.
  _lateralArc(kp, det) {
    const isLead = det.primary.includes('lead');
    const side = resolveSide(isLead ? 'lead' : 'rear', this.stance);
    const shoulder = kp[`${side}_shoulder`], elbow = kp[`${side}_elbow`], wrist = kp[`${side}_wrist`];
    const scale = bodyScale(kp);
    if (!confident(shoulder, elbow, wrist) || !scale) return null;

    const relativeDrop = (wrist.y - shoulder.y) / scale;
    if (relativeDrop > 1.0) return 0; // wrist dropped to hip/thigh level — not a punch

    const elbowAngle = angleAt(shoulder, elbow, wrist);
    if (elbowAngle !== null && elbowAngle > 140) return 0; // too straight — that's a cross, not a hook
    const lateralOffset = Math.abs(wrist.x - shoulder.x) / scale;
    return Math.max(0, Math.min(1, (lateralOffset - 0.3) / 0.8));
  }

  // Uppercuts — wrist rises sharply relative to the shoulder line.
  _upwardArc(kp, det) {
    const side = resolveSide(det.primary.includes('lead') ? 'lead' : 'rear', this.stance);
    const shoulder = kp[`${side}_shoulder`], wrist = kp[`${side}_wrist`];
    const scale = bodyScale(kp);
    if (!confident(shoulder, wrist) || !scale) return null;
    // Image y grows downward, so a rise means wrist.y becomes smaller than shoulder.y
    const rise = (shoulder.y - wrist.y) / scale;
    return Math.max(0, Math.min(1, (rise + 0.2) / 0.9));
  }

  // Slip left/right — head shifts laterally off the body's center line.
  _headLateral(kp, det) {
    const nose = kp.nose, lh = kp.left_hip, rh = kp.right_hip;
    const scale = bodyScale(kp);
    if (!confident(nose, lh, rh) || !scale) return null;
    const centerX = (lh.x + rh.x) / 2;
    const offset = (nose.x - centerX) / scale;
    const directional = det.direction === 'right' ? offset : -offset;
    return Math.max(0, Math.min(1, directional / 0.6));
  }

  // Bob and weave — head dips down AND shifts laterally in the same motion.
  _headVerticalLateral(kp) {
    const { nose, left_hip: lh, right_hip: rh, left_shoulder: ls, right_shoulder: rs } = kp;
    const scale = bodyScale(kp);
    if (!confident(nose, lh, rh, ls, rs) || !scale) return null;
    const shoulderMidY = (ls.y + rs.y) / 2;
    const drop = (nose.y - shoulderMidY) / scale; // bigger = head dipped lower
    const centerX = (lh.x + rh.x) / 2;
    const lateral = Math.abs(nose.x - centerX) / scale;
    return Math.max(0, Math.min(1, (drop * 0.6 + lateral * 0.4) / 0.5));
  }

  // Squat — hips drop closer to knee height.
  _hipDepth(kp) {
    const { left_hip: lh, right_hip: rh, left_knee: lk, right_knee: rk } = kp;
    if (!confident(lh, rh, lk, rk)) return null;
    const hipY = (lh.y + rh.y) / 2, kneeY = (lk.y + rk.y) / 2;
    const legLen = Math.abs(kneeY - hipY) || 0.0001;
    return Math.max(0, Math.min(1, 1 - (kneeY - hipY) / legLen));
  }

  // Broad jump — both ankles rise together off their resting ground baseline.
  _jumpDetection(kp) {
    const { left_ankle: la, right_ankle: ra } = kp;
    if (!confident(la, ra)) return null;
    if (this._restingAnkleY === undefined) {
      this._restingAnkleY = (la.y + ra.y) / 2; // first confident sample = ground baseline
      return 0;
    }
    const currentY = (la.y + ra.y) / 2;
    const scale = bodyScale(kp) || 0.2;
    const rise = (this._restingAnkleY - currentY) / scale;
    return Math.max(0, Math.min(1, rise / 0.4));
  }

  // Russian twist — torso (shoulder line) rotates side to side relative to the hips.
  _torsoRotation(kp) {
    const { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh } = kp;
    const scale = bodyScale(kp);
    if (!confident(ls, rs, lh, rh) || !scale) return null;
    const shoulderMidX = (ls.x + rs.x) / 2;
    const hipMidX = (lh.x + rh.x) / 2;
    const offset = Math.abs(shoulderMidX - hipMidX) / scale;
    return Math.max(0, Math.min(1, offset / 0.5));
  }

  // Lunge — one knee bends deeply while the other leg stays extended.
  _singleKneeDepth(kp) {
    let best = null;
    for (const side of ['left', 'right']) {
      const hip = kp[`${side}_hip`], knee = kp[`${side}_knee`], ankle = kp[`${side}_ankle`];
      if (!confident(hip, knee, ankle)) continue;
      const ang = angleAt(hip, knee, ankle);
      if (ang === null) continue;
      const depth = Math.max(0, Math.min(1, (170 - ang) / 80)); // ~90° bend -> 1, ~170° standing -> 0
      if (best === null || depth > best) best = depth;
    }
    return best;
  }
}

export function createDetector(movement, stance) {
  return new MoveDetector(movement, stance);
}