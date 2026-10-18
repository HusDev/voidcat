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
