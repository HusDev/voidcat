import { isTauri } from "@tauri-apps/api/core";
import { type FirebaseApp, initializeApp } from "firebase/app";
import {
  type Auth,
  GoogleAuthProvider,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * Voidcat Cloud's Firebase project (voidcat-cloud, Belgium). The web settings come from `.env.local` locally and a CI
 * variable on Cloud Run; they aren't secret, they only say which project to talk to. Sign-in says who you are; it
 * never unlocks anything (that is the recovery key's job).
 */

export const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
};

/** Voidcat Cloud is available when its settings are present (in the browser, and on the Mac to sync to it). */
export const cloudConfigured = !!(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
export function firebase() {
  if (!cloudConfigured) throw new Error("Voidcat Cloud isn't configured in this build.");
  app ??= initializeApp(config);
  // In the Mac app there are no sign-in pop-ups (sign-in happens in the browser, see `mac.ts`), so auth starts
  // without the pop-up helper, which would load Google's scripts into the window.
  auth ??= isTauri() ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
  return { app, auth, db: getFirestore(app), storage: getStorage(app) };
}

export const signInWithGoogle = () => signInWithPopup(firebase().auth, new GoogleAuthProvider());

/** Email sign-in, no password: a one-time link, kept apart from any Google account. The address waits here for the return. */
const EMAIL_KEY = "voidcat.signInEmail";

/** Sends the sign-in email; its link comes back to `url` (this page, or the Mac's listener). */
export async function sendEmailLink(email: string, url = `${location.origin}${location.pathname}`) {
  await sendSignInLinkToEmail(firebase().auth, email, { url, handleCodeInApp: true });
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

/** The Mac: finishes with the link the browser handed back, or with Google's token from the browser page. */
export const signInWithLink = (email: string, link: string) => signInWithEmailLink(firebase().auth, email, link);
export const signInWithGoogleToken = (idToken: string) => signInWithCredential(firebase().auth, GoogleAuthProvider.credential(idToken));

/** The address a sign-in email went to, while this browser waits for its link. */
export function pendingEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export const signOutOfCloud = () => signOut(firebase().auth);
