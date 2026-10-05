// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA2RQULlPmDTpxL9kozYXwQtPAqdac-Wbc",
  authDomain: "wallet-hook.firebaseapp.com",
  projectId: "wallet-hook",
  storageBucket: "wallet-hook.firebasestorage.app",
  messagingSenderId: "1097872910050",
  appId: "1:1097872910050:web:027dbd19444713fcfde0bb",
  measurementId: "G-BY4Z6TEVJP"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);