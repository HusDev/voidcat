import { useEffect, useState } from "react";
import type { FromWorker, ToWorker } from "./privacyModel.worker";
import { FOUND_KIND, type Found } from "./privacy";

/**
 * "Catch names the rules miss": OpenAI's privacy-filter model reads a text on this Mac before it goes to a cloud
 * model, and whatever it finds (names, addresses, emails, phone numbers, account numbers…) is masked too. Off until
 * you turn it on in Settings, because the model is a 917 MB download (once).
 */

const KEY = "voidcat.nameCheck";
export const MODEL_SIZE = "917 MB";
/** Below this the model isn't sure enough; the rules and approved facts still apply. */
const MIN_SCORE = 0.6;
/** Long texts are read in pieces so one question can't stall for minutes. */
const CHUNK = 6000;

export type CheckState = { on: boolean; status: "off" | "downloading" | "ready" | "failed"; loaded: number; total: number; error?: string };

const read = () => {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
};

let state: CheckState = { on: read(), status: "off", loaded: 0, total: 0 };
const listeners = new Set<(s: CheckState) => void>();
const set = (patch: Partial<CheckState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
};

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (f: Found[]) => void; reject: (e: Error) => void }>();

function start() {
  if (worker) return worker;
  worker = new Worker(new URL("./privacyModel.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === "progress") set({ status: "downloading", loaded: m.loaded, total: m.total });
    else if (m.type === "ready") set({ status: "ready" });
    else if (m.type === "failed") set({ status: "failed", error: m.error });
    else if (m.type === "found" || m.type === "error") {
      const w = waiting.get(m.id);
      waiting.delete(m.id);
      if (m.type === "error") w?.reject(new Error(m.error));
      else w?.resolve(m.spans.filter((s) => s.score >= MIN_SCORE && FOUND_KIND[s.group]).map((s) => ({ value: s.word.trim(), kind: FOUND_KIND[s.group] })));
    }
  };
  if (state.status === "off") set({ status: "downloading" });
  worker.postMessage({ type: "load" } satisfies ToWorker);
  return worker;
}

export const nameCheckOn = () => state.on;

export function setNameCheck(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* not remembered */
  }
  set({ on });
  if (on) start();
}

/** The privacy-filter model's finds in `text`, read in pieces split at paragraph breaks. */
export async function findPrivate(text: string): Promise<Found[]> {
  const w = start();
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > CHUNK) {
    const cut = rest.lastIndexOf("\n", CHUNK);
    const at = cut > CHUNK / 2 ? cut : CHUNK;
    pieces.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  if (rest.trim()) pieces.push(rest);
  const found = await Promise.all(
    pieces.map(
      (piece) =>
        new Promise<Found[]>((resolve, reject) => {
          const id = nextId++;
          waiting.set(id, { resolve, reject });
          w.postMessage({ type: "find", id, text: piece } satisfies ToWorker);
        }),
    ),
  );
  return found.flat();
}

/** For a cloud question: what to pass to `build` so the model's finds are masked too (nothing while it's off). */
export const detector = () => (state.on ? findPrivate : undefined);

export function useNameCheck() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    if (state.on) start();
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
