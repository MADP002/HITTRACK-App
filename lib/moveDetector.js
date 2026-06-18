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
    this.lastRepTime = 0; // ms timestamp of the last counted rep
    this._restingAnkleY = undefined; // used by jump detection as a ground baseline
  }

  reset() {
    this.lastRepTime = 0;
    this._restingAnkleY = undefined;
  }

  // Feed one new keypoint sample. Returns true the moment a rep counts.
  //
  // Sampling only a few times per second means we often never see the exact
  // frame where the body returns to rest after a fast punch — waiting for
  // that frame caused most real reps to go uncounted. Instead, any single
  // sample that clearly crosses the movement's threshold counts immediately,
  // with a short cooldown so the same punch can't be double-counted if two
  // consecutive samples happen to land on it.
  update(kp) {
    const metric = this._computeMetric(kp);
    if (metric === null) return false; // not confident enough this frame — skip it

    const threshold = this.movement.detection?.threshold ?? 0.5;
    const now = Date.now();
    const COOLDOWN_MS = 450;

    if (metric >= threshold && now - this.lastRepTime >= COOLDOWN_MS) {
      this.lastRepTime = now;
      return true;
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
  _wristExtension(kp, det) {
    const side = resolveSide(det.primary.includes('lead') ? 'lead' : 'rear', this.stance);
    const shoulder = kp[`${side}_shoulder`], elbow = kp[`${side}_elbow`], wrist = kp[`${side}_wrist`];
    if (!confident(shoulder, elbow, wrist)) return null;
    const ang = angleAt(shoulder, elbow, wrist);
    if (ang === null) return null;
    // ~90° (bent/guard) -> 0,  ~175° (fully extended) -> 1
    return Math.max(0, Math.min(1, (ang - 90) / 85));
  }

  // Hooks — wrist swings laterally away from the body while the elbow stays bent.
  _lateralArc(kp, det) {
    const side = resolveSide(det.primary.includes('lead') ? 'lead' : 'rear', this.stance);
    const shoulder = kp[`${side}_shoulder`], elbow = kp[`${side}_elbow`], wrist = kp[`${side}_wrist`];
    const scale = bodyScale(kp);
    if (!confident(shoulder, elbow, wrist) || !scale) return null;
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