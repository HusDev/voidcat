import { strToU8 } from "fflate";
import { toString } from "mdast-util-to-string";
import { getDocumentProxy } from "unpdf";
import { bytesOf, encodeImage, photoOf } from "./asPdf";
import { OFFICE, type Target, parseCsv, shortLabel, toCsv, toXlsx } from "./convert";
import { docxBytes, parseMarkdown } from "./exportDocx";
import { type Document, convertOffice, documentPages, readSheets, saveMade } from "./library";
import { notePdf, photosPdf } from "./notePdf";
import { saveReading } from "./reader";

/** At most this many pages become pictures at once. */
const MAX_PICTURES = 50;

/** Markdown as plain words, a blank line between blocks. */
const plainText = (markdown: string) =>
  parseMarkdown(markdown)
    .children.map((n) => toString(n))
    .filter(Boolean)
    .join("\n\n");

/**
 * Converts a document and keeps each result as a new document next to it (its folder and type; none of its facts).
 * Returns what was made, first one first.
 */
export async function convertDocument(doc: Document, t: Target): Promise<Document[]> {
  const mime = doc.mime ?? "";
  const named = (suffix = shortLabel(t)) => `${doc.title} (${suffix})`;
  /** One result whose text is the original's. */
  const same = async (bytes: Uint8Array) => [await saveMade(named(), bytes, { ext: t.ext, like: doc.id, copyText: true })];
  /** One result with text of its own. */
  const own = async (title: string, bytes: Uint8Array, text: string, method: "text" | "ocr" | "sheet") => {
    const made = await saveMade(title, bytes, { ext: t.ext, like: doc.id });
    await saveReading(made.id, { pages: [text], method });
    return made;
  };

  if (OFFICE[mime] || (mime === "text/plain" && (t.ext === "odt" || t.ext === "rtf"))) return same(await convertOffice(doc.id, t.ext));

  if (mime === "text/markdown" || mime === "text/plain") {
    const text = new TextDecoder().decode(await bytesOf(doc.id));
    const plain = mime === "text/plain";
    if (t.ext === "pdf") return same(await notePdf(text, plain));
    if (t.ext === "docx") return same(await docxBytes(text, doc.title, plain));
    if (t.ext === "txt") return same(strToU8(plainText(text)));
  }

  if (mime === "text/csv" && t.ext === "xlsx") return same(toXlsx(parseCsv(new TextDecoder().decode(await bytesOf(doc.id))), doc.title));

  if (t.ext === "csv") {
    const sheets = await readSheets(doc.id);
    const made: Document[] = [];
    for (const sheet of sheets) {
      const csv = toCsv(sheet.rows);
      made.push(await own(sheets.length > 1 ? `${doc.title} – ${sheet.name}` : named("CSV"), strToU8(csv), csv, "text"));
    }
    return made;
  }

  if (mime.startsWith("image/")) {
    const bytes = await bytesOf(doc.id);
    if (t.ext === "pdf") return same(await photosPdf([await photoOf(bytes, mime)]));
    if (t.ext === "jpg" || t.ext === "png") return same(await encodeImage(bytes, mime, t.ext === "jpg" ? "image/jpeg" : "image/png"));
  }

  if (mime === "application/pdf") {
    const read = (await documentPages(doc.id)).sort((a, b) => a.page - b.page).map((p) => p.text);
    if (t.ext === "txt") return same(strToU8(read.join("\n\n")));
    if (t.ext === "png") {
      const pdf = await getDocumentProxy(await bytesOf(doc.id));
      const made: Document[] = [];
      for (let n = 1; n <= Math.min(pdf.numPages, MAX_PICTURES); n++) {
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = [viewport.width, viewport.height];
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
        const png = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
        if (!png) throw new Error(`Page ${n} could not be drawn.`);
        made.push(await own(`${doc.title}, page ${n}`, new Uint8Array(await png.arrayBuffer()), read[n - 1] ?? "", "ocr"));
      }
      return made;
    }
  }

  throw new Error(`Voidcat can't convert this to ${t.label} yet.`);
}
