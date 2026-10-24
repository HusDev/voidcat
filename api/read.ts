import { AREAS } from "../src/lib/filing";

/** The API's checks, kept apart from the server so they can be tested without Google. */

const MAX_CHARS = 60_000;
const MAX_FOLDERS = 300;

export type Filed = { title: string; docType: string; area: string; folder: string; facts: { label: string; value: string; page: number | null }[] };

/** What a browser may send: the masked text and its existing folders ("Area › Folder", masked too). */
export function parseRequest(body: unknown): { text: string; folders: string[] } | string {
  if (!body || typeof body !== "object") return "Send JSON.";
  const { text, folders } = body as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim()) return "No text to read.";
  if (text.length > MAX_CHARS) return `The text is too long (over ${MAX_CHARS.toLocaleString("en")} characters).`;
  if (folders !== undefined && (!Array.isArray(folders) || folders.length > MAX_FOLDERS || folders.some((f) => typeof f !== "string" || f.length > 200)))
    return "Folders must be a short list of names.";
  return { text, folders: (folders as string[] | undefined) ?? [] };
}

/** The model's answer, checked: a known area, at most 12 facts, strings trimmed. */
export function parseFiled(raw: string): Filed {
  const j = JSON.parse(raw) as Partial<Filed>;
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const area = AREAS.find((a) => a === j.area) ?? "Other";
  return {
    title: str(j.title) || "Document",
    // snake_case, like the Mac's: "Rental contract" → rental_contract.
    docType: str(j.docType, 60).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "document",
    area,
    folder: str(j.folder, 80) || "General",
    facts: (Array.isArray(j.facts) ? j.facts : [])
      .slice(0, 12)
      .map((f) => ({ label: str(f?.label, 120), value: str(f?.value, 500), page: Number.isInteger(f?.page) && (f.page as number) > 0 ? (f.page as number) : null }))
      .filter((f) => f.label && f.value),
  };
}

export const month = (now = new Date()) => now.toISOString().slice(0, 7);


export type Turn = { role: "user" | "assistant"; content: string };
const MAX_TURNS = 40;
const MAX_ASK_CHARS = 200_000;

/** An Ask conversation from a browser: masked turns ending with the question, and the browser's date. */
export function parseAsk(body: unknown): { messages: Turn[]; today: Date } | string {
  if (!body || typeof body !== "object") return "Send JSON.";
  const { messages, today } = body as Record<string, unknown>;
  if (!Array.isArray(messages) || !messages.length) return "No question.";
  if (messages.length > MAX_TURNS) return "This conversation is too long; start a new one.";
  const turns: Turn[] = [];
  let total = 0;
  for (const m of messages) {
    const { role, content } = (m ?? {}) as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return "Each turn needs a role and some text.";
    total += content.length;
    turns.push({ role, content });
  }
  if (total > MAX_ASK_CHARS) return "This conversation is too long; start a new one.";
  if (turns[turns.length - 1].role !== "user") return "The last turn must be your question.";
  const day = typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today) ? new Date(`${today}T12:00:00Z`) : new Date();
  return { messages: turns, today: Number.isNaN(day.getTime()) ? new Date() : day };
}

/** Bots and link previews follow the Download link too; only a real browser's GET counts as a download. */
export function countsAsDownload(method: string, userAgent: string | null): boolean {
  if (method !== "GET" || !userAgent) return false;
  return !/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|curl|wget|python|go-http|java\/|okhttp/i.test(userAgent);
}
