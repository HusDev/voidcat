import { PDFCheckBox, PDFDocument, PDFDropdown, type PDFFont, PDFRadioGroup, PDFTextField, StandardFonts, degrees, rgb } from "pdf-lib";

/**
 * Signing a document with a visible signature: where it goes, and the signed PDF. Positions are fractions of the page
 * as shown on screen (top-left origin, after the page's own rotation), so the on-screen boxes and the PDF agree.
 */

/** Something placed on a page: your signature, or text (a date, a place, a printed name, a tick). */
export type Placed =
  | { id: string; page: number; kind: "signature"; x: number; y: number; w: number; h: number }
  | { id: string; page: number; kind: "text"; x: number; y: number; text: string; size: number };

/** A run of text on a page, with its box as fractions of the page shown on screen. */
export type Run = { str: string; x: number; y: number; w: number; h: number };

/** The words that ask for a signature, in the languages Voidcat's papers come in. */
const SIGN_WORDS = /\b(firma|firmado|fdo\.?|signature|signed|sign here|unterschrift|assinatura|signature du)\b/i;

/** The spot the Unsigned label pointed at: `Nothing signed at “Firma del arrendatario” (page 6)`. */
export function unsignedHint(note: string | null | undefined) {
  const m = note?.match(/“(.+)” \(page (\d+)\)/);
  return m ? { quote: m[1], page: Number(m[2]) } : null;
}

export const SIGNATURE_W = 0.24;
export const SIGNATURE_H = 0.07;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * Where a signature most likely goes: just above the words that ask for it. The Unsigned label's words and page are
 * tried first; then any "Firma"/"Signature" words, from the last page back (signatures come at the end). Null when
 * nothing asks for one.
 */
export function findSpot(pages: Run[][], hint?: { quote: string; page: number } | null): { page: number; x: number; y: number } | null {
  const flat = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const quote = hint ? flat(hint.quote) : "";
  const order = [...pages.keys()].reverse();
  if (hint && hint.page >= 1 && hint.page <= pages.length) order.unshift(hint.page - 1);
  const matches: ((r: Run) => boolean)[] = [];
  if (quote) matches.push((r) => flat(r.str).length >= 3 && (quote.includes(flat(r.str)) || flat(r.str).includes(quote)));
  matches.push((r) => SIGN_WORDS.test(r.str));
  for (const match of matches)
    for (const p of order) {
      const found = pages[p]?.filter(match) ?? [];
      const run = found[found.length - 1];
      if (run) return { page: p + 1, x: clamp(run.x + run.w / 2 - SIGNATURE_W / 2, 0.02, 0.98 - SIGNATURE_W), y: clamp(run.y - SIGNATURE_H - 0.004, 0.01, 0.99 - SIGNATURE_H) };
    }
  return null;
}

/**
 * A point on the page as shown (fractions, top-left origin, after `rotation`) in the page's own PDF space (points,
 * bottom-left origin), for a page `width` × `height` points before rotation.
 */
export function toPdfPoint(u: number, v: number, width: number, height: number, rotation: number) {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: v * width, y: u * height };
    case 180:
      return { x: (1 - u) * width, y: v * height };
    case 270:
      return { x: (1 - v) * width, y: (1 - u) * height };
    default:
      return { x: u * width, y: (1 - v) * height };
  }
}

/** Text the standard PDF font can't write ("ł", Arabic…) becomes "?" rather than failing the whole save. */
export function writable(font: PDFFont, text: string) {
  return [...text]
    .map((c) => {
      try {
        font.encodeText(c);
        return c;
      } catch {
        return "?";
      }
    })
    .join("");
}

/** A box the PDF itself has for filling in (an AcroForm field): text, a tick box, or a choice of options. */
export type FormField =
  | { name: string; kind: "text"; value: string; multiline: boolean }
  | { name: string; kind: "check"; value: boolean }
  | { name: string; kind: "choice"; value: string; options: string[] };

/** What you typed into the PDF's own boxes, by field name. */
export type FieldValues = Record<string, string | boolean>;

/** The boxes a PDF form has for filling in, in the order the form lists them; empty for a plain PDF. */
export async function formFields(pdf: Uint8Array): Promise<FormField[]> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  return doc
    .getForm()
    .getFields()
    .flatMap((f): FormField[] => {
      const name = f.getName();
      if (f.isReadOnly()) return [];
      if (f instanceof PDFTextField) return [{ name, kind: "text", value: f.getText() ?? "", multiline: f.isMultiline() }];
      if (f instanceof PDFCheckBox) return [{ name, kind: "check", value: f.isChecked() }];
      if (f instanceof PDFDropdown) return [{ name, kind: "choice", value: f.getSelected()[0] ?? "", options: f.getOptions() }];
      if (f instanceof PDFRadioGroup) return [{ name, kind: "choice", value: f.getSelected() ?? "", options: f.getOptions() }];
      return [];
    });
}

/**
 * Fills the PDF's own boxes and flattens the form, so what you typed is part of the page (it shows the same in every
 * viewer, and text placed on top isn't hidden under a box's background). A form that can't be flattened keeps its boxes.
 */
function fillForm(doc: PDFDocument, font: PDFFont, values: FieldValues) {
  const form = doc.getForm();
  if (!form.getFields().length) return;
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    try {
      if (field instanceof PDFTextField) {
        const text = writable(font, String(value));
        const max = field.getMaxLength();
        field.setText(max ? text.slice(0, max) : text);
      } else if (field instanceof PDFCheckBox) {
        if (value) field.check();
        else field.uncheck();
      } else if ((field instanceof PDFDropdown || field instanceof PDFRadioGroup) && typeof value === "string" && field.getOptions().includes(value)) field.select(value);
    } catch {
      // A box that refuses the value keeps what it had.
    }
  }
  try {
    form.updateFieldAppearances(font);
    form.flatten();
  } catch {
    // Some forms' boxes can't be drawn into the page; they stay filled-in boxes.
  }
}

/**
 * The signed (or filled-in) PDF: the form's own boxes filled when `fields` is given, then each placed item drawn
 * into its page, part of the page from then on.
 */
export async function stampPdf(pdf: Uint8Array, items: Placed[], signaturePng: Uint8Array | null, fields?: FieldValues) {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  if (fields) fillForm(doc, font, fields);
  const image = signaturePng && items.some((i) => i.kind === "signature") ? await doc.embedPng(signaturePng) : null;
  const pages = doc.getPages();
  for (const item of items) {
    const page = pages[item.page - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle;
    // The page as shown is turned: its width on screen is the PDF's height.
    const [shownW, shownH] = rotation % 180 ? [height, width] : [width, height];
    if (item.kind === "signature") {
      if (!image) continue;
      const at = toPdfPoint(item.x, item.y + item.h, width, height, rotation);
      page.drawImage(image, { x: at.x, y: at.y, width: item.w * shownW, height: item.h * shownH, rotate: degrees(rotation) });
    } else {
      const text = writable(font, item.text.trim());
      if (!text) continue;
      // The text's baseline sits a little above the bottom of its box.
      const at = toPdfPoint(item.x, item.y + (item.size * 1.05) / shownH, width, height, rotation);
      page.drawText(text, { x: at.x, y: at.y, size: item.size, font, color: rgb(0.1, 0.12, 0.3), rotate: degrees(rotation) });
    }
  }
  return doc.save();
}

/** Today as forms in Spain and Europe write it: 19/10/2026. */
export const todayText = (now = new Date()) => `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

/** Pixels as a canvas holds them: RGBA, row by row. */
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/**
 * A photo of a signature on paper made into ink on nothing: light paper becomes see-through (softly, so edges stay
 * smooth), dark ink stays, and the picture is cut to the ink with a small margin. Null when there's no ink.
 */
export function cleanSignature(img: Pixels, paper = 185, soft = 70): Pixels | null {
  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) {
    const light = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
    out[i + 3] = Math.round(clamp((paper - light) / soft, 0, 1) * (img.data[i + 3] / 255) * 255);
  }
  return trimInk({ data: out, width: img.width, height: img.height });
}

/** A picture cut to where its ink is (alpha above a little), with a margin. Null when there's no ink. */
export function trimInk(img: Pixels, margin = 6): Pixels | null {
  let [left, top, right, bottom] = [img.width, img.height, -1, -1];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] > 24) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < 0) return null;
  [left, top] = [Math.max(0, left - margin), Math.max(0, top - margin)];
  [right, bottom] = [Math.min(img.width - 1, right + margin), Math.min(img.height - 1, bottom + margin)];
  const width = right - left + 1;
  const height = bottom - top + 1;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) data.set(img.data.subarray(((top + y) * img.width + left) * 4, ((top + y) * img.width + left + width) * 4), y * width * 4);
  return { data, width, height };
}
