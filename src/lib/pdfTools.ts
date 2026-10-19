import { PDFDocument, degrees } from "pdf-lib";

/**
 * The PDF tools' work on bytes: several PDFs into one, and a PDF's pages picked, put in another order and turned.
 * Making something into a PDF first (photos, notes) is `asPdf`.
 */

/** PDFs one after the other, every page kept. */
export async function combine(pdfs: Uint8Array[]) {
  const out = await PDFDocument.create();
  for (const bytes of pdfs) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
  }
  return out.save();
}

/** A page to keep: its number in the original (from 1), turned by `turn` degrees clockwise (0, 90, 180, 270). */
export type Pick = { page: number; turn: number };

/** A new PDF of the picked pages, in the order given, each turned as asked on top of its own rotation. */
export async function rearrange(pdf: Uint8Array, picks: Pick[]) {
  const src = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const count = src.getPageCount();
  const kept = picks.filter((p) => p.page >= 1 && p.page <= count);
  if (!kept.length) throw new Error("Pick at least one page.");
  const out = await PDFDocument.create();
  const pages = await out.copyPages(
    src,
    kept.map((p) => p.page - 1),
  );
  pages.forEach((page, i) => {
    page.setRotation(degrees((((page.getRotation().angle + kept[i].turn) % 360) + 360) % 360));
    out.addPage(page);
  });
  return out.save();
}

/**
 * The text of each page of a combined document, from its sources' read pages: page for page when a source's PDF has
 * as many pages as were read, else all its text on its first page (a note laid out over several pages).
 */
export function combinedText(sources: { read: string[]; pdfPages: number }[]) {
  return sources.flatMap(({ read, pdfPages }) => {
    if (read.length === pdfPages) return read;
    return Array.from({ length: pdfPages }, (_, i) => (i === 0 ? read.join("\n\n") : ""));
  });
}

/** The text of each picked page, from the original's read pages. */
export const pickedText = (read: string[], picks: Pick[]) => picks.map((p) => read[p.page - 1] ?? "");

/** "Lease, pages 1–3, 5": a name for picked pages. */
export function pagesName(title: string, pages: number[]) {
  const runs: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    runs.push(j > i ? `${pages[i]}–${pages[j]}` : `${pages[i]}`);
    i = j;
  }
  return `${title}, ${pages.length === 1 ? "page" : "pages"} ${runs.join(", ")}`;
}
