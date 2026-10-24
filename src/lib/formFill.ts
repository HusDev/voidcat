import { z } from "zod";
import type { Run } from "./signing";

/**
 * Suggesting what to write on a form: the empty places on its pages (a label with room after it, a line of ____ or
 * ....., or one of the PDF's own boxes), and which of your facts goes in each. The local model only matches numbered
 * places to numbered facts, so every value suggested is one of your approved facts, word for word.
 */

/** An empty place to write: on a page (where the text would start, as fractions of the page) or one of the form's boxes. */
export type Blank = { id: string; label: string } & ({ kind: "page"; page: number; x: number; y: number } | { kind: "field"; field: string });

/** A value you could write there: one of your facts. */
export type Known = { id: string; label: string; value: string };

/** A suggestion: this value in that place. */
export type Suggestion = { blank: Blank; value: string; from: string };

const MAX_BLANKS = 80;
const LINE = /_{3,}|\.{4,}|…{2,}/;
const sameLine = (a: Run, b: Run) => Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < Math.max(a.h, b.h) * 0.6;
const tidy = (s: string) => s.replace(/[_.…:]+\s*$/, "").replace(/\s+/g, " ").trim();

/**
 * The empty places on the pages, in reading order: a run with a line of underscores or dots in it (the place starts
 * where the line does; the label is the words before it, or the run to its left), and a short run ending in ":" with
 * nothing near it on its right.
 */
export function findBlanks(pages: Run[][]): Blank[] {
  const out: Blank[] = [];
  pages.forEach((runs, p) => {
    // Lines from top to bottom, each read left to right.
    const lines: Run[][] = [];
    for (const r of [...runs].sort((a, b) => a.y - b.y)) {
      const line = lines.find((l) => sameLine(l[0], r));
      if (line) line.push(r);
      else lines.push([r]);
    }
    const order = lines.flatMap((l) => l.sort((a, b) => a.x - b.x));
    order.forEach((run, i) => {
      const left = order.slice(0, i).filter((r) => sameLine(r, run) && r.x < run.x).pop();
      const line = run.str.match(LINE);
      if (line && line.index !== undefined) {
        const before = tidy(run.str.slice(0, line.index));
        const label = before || (left ? tidy(left.str) : "");
        if (!label) return;
        const at = run.x + (run.w * line.index) / Math.max(run.str.length, 1);
        out.push({ id: "", kind: "page", label, page: p + 1, x: at + 0.004, y: run.y });
        return;
      }
      const text = run.str.trim();
      if (!text.endsWith(":") || text.length > 60 || text.length < 3) return;
      const right = order.find((r) => r !== run && sameLine(r, run) && r.x > run.x + run.w - 0.001);
      if (right && right.x - (run.x + run.w) < 0.12) return;
      out.push({ id: "", kind: "page", label: tidy(text), page: p + 1, x: run.x + run.w + 0.008, y: run.y });
    });
  });
  return out.slice(0, MAX_BLANKS).map((b, i) => ({ ...b, id: `B${i + 1}` }));
}

/** The form's own boxes as places to fill, numbered after the ones on the pages. */
export function fieldBlanks(fields: { name: string; label: string }[], after: number): Blank[] {
  return fields.slice(0, MAX_BLANKS).map((f, i) => ({ id: `B${after + i + 1}`, kind: "field", field: f.name, label: f.label }));
}

export const Fills = z.object({
  fills: z
    .array(z.object({ blank: z.string().describe("A place id, like B3"), fact: z.string().describe("The fact id that goes there, like F2, or TODAY for today's date") }))
    .describe("Only places you are sure about; leave the rest out"),
});

export const FILL_SYSTEM = `You help the owner of a document library fill in a form about themselves.
You get the form's empty places (id | page | the words next to it) and the owner's facts (id | label | value).
For each place, pick the one fact that answers it for the owner, or TODAY when the place asks for today's or the signing date.
Leave a place out when no fact clearly fits, when it asks about someone else (a landlord, a company, an official), or when it is for office use.
Match by meaning across languages (Nombre = first name, Apellidos = surnames, Domicilio = address, NIE/DNI/Pasaporte = ID numbers, Fecha de nacimiento = birth date, Nacionalidad = nationality).
Use each place once. Answer only with ids.`;

export function fillPrompt(blanks: Blank[], known: Known[]) {
  const places = blanks.map((b) => `${b.id} | ${b.kind === "page" ? `page ${b.page}` : "form box"} | ${b.label}`);
  const facts = known.map((k) => `${k.id} | ${k.label} | ${k.value}`);
  return `Empty places:\n${places.join("\n")}\n\nThe owner's facts:\n${facts.join("\n")}`;
}

/** The model's answer as suggestions: made-up ids dropped, one value per place, TODAY as today's date. */
export function resolveFills(answer: z.infer<typeof Fills>, blanks: Blank[], known: Known[], today: string): Suggestion[] {
  const places = new Map(blanks.map((b) => [b.id, b]));
  const facts = new Map(known.map((k) => [k.id, k]));
  const seen = new Set<string>();
  return answer.fills.flatMap(({ blank, fact }) => {
    const place = places.get(blank.trim().toUpperCase());
    const id = fact.trim().toUpperCase();
    const value = id === "TODAY" ? { value: today, label: "Today" } : facts.get(id);
    if (!place || !value || seen.has(place.id)) return [];
    seen.add(place.id);
    return [{ blank: place, value: value.value, from: value.label }];
  });
}
