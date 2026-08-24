import { getApps, initializeApp } from "firebase/app"
import { GoogleAuthProvider, getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

// Client-side Firebase singleton — the counterpart to lib/firebase-admin.ts's
// server-only Admin SDK. This is the app's first client-side Firebase usage:
// signing in (lib/use-auth.ts) and the per-user data hooks
// (lib/use-persisted-list.ts, lib/use-srs-cards.ts) both go through this.
//
// These NEXT_PUBLIC_ values are the standard Firebase web app config —
// public-safe by design (they identify the project, they don't authorize
// anything on their own; firestore.rules is what actually gates access) —
// but real values still have to come from Firebase Console → Project
// Settings → your web app, so they're env vars rather than hardcoded here.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// getApps()[0] guards against re-initializing on Next.js dev hot-reload —
// same guard lib/firebase-admin.ts uses for the same reason.
const app = getApps()[0] ?? initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
