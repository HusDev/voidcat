import { Bytes, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebase } from "./firebase";
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
  return keys ? { kind: "unlocked", keys } : { kind: "locked" };
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
  try {
    if ((await openText(keys.records, check.toUint8Array())) !== CHECK) throw new Error();
  } catch {
    throw new Error("That recovery key doesn't open this library. Check each group of four and try again.");
  }
  await saveKeys(uid, keys);
  return keys;
}

export const forgetThisBrowser = (uid: string) => forgetKeys(uid);
