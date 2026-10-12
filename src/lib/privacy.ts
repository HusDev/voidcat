/**
 * The privacy layer: before any text leaves this Mac, personal details are swapped for placeholders like [ID_1].
 * The swap is reversible, and only this Mac holds the key, so answers come back with the real values put in.
 *
 * What is masked, in order:
 * 1. Values of the user's approved facts (the strongest signal of what's personal).
 * 2. Patterns: emails, IBANs, Spanish NIE/DNI, passport and card numbers, phone numbers, dates.
 * Dates become [DATE_n] plus a note like "about 5 months from now", so the model can still reason about time.
 * Amounts are kept: on their own they don't identify anyone, and questions about money need them.
 */

export type Kind = "PERSON" | "ID" | "DATE" | "ADDRESS" | "EMAIL" | "PHONE" | "IBAN" | "PRIVATE";

export type Masked = { token: string; kind: Kind; original: string; note?: string };

export type KnownFact = { label: string; value: string };

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, ene: 0, enero: 0, feb: 1, february: 1, febrero: 1, mar: 2, march: 2, marzo: 2, apr: 3, april: 3, abr: 3, abril: 3,
  may: 4, mayo: 4, jun: 5, june: 5, junio: 5, jul: 6, july: 6, julio: 6, aug: 7, august: 7, ago: 7, agosto: 7, sep: 8, sept: 8, september: 8,
  septiembre: 8, oct: 9, october: 9, octubre: 9, nov: 10, november: 10, noviembre: 10, dec: 11, december: 11, dic: 11, diciembre: 11,
};
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

/** Patterns, most specific first, so an IBAN isn't read as a phone number. */
const PATTERNS: [Kind, RegExp][] = [
  ["EMAIL", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ["IBAN", /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g],
  ["ID", /\b[XYZ]-?\d{7}-?[A-Z]\b/g], // NIE
  ["ID", /\b\d{8}-?[A-Z]\b/g], // DNI
  ["ID", /\b[A-Z]{1,2}\d{6,9}\b/g], // passport, TIE card and similar
  ["DATE", new RegExp(`\\b\\d{1,2}(?:\\s+de)?\\s+(?:${MONTH_NAMES})\\.?(?:\\s+de)?\\s+\\d{4}\\b`, "gi")],
  ["DATE", new RegExp(`\\b(?:${MONTH_NAMES})\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`, "gi")],
  ["DATE", /\b\d{4}-\d{2}-\d{2}\b/g],
  ["DATE", /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b/g],
  ["PHONE", /(?:\+\d{1,3}[ .-]?)?\(?\d{2,4}\)?(?:[ .-]?\d{2,4}){2,4}\b/g],
];

/** Guesses what kind of detail a fact holds from its label. */
export function kindOfLabel(label: string): Kind {
  const l = label.toLowerCase();
  if (/e-?mail|correo/.test(l)) return "EMAIL";
  if (/phone|tel[eé]fono|móvil|mobile/.test(l)) return "PHONE";
  if (/iban|account|cuenta/.test(l)) return "IBAN";
  if (/address|street|domicilio|direcci[oó]n|calle|carrer/.test(l)) return "ADDRESS";
  if (/date|valid|issued|expir|start|end|born|birth|fecha|caduc/.test(l)) return "DATE";
  if (/number|n[uú]mero|\bno\b|nie|dni|nif|passport|pasaporte|card|tarjeta|\bid\b|expediente|reference|referencia/.test(l)) return "ID";
  if (/name|nombre|landlord|tenant|employer|owner|person|arrendador|arrendatario|lawyer|abogad|signed|firmado/.test(l)) return "PERSON";
  return "PRIVATE";
}

/** Reads a date written in any of the formats above. */
export function parseDate(s: string): Date | null {
  const t = s.trim().toLowerCase();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = t.match(/^(\d{1,2})(?:\s+de)?\s+([a-záéíóú]+)\.?(?:\s+de)?\s+(\d{4})$/);
  if (m && m[2] in MONTHS) return new Date(+m[3], MONTHS[m[2]], +m[1]);
  m = t.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && m[1] in MONTHS) return new Date(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

/** "about 5 months from now", "about 2 years ago": enough to reason with, without the exact date. */
export function relative(date: Date, today: Date): string {
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const n = Math.abs(days);
  const amount = n < 14 ? `${n} ${n === 1 ? "day" : "days"}` : n < 60 ? `${Math.round(n / 7)} weeks` : n < 730 ? `${Math.round(n / 30.4)} months` : `${Math.round(n / 365)} years`;
  if (days === 0) return "today";
  return days > 0 ? `about ${amount} from now` : `about ${amount} ago`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Values too generic to be personal ("1 year", "Good"): masking them only hurts the answer. */
const worthMasking = (value: string, kind: Kind) => {
  const v = value.trim();
  if (v.length < 4) return false;
  if (kind === "PRIVATE") return (v.match(/\d/g) ?? []).length >= 3;
  return true;
};

export class Masker {
  private byOriginal = new Map<string, Masked>();
  private counts = new Map<Kind, number>();
  private known: { value: string; kind: Kind }[];

  constructor(
    facts: KnownFact[],
    private today = new Date(),
  ) {
    this.known = facts
      .map((f) => ({ value: f.value.trim(), kind: kindOfLabel(f.label) }))
      .filter((f) => worthMasking(f.value, f.kind))
      .sort((a, b) => b.value.length - a.value.length);
  }

  private tokenFor(original: string, kind: Kind): string {
    const key = original.trim().toLowerCase();
    const seen = this.byOriginal.get(key);
    if (seen) return seen.token;
    const n = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, n);
    const date = kind === "DATE" ? parseDate(original) : null;
    const entry: Masked = { token: `[${kind}_${n}]`, kind, original: original.trim(), note: date ? relative(date, this.today) : undefined };
    this.byOriginal.set(key, entry);
    return entry.token;
  }

  /**
   * Replaces every personal detail in `text` with its placeholder. The same value always gets the same placeholder,
   * and placeholders are numbered in the order they appear. Known facts win over patterns when both match.
   */
  mask(text: string): string {
    const spans: { start: number; end: number; kind: Kind }[] = [];
    const free = (start: number, end: number) => spans.every((s) => end <= s.start || start >= s.end);
    const take = (re: RegExp, kind: Kind) => {
      for (const m of text.matchAll(re)) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (kind === "PHONE" && m[0].replace(/\D/g, "").length < 9) continue;
        if (free(start, end)) spans.push({ start, end, kind });
      }
    };
    for (const f of this.known) take(new RegExp(escape(f.value), "gi"), f.kind);
    for (const [kind, re] of PATTERNS) take(re, kind);

    spans.sort((a, b) => a.start - b.start);
    let out = "";
    let at = 0;
    for (const s of spans) {
      out += text.slice(at, s.start) + this.tokenFor(text.slice(s.start, s.end), s.kind);
      at = s.end;
    }
    return out + text.slice(at);
  }

  /** Puts the real values back. Also accepts placeholders the model wrote without brackets. */
  unmask(text: string): string {
    const byToken = new Map([...this.byOriginal.values()].map((e) => [e.token.slice(1, -1), e.original]));
    return text.replace(/\[?\b((?:PERSON|ID|DATE|ADDRESS|EMAIL|PHONE|IBAN|PRIVATE)_\d+)\b\]?/g, (whole, token: string) => byToken.get(token) ?? whole);
  }

  /** Everything masked so far, in the order it was found. */
  entries(): Masked[] {
    return [...this.byOriginal.values()];
  }

  /** Notes the model may see: how far away each date is, never the date itself. */
  notes(): string[] {
    return this.entries()
      .filter((e) => e.note)
      .map((e) => `${e.token} is ${e.note}.`);
  }
}
