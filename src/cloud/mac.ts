import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { User } from "firebase/auth";
import { Bytes, collection, deleteDoc, doc, documentId, endAt, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, startAt, updateDoc } from "firebase/firestore";
import { deleteObject, getBytes, listAll, ref, uploadBytes } from "firebase/storage";
import { useEffect, useSyncExternalStore } from "react";
import { announceChange, type Document, LIBRARY_CHANGED, onMac } from "../lib/library";
import { process } from "../lib/pipeline";
import { cloudConfigured, config, firebase, sendEmailLink, signInWithGoogleToken, signInWithLink, signOutOfCloud } from "./firebase";

/**
 * Voidcat Cloud on the Mac. Sign-in happens in the browser and comes back through a short-lived listener on this Mac
 * (`cloud_signin.rs`). The Rust side decides what goes up and seals it (`cloud.rs`); this side only moves sealed bytes:
 * `users/{uid}/records/doc_{id}` in Firestore and `users/{uid}/files/{id}` in Cloud Storage. The Mac's key never
 * leaves Rust: a cloud library opened by this Mac is opened by the Mac's recovery key.
 */

/** This build can sync: the Mac app, with the cloud's settings. */
export const macCloud = onMac && cloudConfigured;

export type Account = { uid: string; email: string | null; newDocuments: boolean; syncedAt: string | null };
type Upload = { id: string; title: string; recordHash: string; fileHash: string; file: boolean };
type Plan = { upload: Upload[]; remove: string[] };
/** cloud = up to date · pending = waiting or uploading · failed · local = kept only on this Mac */
export type MarkState = "cloud" | "pending" | "failed" | "local";

export type Status = {
  account: Account | null;
  /** off = not connected · idle = up to date · syncing · offline = waiting for the internet · error */
  phase: "off" | "idle" | "syncing" | "offline" | "error";
  left: number;
  failed: number;
  error: string | null;
  marks: Map<string, MarkState>;
};

let status: Status = { account: null, phase: "off", left: 0, failed: 0, error: null, marks: new Map() };
const listeners = new Set<() => void>();
const set = (change: Partial<Status>) => {
  status = { ...status, ...change };
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The Mac's cloud status and every document's mark, kept fresh by the sync. */
export const useCloudStatus = () => useSyncExternalStore(subscribe, () => status);

async function refreshMarks() {
  const marks = await invoke<{ id: string; state: MarkState }[]>("cloud_marks");
  set({ marks: new Map(marks.map((m) => [m.id, m.state])), failed: marks.filter((m) => m.state === "failed").length });
}

async function refresh() {
  set({ account: await invoke<Account | null>("cloud_account") });
  await refreshMarks();
}

const paths = (uid: string, id: string) => ({ record: `doc_${id}`, file: `users/${uid}/files/${id}` });
const notFound = (e: unknown) => (e as { code?: string })?.code === "storage/object-not-found";

/** A step that hangs (a write waiting for a connection that never comes) fails after a minute instead. */
function inTime<T>(work: Promise<T>, what: string): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} took too long.`)), 60_000))]);
}

async function signedIn(uid: string) {
  const { auth } = firebase();
  await auth.authStateReady();
  return auth.currentUser?.uid === uid ? auth.currentUser : null;
}

async function syncOnce() {
  await refresh();
  const account = status.account;
  if (!account) return set({ phase: "off", left: 0, error: null });
  if (!navigator.onLine) return set({ phase: "offline" });
  if (!(await signedIn(account.uid))) return set({ phase: "error", error: "Signed out of Voidcat Cloud. Connect again in Settings." });

  const { db, storage } = firebase();
  await pullEdits(account.uid);
  const plan = await invoke<Plan>("cloud_plan");
  let left = plan.upload.length + plan.remove.length;
  set({ phase: left ? "syncing" : "idle", left, error: null });
  await refreshMarks();

  for (const id of plan.remove) {
    const p = paths(account.uid, id);
    try {
      await inTime(deleteDoc(doc(db, "users", account.uid, "records", p.record)), "Removing");
      await deleteObject(ref(storage, p.file)).catch((e) => {
        if (!notFound(e)) throw e;
      });
      await invoke("cloud_removed", { id });
    } catch (e) {
      set({ error: String(e) });
    }
    set({ left: --left });
  }

  for (const item of plan.upload) {
    const p = paths(account.uid, item.id);
    try {
      if (item.file) {
        const sealed = new Uint8Array(await invoke<ArrayBuffer>("cloud_file", { id: item.id }));
        await inTime(uploadBytes(ref(storage, p.file), sealed, { contentType: "application/octet-stream" }), "Uploading");
      }
      const record = new Uint8Array(await invoke<ArrayBuffer>("cloud_record", { id: item.id }));
      await inTime(setDoc(doc(db, "users", account.uid, "records", p.record), { data: Bytes.fromUint8Array(record), v: 1, updatedAt: serverTimestamp() }), "Uploading");
      await invoke("cloud_uploaded", { id: item.id, recordHash: item.recordHash, fileHash: item.fileHash });
    } catch (e) {
      await invoke("cloud_failed", { id: item.id, error: e instanceof Error ? e.message : String(e) });
    }
    set({ left: --left });
    await refreshMarks();
  }

  await refresh();
  set({ phase: status.failed ? "error" : "idle", left: 0, error: status.failed ? `${status.failed} couldn't upload.` : null });
}

type Applied = { kind: "done" } | { kind: "skipped"; reason: string } | { kind: "import"; id: string; fileName: string };

/**
 * Changes made in a browser wait as sealed `edit_…` records, named by time. Each is applied here (Rust opens it),
 * files added in a browser are fetched and kept, then read on this Mac like a dropped file, and the edit is deleted.
 * The Mac's next upload then brings every browser up to date.
 */
async function pullEdits(uid: string) {
  const { db, storage } = firebase();
  const records = collection(db, "users", uid, "records");
  const edits = await getDocs(query(records, orderBy(documentId()), startAt("edit_"), endAt("edit_\uf8ff")));
  const added: Document[] = [];
  for (const e of edits.docs) {
    try {
      const sealed = (e.get("data") as Bytes).toUint8Array();
      const applied = await invoke<Applied>("cloud_apply", { sealed: [...sealed] });
      if (applied.kind === "import") {
        const file = new Uint8Array(await inTime(getBytes(ref(storage, `users/${uid}/files/${applied.id}`)), "Downloading"));
        const doc_ = await invoke<Document | null>("cloud_import", file, {
          headers: { "x-voidcat-id": applied.id, "x-voidcat-name": hex(new TextEncoder().encode(applied.fileName)), "Content-Type": "application/octet-stream" },
        });
        if (doc_) added.push(doc_);
        else {
          // Already in the library: the browser's copy goes.
          await deleteDoc(doc(db, "users", uid, "records", `doc_${applied.id}`));
          await deleteObject(ref(storage, `users/${uid}/files/${applied.id}`)).catch(() => {});
        }
      } else if (applied.kind === "skipped") console.warn("Voidcat Cloud: skipped a browser change:", applied.reason);
      await deleteDoc(e.ref);
    } catch (err) {
      // Left for the next sync.
      console.error(err);
    }
  }
  if (edits.size) announceChange();
  // Files a browser already read ("Read now") are kept as read there; the rest are read on this Mac.
  if (added.length) {
    const unread = new Set((await invoke<Document[]>("list_documents")).filter((d) => d.status === "new").map((d) => d.id));
    process(added.filter((d) => unread.has(d.id)));
  }
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

let running = false;
let again = false;
/** Runs a sync now (or right after the one in progress). */
export async function syncNow() {
  if (!macCloud) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await syncOnce().catch((e) => set({ phase: navigator.onLine ? "error" : "offline", error: e instanceof Error ? e.message : String(e) }));
    } while (again);
  } finally {
    running = false;
  }
}

/** Keeps the Mac in sync while it runs: on start, a few seconds after each change, every few minutes, when back online. */
export function useMacSync() {
  useEffect(() => {
    if (!macCloud) return;
    let soon: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(soon);
      soon = setTimeout(syncNow, 3000);
    };
    syncNow();
    const every = setInterval(syncNow, 5 * 60_000);
    window.addEventListener(LIBRARY_CHANGED, later);
    const offline = () => set({ phase: "offline" });
    window.addEventListener("online", syncNow);
    window.addEventListener("offline", offline);
    return () => {
      clearTimeout(soon);
      clearInterval(every);
      window.removeEventListener(LIBRARY_CHANGED, later);
      window.removeEventListener("online", syncNow);
      window.removeEventListener("offline", offline);
    };
  }, []);
}

/** Keep one document in the cloud, or only on this Mac (its cloud copy is deleted on the next sync). */
export async function keepInCloud(id: string, keep: boolean) {
  await invoke("cloud_keep", { id, keep });
  await refreshMarks();
  syncNow();
}

export async function setNewDocumentsGoUp(on: boolean) {
  await invoke("cloud_set_new_documents", { on });
  await refresh();
}

export type Outcome = "connected" | "join";

/**
 * After signing in: a new account gets a cloud library locked with this Mac's key; one this Mac's key opens is
 * joined; an empty one made elsewhere is taken over with this Mac's key (browsers that had the other key ask for the
 * Mac's recovery key next time). A library with documents and another key needs that library's recovery key: "join".
 */
export async function connectThisMac(user: User): Promise<Outcome> {
  const { db } = firebase();
  const userDoc = doc(db, "users", user.uid);
  const snap = await getDoc(userDoc);
  const ourCheck = async () => Bytes.fromUint8Array(new Uint8Array(await invoke<ArrayBuffer>("cloud_check")));
  if (!snap.exists()) {
    await setDoc(userDoc, { createdAt: serverTimestamp(), check: await ourCheck() });
  } else {
    const check = (snap.get("check") as Bytes).toUint8Array();
    if (!(await invoke<boolean>("cloud_opens", { check: [...check] }))) {
      const any = await getDocs(query(collection(db, "users", user.uid, "records"), limit(1)));
      if (!any.empty) return "join";
      await updateDoc(userDoc, { check: await ourCheck() });
    }
  }
  await invoke("cloud_connect", { uid: user.uid, email: user.email });
  await refresh();
  syncNow();
  return "connected";
}

/** Joins the signed-in account's cloud library with its recovery key: the library is re-locked and the app restarts. */
export async function joinCloudLibrary(code: string) {
  const user = firebase().auth.currentUser;
  if (!user) throw new Error("Sign in first.");
  const snap = await getDoc(doc(firebase().db, "users", user.uid));
  const check = (snap.get("check") as Bytes).toUint8Array();
  await invoke("cloud_join", { code, check: [...check], uid: user.uid, email: user.email });
}

type SignedIn = { kind: "link"; url: string } | { kind: "google"; idToken: string };

/**
 * Signs this Mac in through the browser: an email whose link comes back here, or a Google page served from here.
 * `done` settles once the browser hands back; `cancel` stops waiting.
 */
export async function signInThroughBrowser(how: { email: string } | "google") {
  const { port, nonce } = await invoke<{ port: number; nonce: string }>("cloud_listen", {
    config: { apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId, appId: config.appId },
  });
  let settle!: { resolve: (o: Outcome) => void; reject: (e: unknown) => void };
  const done = new Promise<Outcome>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const stop = await listen<SignedIn>("cloud-sign-in", async (e) => {
    stop();
    try {
      const cred = e.payload.kind === "link" ? await signInWithLink(typeof how === "string" ? "" : how.email, e.payload.url) : await signInWithGoogleToken(e.payload.idToken);
      settle.resolve(await connectThisMac(cred.user));
    } catch (err) {
      settle.reject(err);
    }
  });
  if (how === "google") await openUrl(`http://localhost:${port}/google/${nonce}`);
  else await sendEmailLink(how.email, `http://localhost:${port}/signin/${nonce}`);
  const cancel = () => {
    stop();
    invoke("cloud_stop_listening");
  };
  return { done, cancel };
}

/** Stops syncing; this Mac keeps everything and the cloud copy stays for the browsers. */
export async function disconnectThisMac() {
  await invoke("cloud_disconnect");
  await signOutOfCloud();
  await refresh();
  set({ phase: "off", left: 0, error: null });
}

/** Deletes every locked copy from the cloud (records and files), then disconnects. The account stays. */
export async function deleteCloudCopy() {
  const user = firebase().auth.currentUser;
  if (!user) throw new Error("Sign in first.");
  const { db, storage } = firebase();
  const records = await getDocs(collection(db, "users", user.uid, "records"));
  for (const r of records.docs) await deleteDoc(r.ref);
  const files = await listAll(ref(storage, `users/${user.uid}/files`));
  for (const f of files.items) await deleteObject(f);
  await invoke("cloud_forget_uploads");
  await disconnectThisMac();
}
