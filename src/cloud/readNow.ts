import type { User } from "firebase/auth";
import { useSyncExternalStore } from "react";
import { call } from "../lib/backend";
import { folderName, pagesText } from "../lib/extract";
import { type Document, type Folder, type Fact, listFacts, listFolders } from "../lib/library";
import { findPrivate, setNameCheck } from "../lib/nameCheck";
import { Masker } from "../lib/privacy";
import { browserCanRead, readInBrowser } from "./browserReader";
import { apiUrl } from "./config";

/**
 * "Read now in the cloud", for a file added in a browser: its text is read in the browser, private details are
 * replaced by placeholders there (approved facts, the rules, and the privacy-filter model), and only that masked text
 * goes to voidcat-api, which asks Gemini in Belgium to file it. The answer's placeholders are filled back in here, each
 * fact is checked against the page, and the result is saved like a Mac reading (the Mac adopts it on its next sync).
 */

export type Step = { stage: "reading" | "masking" | "asking" | "saving" | "done" | "failed"; note: string; sent?: string; used?: number; limit?: number };

let steps = new Map<string, Step>();
const listeners = new Set<() => void>();
const set = (id: string, s: Step) => {
  steps = new Map(steps).set(id, s);
  for (const l of listeners) l();
};
export const useReadNow = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => steps,
  );

type Filed = { title: string; docType: string; area: string; folder: string; facts: { label: string; value: string; page: number | null }[] };

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The model's answer with real values back in. Facts whose value isn't on the page are dropped, as on the Mac. */
export function restore(filed: Filed, masker: Masker, pages: string[]) {
  const all = squash(pages.join("\n"));
  const facts = filed.facts
    .map((f) => ({ ...f, value: masker.unmask(f.value).trim(), label: masker.unmask(f.label).trim() }))
    .filter((f) => f.value && all.includes(squash(f.value)));
  return {
    title: masker.unmask(filed.title).trim() || "Document",
    docType: filed.docType,
    area: filed.area,
    folder: folderName(masker.unmask(filed.folder), filed.area) || "General",
    facts,
  };
}

/** The masked text and folder list exactly as they'd be sent. */
export function maskForCloud(pages: string[], masker: Masker, folders: Folder[]) {
  return { text: masker.mask(pagesText(pages)), folders: folders.map((f) => masker.mask(`${f.area} › ${f.name}`)) };
}

export async function readNow(doc: Document, user: User) {
  const can = browserCanRead(doc);
  if (can !== true) return set(doc.id, { stage: "failed", note: can });
  try {
    set(doc.id, { stage: "reading", note: "Reading the text in this browser…" });
    const reading = await readInBrowser(doc, (note) => set(doc.id, { stage: "reading", note }));
    if (!reading.pages.join("").trim()) throw new Error("No text was found in this file.");

    set(doc.id, { stage: "masking", note: "Hiding private details in this browser (the privacy model loads once)…" });
    const approved: Fact[] = await listFacts("approved");
    const masker = new Masker(approved);
    setNameCheck(true);
    masker.learnFound(await findPrivate(pagesText(reading.pages)));
    const body = maskForCloud(reading.pages, masker, await listFolders());

    set(doc.id, { stage: "asking", note: "Filing the masked text with Gemini in Belgium…", sent: body.text });
    const res = await fetch(`${apiUrl}/v1/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const answer = (await res.json().catch(() => ({}))) as { filed?: Filed; used?: number; limit?: number; error?: string };
    if (!res.ok || !answer.filed) throw new Error(answer.error ?? `The cloud couldn't read it (${res.status}).`);

    set(doc.id, { stage: "saving", note: "Saving, locked…", sent: body.text });
    const filed = restore(answer.filed, masker, reading.pages);
    await call("save_cloud_reading", { id: doc.id, method: reading.method, pages: reading.pages, ...filed });
    set(doc.id, {
      stage: "done",
      note: `Filed in ${filed.area} › ${filed.folder} with ${filed.facts.length} ${filed.facts.length === 1 ? "fact" : "facts"} to check.`,
      sent: body.text,
      used: answer.used,
      limit: answer.limit,
    });
  } catch (e) {
    set(doc.id, { stage: "failed", note: e instanceof Error ? e.message : String(e) });
  }
}
