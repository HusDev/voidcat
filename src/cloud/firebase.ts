import { type FirebaseApp, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Voidcat Cloud's Firebase project (voidcat-cloud, Belgium). The web settings come from `.env.local` locally and a CI
 * variable on Cloud Run; they aren't secret, they only say which project to talk to. Sign-in says who you are; it
 * never unlocks anything (that is the recovery key's job).
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
};

/** The cloud version is available when its settings are present (not in the Mac app, which keeps its own library). */
export const cloudConfigured = !!(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;
export function firebase() {
  if (!cloudConfigured) throw new Error("Voidcat Cloud isn't configured in this build.");
  app ??= initializeApp(config);
  return { app, auth: getAuth(app), db: getFirestore(app) };
}

export const signInWithGoogle = () => signInWithPopup(firebase().auth, new GoogleAuthProvider());
export const signOutOfCloud = () => signOut(firebase().auth);
