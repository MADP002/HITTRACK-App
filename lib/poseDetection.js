// lib/poseDetection.js
//
// Loads the MoveNet Lightning TFLite model once, then turns a captured
// camera photo into 17 body keypoints (x, y, confidence score each).
//
// Pipeline per photo: resize to 192x192 -> decode JPEG to raw RGB pixels
// -> feed into the model -> parse the output into named keypoints.

import { loadTensorflowModel } from 'react-native-fast-tflite';
import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import jpeg from 'jpeg-js';

const MODEL_INPUT_SIZE = 192;

export const KEYPOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
];

let modelInstance = null;
let inputIsFloat = false; // detected once the model is loaded

// ── Load the model once and cache it for the rest of the app session ──
export async function loadPoseModel() {
  if (modelInstance) return modelInstance;

  // Force-download the bundled asset to a real local file:// path first.
  // Metro's dev-server sometimes resolves require() of unusual file types
  // (like .tflite) into a complex query-string URL that the native loader
  // can't always handle directly — downloading explicitly avoids that.
  const asset = Asset.fromModule(require('../assets/models/movenet_lightning.tflite'));
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error('Could not resolve a local file path for the pose model.');
  }

  console.log('[PoseModel] Step 3: calling loadTensorflowModel with url:', asset.localUri);
  // Second argument (delegates) is REQUIRED by this library — an empty
  // array means "use the default CPU delegate" per the library's own docs.
  modelInstance = await loadTensorflowModel({ url: asset.localUri }, []);
  console.log('[PoseModel] Step 4: model loaded successfully!');

  try {
    const inputInfo = modelInstance.inputs?.[0];
    const dtype = (inputInfo?.dataType || '').toLowerCase();
    inputIsFloat = dtype.includes('float');
    // Useful the first time this runs on a real device — check Metro logs
    // to confirm the model's actual input/output shape matches expectations.
    console.log('[PoseModel] loaded. input:', inputInfo, 'output:', modelInstance.outputs?.[0]);
  } catch (e) {
    console.warn('[PoseModel] could not read model metadata, defaulting to uint8 input:', e);
  }

  return modelInstance;
}

// ── Minimal base64 -> Uint8Array decoder (avoids needing the `buffer` package) ──
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToUint8Array(base64) {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4) + 3);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = B64_CHARS.indexOf(clean[i + 2]);
    const c3 = B64_CHARS.indexOf(clean[i + 3]);
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (clean[i + 2] !== undefined && clean[i + 2] !== '=') bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (clean[i + 3] !== undefined && clean[i + 3] !== '=') bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  return bytes.slice(0, p);
}

// ── Resize the captured photo down to 192x192 and decode to raw RGBA pixels ──
async function preprocessPhoto(photoUri) {
  const manipulated = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ resize: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  const bytes = base64ToUint8Array(manipulated.base64);
  const raw = jpeg.decode(bytes, { useTArray: true }); // { width, height, data: Uint8Array RGBA }
  return raw;
}

// ── Convert RGBA pixels into whatever tensor format the model expects ──
function rgbaToModelInput(raw) {
  const pixelCount = raw.width * raw.height;

  if (inputIsFloat) {
    const input = new Float32Array(pixelCount * 3);
    for (let i = 0; i < pixelCount; i++) {
      input[i * 3]     = raw.data[i * 4]     / 255;
      input[i * 3 + 1] = raw.data[i * 4 + 1] / 255;
      input[i * 3 + 2] = raw.data[i * 4 + 2] / 255;
    }
    return input;
  }

  const input = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    input[i * 3]     = raw.data[i * 4];
    input[i * 3 + 1] = raw.data[i * 4 + 1];
    input[i * 3 + 2] = raw.data[i * 4 + 2];
  }
  return input;
}

// ── Full pipeline: photo URI -> object of 17 named keypoints ──
// Each keypoint is { x, y, score } with x/y normalized 0-1 relative to the frame.
export async function detectPoseFromPhoto(photoUri) {
  const model = await loadPoseModel();
  const raw = await preprocessPhoto(photoUri);
  const inputTensor = rgbaToModelInput(raw);

  // runSync expects/returns raw ArrayBuffer[], not typed array views directly
  const outputs = model.runSync([inputTensor.buffer]);
  const output = new Float32Array(outputs[0]); // MoveNet's keypoint output is always float32

  const keypoints = {};
  for (let i = 0; i < 17; i++) {
    keypoints[KEYPOINT_NAMES[i]] = {
      y: output[i * 3],
      x: output[i * 3 + 1],
      score: output[i * 3 + 2],
    };
  }
  return keypoints;
}