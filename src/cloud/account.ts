import { Bytes, clearIndexedDbPersistence, doc, getDoc, serverTimestamp, setDoc, terminate } from "firebase/firestore";
import type { User } from "firebase/auth";
import { apiUrl } from "./config";
import { firebase, signOutOfCloud } from "./firebase";
import { forgetKeys, loadKeys, saveKeys } from "./keystore";
import { type Keys, keysFrom, masterFromCode, newMaster, openText, recoveryCode, sealText } from "./vault";

/**
 * A cloud library: `users/{uid}` holds only when it was made and a sealed check phrase, so a typed recovery key can be
 * tested without the server learning anything. Everything else lives under it as sealed records (`records/{id}`).
 */

const CHECK = "voidcat-library-check";

export type LibraryState = { kind: "none" } | { kind: "locked" } | { kind: "unlocked"; keys: Keys };

export async function libraryState(uid: string): Promise<LibraryState> {
  const snap = await getDoc(doc(firebase().db, "users", uid));
  if (!snap.exists()) return { kind: "none" };
  const keys = await loadKeys(uid);
  if (!keys) return { kind: "locked" };
  // A Mac may have taken the library over with its own key since: then this browser's key no longer opens it.
  if (!(await opens(keys, snap.get("check") as Bytes | undefined))) {
    await forgetKeys(uid);
    return { kind: "locked" };
  }
  return { kind: "unlocked", keys };
}

/** Makes a new library: a fresh key, its sealed check in the cloud, the key kept in this browser. Returns the recovery key to show once. */
export async function createLibrary(uid: string): Promise<{ code: string; keys: Keys }> {
  const master = newMaster();
  const keys = await keysFrom(master);
  const check = await sealText(keys.records, CHECK);
  await setDoc(doc(firebase().db, "users", uid), { createdAt: serverTimestamp(), check: Bytes.fromUint8Array(check) });
  await saveKeys(uid, keys);
  return { code: recoveryCode(master), keys };
}

/** Unlocks the library in this browser with the recovery key, checked against the library before it's kept. */
export async function unlockLibrary(uid: string, code: string): Promise<Keys> {
  const master = masterFromCode(code);
  if (!master) throw new Error("That doesn't look like a recovery key: it has 13 groups of four letters and numbers.");
  const keys = await keysFrom(master);
  const snap = await getDoc(doc(firebase().db, "users", uid));
  const check = snap.get("check") as Bytes | undefined;
  if (!check) throw new Error("There's no library on this account yet.");
  if (!(await opens(keys, check))) throw new Error("That recovery key doesn't open this library. Check each group of four and try again.");
  await saveKeys(uid, keys);
  return keys;
}

async function opens(keys: Keys, check: Bytes | undefined) {
  if (!check) return false;
  try {
    return (await openText(keys.records, check.toUint8Array())) === CHECK;
  } catch {
    return false;
  }
}

/**
 * Leaves nothing behind in this browser: the key, the sign-in, and the offline copy of the (locked) records. The page
 * reloads, since the database connection can't be used after its copy is cleared.
 */
export async function forgetThisBrowser(uid: string) {
  await forgetKeys(uid);
  await signOutOfCloud().catch(() => {});
  const { db } = firebase();
  await terminate(db);
  await clearIndexedDbPersistence(db).catch(() => {});
  location.replace(location.pathname);
}

/**
 * Deletes the account: the API removes every sealed record, every file, the read count and the sign-in; then this
 * browser forgets its key. Devices keep their own copies (a Mac keeps its whole library).
 */
export async function deleteAccount(user: User) {
  const res = await fetch(`${apiUrl}/v1/account`, { method: "DELETE", headers: { Authorization: `Bearer ${await user.getIdToken(true)}` } });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Couldn't delete the account (${res.status}).`);
  await forgetThisBrowser(user.uid);
}
