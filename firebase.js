import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyAPok5DAhoG4iOT-jiRsAseAx-ZCwj8YC8",
  authDomain: "hittrack-eb904.firebaseapp.com",
  projectId: "hittrack-eb904",
  storageBucket: "hittrack-eb904.firebasestorage.app",
  messagingSenderId: "957114584443",
  appId: "1:957114584443:web:0593f7b6f3828c2ff481de"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth service — persisted to AsyncStorage so the login session survives
// app restarts and reloads, instead of resetting to memory-only each time.
// This also closes the brief "not authenticated yet" window right after
// a reload that was causing occasional "missing or insufficient
// permissions" errors on the very first Firestore request.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Firestore service
export const db = getFirestore(app);