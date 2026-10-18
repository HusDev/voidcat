import { type FirebaseApp, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink, signInWithPopup, signOut } from "firebase/auth";
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

/** Email sign-in, no password: a one-time link, kept apart from any Google account. The address waits here for the return. */
const EMAIL_KEY = "voidcat.signInEmail";

export async function sendEmailLink(email: string) {
  await sendSignInLinkToEmail(firebase().auth, email, { url: `${location.origin}${location.pathname}`, handleCodeInApp: true });
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* asked again on return */
  }
}

/** Whether this page was opened from a sign-in email, and the address it was sent to if this browser remembers it. */
export function emailLinkReturn(): { email: string | null } | null {
  if (!isSignInWithEmailLink(firebase().auth, location.href)) return null;
  try {
    return { email: localStorage.getItem(EMAIL_KEY) };
  } catch {
    return { email: null };
  }
}

export async function finishEmailLink(email: string) {
  await signInWithEmailLink(firebase().auth, email, location.href);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* nothing kept */
  }
  // The link's one-time code shouldn't stay in the address bar or history.
  history.replaceState(null, "", `${location.origin}${location.pathname}`);
}

export const signOutOfCloud = () => signOut(firebase().auth);
