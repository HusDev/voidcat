import { useSyncExternalStore } from "react";
import { fileDocument, saveFiling } from "./extract";
import { scanContacts } from "./people";
import { announceChange, type Document, listFolders } from "./library";
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
      if (reading.method !== "unsupported" && !reading.pages.some((p) => p.trim())) {
        set(doc.id, { stage: "failed", message: "No text found in this document." });
        continue;
      }
      if (reading.method === "unsupported") {
        set(doc.id, { stage: "failed", message: "Voidcat can't read this file type yet." });
        continue;
      }
      set(doc.id, { stage: "filing" });
      const filing = await fileDocument(reading.pages, await listFolders());
      await saveFiling(doc.id, filing);
      // Contacts come second: a document is filed even if this step fails (it can be retried from Contacts).
      await scanContacts({ id: doc.id, title: filing.title }).catch(() => {});
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
