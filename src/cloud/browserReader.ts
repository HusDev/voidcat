import type { Worker as OcrWorker } from "tesseract.js";
import { extractText, getDocumentProxy } from "unpdf";
import { call } from "../lib/backend";
import type { Document } from "../lib/library";
import type { Reading } from "../lib/reader";

/**
 * Reads a document's text inside the browser, like `reader.ts` does on the Mac: PDFs with a text layer directly,
 * scans and photos with Tesseract (OCR running in this browser; the engine is served from this site, only the
 * language data comes from jsDelivr), text files as they are. Nothing leaves the browser. Word and spreadsheets are
 * read on the Mac.
 */

const MIN_LETTERS_PER_PAGE = 20;
const MAX_SCANNED_PAGES = 20;
const letters = (s: string) => s.replace(/[^\p{L}]/gu, "").length;

let ocr: Promise<OcrWorker> | null = null;
/** One OCR worker for English and Spanish, made on first use. */
function ocrWorker() {
  ocr ??= import("tesseract.js").then(({ createWorker }) =>
    createWorker(["eng", "spa"], 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr/", workerBlobURL: false }),
  );
  ocr.catch(() => {
    ocr = null;
  });
  return ocr;
}

async function ocrImage(image: Blob) {
  const { data } = await (await ocrWorker()).recognize(image);
  return data.text.trim();
}

async function pageImage(pdf: Awaited<ReturnType<typeof getDocumentProxy>>, n: number) {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = new OffscreenCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  await page.render({ canvasContext: context, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
  return canvas.convertToBlob({ type: "image/png" });
}

/** Whether this browser can read the document, or why not. */
export function browserCanRead(doc: Document): true | string {
  const mime = doc.mime ?? "";
  if (mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/") || mime === "message/rfc822") {
    return mime === "image/heic" ? "HEIC photos are read on your Mac." : true;
  }
  return "This kind of file is read on your Mac.";
}

export async function readInBrowser(doc: Document, progress: (note: string) => void = () => {}): Promise<Reading> {
  const mime = doc.mime ?? "";
  const bytes = new Uint8Array(await call<ArrayBuffer>("document_bytes", { id: doc.id }));

  if (mime.startsWith("image/")) {
    progress("Reading the photo in this browser…");
    return { pages: [await ocrImage(new Blob([bytes], { type: mime }))], method: "ocr" };
  }
  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+/g, " ").trim());
    if (letters(pages.join("")) >= MIN_LETTERS_PER_PAGE * pages.length) return { pages, method: "pdf-text" };
    const scanned: string[] = [];
    const total = Math.min(pdf.numPages, MAX_SCANNED_PAGES);
    for (let n = 1; n <= total; n++) {
      progress(`Reading scanned page ${n} of ${total} in this browser…`);
      scanned.push(letters(pages[n - 1] ?? "") >= MIN_LETTERS_PER_PAGE ? pages[n - 1] : await ocrImage(await pageImage(pdf, n)));
    }
    return { pages: scanned, method: "pdf-ocr" };
  }
  if (mime.startsWith("text/") || mime === "message/rfc822") return { pages: [new TextDecoder().decode(bytes)], method: "text" };
  return { pages: [], method: "unsupported" };
}
