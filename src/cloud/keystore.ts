import type { Keys } from "./vault";

/**
 * Where a browser keeps a library's keys once the recovery key was typed: IndexedDB, as CryptoKeys that can't be
 * exported, so the raw key never sits in storage. "Forget this browser" deletes them.
 */

const DB = "voidcat-keys";
const STORE = "keys";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = work(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const loadKeys = (uid: string) => run<Keys | undefined>("readonly", (s) => s.get(uid) as IDBRequest<Keys | undefined>);
export const saveKeys = (uid: string, keys: Keys) => run("readwrite", (s) => s.put({ records: keys.records, files: keys.files }, uid));
export const forgetKeys = (uid: string) => run("readwrite", (s) => s.delete(uid));
