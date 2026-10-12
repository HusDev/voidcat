import { invoke } from "@tauri-apps/api/core";
import type { Document, Fact } from "./library";
import { kindOfLabel, parseDate } from "./privacy";

/**
 * The calendar: every date in the user's approved facts, plus dates worked out from them (renewals, monthly payments)
 * and events added by hand. Worked out fresh each time, so it always follows the facts; only manual events, done marks,
 * papers checklists and shown reminders are stored (`src-tauri/src/calendar.rs`).
 */

export type Kind = "appointment" | "deadline" | "expires" | "payment" | "contract" | "work" | "other";

export type CalEvent = {
  /** Stable id: fact:<id>, renew:<id>, pay:<id>:<yyyy-mm>, manual:<id> */
  key: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, local time */
  time?: string;
  place?: string;
  kind: Kind;
  detail?: string;
  documentId?: string;
  documentTitle?: string;
  origin: "fact" | "worked-out" | "manual";
  manualId?: string;
};

export type ManualEvent = { id: string; title: string; date: string; time: string | null; place: string | null; kind: Kind; documentId: string | null; notes: string | null };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const fromIso = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

const NUMBER_WORDS: Record<string, number> = {
  uno: 1, una: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6,
  siete: 7, seven: 7, ocho: 8, eight: 8, nueve: 9, nine: 9, diez: 10, ten: 10, quince: 15, fifteen: 15,
};

/** "del 1 al 5 de cada mes", "dentro de los siete primeros días", "by the 5th of each month" → the last day to pay. */
export function monthlyDueDay(value: string): number | null {
  const v = value.toLowerCase();
  let m =
    v.match(/al\s+(\d{1,2})\s+de\s+cada\s+mes/) ??
    v.match(/(\d{1,2})\s*(?:primeros|first)\s+(?:días|dias|days)/) ??
    v.match(/(?:primeros|first)\s+(\d{1,2})\s+(?:días|dias|days)/);
  if (m) return Math.min(+m[1], 28);
  m = v.match(/(?:primeros|first)\s+([a-zá-ú]+)\s+(?:días|dias|days)/) ?? v.match(/(?:los|the)\s+([a-zá-ú]+)\s+(?:primeros|first)\s+(?:días|dias|days)/);
  if (m && NUMBER_WORDS[m[1]]) return NUMBER_WORDS[m[1]];
  m = v.match(/(?:día|dia|day|by the)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:de\s+cada\s+mes|of\s+(?:each|every)\s+month)/);
  if (m) return Math.min(+m[1], 28);
  return null;
}

/** What a dated fact means, from its label. null = history (issued, born, signed), not something to remind about. */
export function dateKind(label: string): { kind: Kind; verb: string } | null {
  const l = label.toLowerCase();
  if (/birth|nacimiento|issued|issue date|expedici|emisi|signed|firma|date of contract|fecha del contrato/.test(l)) return null;
  if (/appointment|cita/.test(l)) return { kind: "appointment", verb: "Appointment" };
  if (/valid|expir|caduc|until|hasta|vence|vencimiento|valid to/.test(l)) return { kind: "expires", verb: "Expires" };
  if (/deadline|due|plazo|limit|before|antes/.test(l)) return { kind: "deadline", verb: "Deadline" };
  if (/end|fin\b|finaliza|termination|ends/.test(l)) return { kind: "contract", verb: "Ends" };
  if (/start|inicio|begins|effective|desde|from/.test(l)) return { kind: "contract", verb: "Starts" };
  return { kind: "other", verb: label };
}

/** IDs and permits worth renewing ahead of their expiry. */
const RENEWABLE = /passport|pasaporte|residen|tie\b|card|tarjeta|permit|permiso|autorizaci|licen|dni|nie|visa|id\b/i;
const RENEW_DAYS_BEFORE = 60;

/** Every reminder-worthy date in the approved facts, plus the dates worked out from them. Past ones are left out. */
export function eventsFromFacts(facts: Fact[], docs: Document[], today: Date): CalEvent[] {
  const now = dayStart(today);
  const docOf = new Map(docs.map((d) => [d.id, d]));
  const out: CalEvent[] = [];

  for (const f of facts) {
    const doc = docOf.get(f.documentId);
    const base = { documentId: f.documentId, documentTitle: f.documentTitle };

    const due = /rent|renta|alquiler|pago|payment|cuota/i.test(f.label) ? monthlyDueDay(f.value) : null;
    if (due) {
      const amount = facts.find((x) => x.documentId === f.documentId && /monthly rent|renta mensual|rent$|^rent|importe|amount/i.test(x.label) && x.id !== f.id);
      // The next two due dates from today.
      const first = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > due ? 1 : 0), due);
      for (let i = 0; i < 2; i++) {
        const d = new Date(first.getFullYear(), first.getMonth() + i, due);
        out.push({ ...base, key: `pay:${f.id}:${iso(d).slice(0, 7)}`, title: `Pay ${/rent|renta|alquiler|arrend|lease/i.test(`${f.label} ${f.documentTitle} ${doc?.docType ?? ""}`) ? "rent" : f.label.toLowerCase()}${amount ? ` · ${amount.value}` : ""}`, date: iso(d), kind: "payment", detail: f.value, origin: "worked-out" });
      }
      continue;
    }

    if (kindOfLabel(f.label) !== "DATE") continue;
    const date = parseDate(f.value);
    const meaning = dateKind(f.label);
    if (!date || !meaning) continue;

    if (meaning.kind === "expires" && RENEWABLE.test(`${f.documentTitle} ${doc?.docType ?? ""}`)) {
      const renew = addDays(date, -RENEW_DAYS_BEFORE);
      if (renew >= now)
        out.push({ ...base, key: `renew:${f.id}`, title: `Book the renewal · ${f.documentTitle}`, date: iso(renew), kind: "deadline", detail: `${RENEW_DAYS_BEFORE} days before it expires`, origin: "worked-out" });
    }
    if (date < now) continue;

    const sameDoc = facts.filter((x) => x.documentId === f.documentId);
    const time = meaning.kind === "appointment" ? sameDoc.map((x) => x.value.match(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/)).find(Boolean) : null;
    const place = meaning.kind === "appointment" ? sameDoc.find((x) => /place|office|oficina|lugar|sede|address|direcci/i.test(x.label))?.value : undefined;
    out.push({
      ...base,
      key: `fact:${f.id}`,
      title: meaning.kind === "other" ? `${f.documentTitle} · ${f.label}` : `${f.documentTitle} · ${meaning.verb.toLowerCase()}`,
      date: iso(date),
      time: time ? `${time[1].padStart(2, "0")}:${time[2]}` : undefined,
      place,
      kind: meaning.kind,
      detail: `${f.label}: ${f.value}`,
      origin: "fact",
    });
  }
  return out;
}

export const fromManual = (e: ManualEvent, docs: Document[]): CalEvent => ({
  key: `manual:${e.id}`,
  manualId: e.id,
  title: e.title,
  date: e.date,
  time: e.time ?? undefined,
  place: e.place ?? undefined,
  kind: e.kind,
  detail: e.notes ?? undefined,
  documentId: e.documentId ?? undefined,
  documentTitle: docs.find((d) => d.id === e.documentId)?.title,
  origin: "manual",
});

/** When each kind of event is reminded, in minutes before it starts. */
export const REMINDERS: Record<Kind, { minutes: number; label: string }[]> = {
  appointment: [
    { minutes: 24 * 60, label: "tomorrow" },
    { minutes: 60, label: "in 1 hour" },
  ],
  expires: [
    { minutes: 90 * 24 * 60, label: "in 3 months" },
    { minutes: 30 * 24 * 60, label: "in 1 month" },
    { minutes: 7 * 24 * 60, label: "in 1 week" },
  ],
  deadline: [
    { minutes: 7 * 24 * 60, label: "in 1 week" },
    { minutes: 24 * 60, label: "tomorrow" },
  ],
  payment: [{ minutes: 2 * 24 * 60, label: "in 2 days" }],
  contract: [
    { minutes: 60 * 24 * 60, label: "in 2 months" },
    { minutes: 7 * 24 * 60, label: "in 1 week" },
  ],
  work: [{ minutes: 7 * 24 * 60, label: "in 1 week" }],
  other: [{ minutes: 24 * 60, label: "tomorrow" }],
};

/** When the event starts: its time, or 9:00 for all-day dates. */
export const startOf = (e: CalEvent) => {
  const d = fromIso(e.date);
  const [h, m] = (e.time ?? "09:00").split(":").map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
};

/**
 * Reminders due now: for each upcoming event, only the most recent reminder time that has passed (so a Mac that was
 * off doesn't get every older reminder at once). The key makes each reminder show once.
 */
export function dueReminders(events: CalEvent[], now: Date, done: Set<string>) {
  const due: { key: string; event: CalEvent; when: string }[] = [];
  for (const e of events) {
    const start = startOf(e);
    if (done.has(e.key) || start <= now) continue;
    const passed = REMINDERS[e.kind].filter((r) => start.getTime() - r.minutes * 60_000 <= now.getTime()).sort((a, b) => a.minutes - b.minutes)[0];
    if (passed) due.push({ key: `${e.key}@${passed.minutes}`, event: e, when: passed.label });
  }
  return due;
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (d: Date) => iso(d).replace(/-/g, "");
const icsTime = (e: CalEvent) => `${e.date.replace(/-/g, "")}T${(e.time ?? "09:00").replace(":", "")}00`;

/** An .ics file for Apple or Google Calendar, with the same reminders as the app. Stable UIDs so re-imports update. */
export function toIcs(events: CalEvent[], stamp = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SafeBox//Calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:SafeBox"];
  const dtstamp = `${stamp.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.key.replace(/[^\w:.-]/g, "-")}@safebox`, `DTSTAMP:${dtstamp}`, `SUMMARY:${icsText(e.title)}`);
    if (e.time) {
      const end = new Date(startOf(e).getTime() + 60 * 60_000);
      lines.push(`DTSTART:${icsTime(e)}`, `DTEND:${icsDate(end)}T${String(end.getHours()).padStart(2, "0")}${String(end.getMinutes()).padStart(2, "0")}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${icsDate(addDays(fromIso(e.date), 1))}`);
    }
    if (e.place) lines.push(`LOCATION:${icsText(e.place)}`);
    if (e.detail) lines.push(`DESCRIPTION:${icsText(e.detail)}`);
    for (const r of REMINDERS[e.kind]) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${r.minutes}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

/** The days to draw for a month, Monday first; null cells pad the first week. */
export function monthCells(year: number, month: number): (number | null)[] {
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

/** How a paper on a checklist matches a document in the library: by shared words in title, type or folder. */
export function matchPaper(name: string, docs: Document[]): Document | null {
  const words = (s: string) => new Set(s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/[^\p{L}\d]+/u).filter((w) => w.length > 2));
  const want = words(name);
  let best: { doc: Document; score: number } | null = null;
  for (const d of docs) {
    const have = words(`${d.title} ${d.docType ?? ""} ${d.folderName ?? ""}`.replace(/_/g, " "));
    const score = [...want].filter((w) => have.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { doc: d, score };
  }
  return best?.doc ?? null;
}

export const listManualEvents = () => invoke<ManualEvent[]>("list_events");
export const addEvent = (e: Omit<ManualEvent, "id">) => invoke<string>("add_event", { event: e });
export const removeEvent = (id: string) => invoke<void>("remove_event", { id });
export const setEventDone = (key: string, done: boolean) => invoke<void>("set_event_done", { key, done });
export const doneKeys = () => invoke<string[]>("done_event_keys");
export type Paper = { id?: string; name: string; documentId: string | null };
export const eventPapers = (key: string) => invoke<Paper[]>("event_papers", { key });
export const setEventPapers = (key: string, papers: Paper[]) => invoke<void>("set_event_papers", { key, papers });
export const claimReminder = (key: string) => invoke<boolean>("claim_reminder", { key });
export const saveCalendarFile = (path: string, content: string) => invoke<void>("save_calendar_file", { path, content });
