import { useSyncExternalStore } from "react";
import { fileDocument, saveFiling } from "./extract";
import { announceChange, type Document } from "./library";
import { readDocument, saveReading } from "./reader";

/**
 * Processes documents one at a time: read the text, then file it and find facts with the local model.
 * Progress is shared so every screen (cards, sidebar badge) sees it.
 */

export type Step = { stage: "queued" | "reading" | "filing" | "done" | "failed"; message?: string };

const steps = new Map<string, Step>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  for (const l of listeners) l();
};
const set = (id: string, s: Step) => {
  steps.set(id, s);
  emit();
};

let queue: Document[] = [];
let running = false;

export function process(docs: Document[]) {
  for (const d of docs) {
    if (steps.get(d.id)?.stage === "queued" || steps.get(d.id)?.stage === "reading" || steps.get(d.id)?.stage === "filing") continue;
    set(d.id, { stage: "queued" });
    queue.push(d);
  }
  void run();
}

async function run() {
  if (running) return;
  running = true;
  while (queue.length) {
    const [doc] = queue;
    queue = queue.slice(1);
    try {
      set(doc.id, { stage: "reading" });
      const reading = await readDocument(doc);
      await saveReading(doc.id, reading);
      if (reading.method === "needs-ocr") {
        set(doc.id, { stage: "failed", message: "This is a scan with no text. Reading scans is coming next." });
        continue;
      }
      if (reading.method === "unsupported") {
        set(doc.id, { stage: "failed", message: "SafeBox can't read this file type yet." });
        continue;
      }
      set(doc.id, { stage: "filing" });
      await saveFiling(doc.id, await fileDocument(reading.pages));
      set(doc.id, { stage: "done" });
      announceChange();
    } catch (e) {
      set(doc.id, { stage: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  }
  running = false;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Re-renders whenever any document's progress changes; returns the current step for each id. */
export function useProgress() {
  useSyncExternalStore(subscribe, () => version);
  return steps;
}
