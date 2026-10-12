import { invoke } from "@tauri-apps/api/core";
import { extractText, getDocumentProxy } from "unpdf";
import type { Document } from "./library";

export type Reading = { pages: string[]; method: "pdf-text" | "text" | "ocr" | "pdf-ocr" | "unsupported" };

/** A page with fewer letters than this is treated as a scan with no text layer. */
const MIN_LETTERS_PER_PAGE = 20;
/** Scanned PDFs longer than this are only read up to here. */
const MAX_SCANNED_PAGES = 40;

const letters = (s: string) => s.replace(/[^\p{L}]/gu, "").length;

/** Text in an image, read by macOS on this Mac (Apple Vision). */
const ocrBytes = (png: Uint8Array) => invoke<string>("ocr_image", png, { headers: { "Content-Type": "application/octet-stream" } });

/** Renders a PDF page to a PNG, at twice its size so small print reads well. */
async function pageImage(pdf: Awaited<ReturnType<typeof getDocumentProxy>>, n: number) {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = new OffscreenCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  await page.render({ canvasContext: context, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Reads a document's text, page by page, inside the app. Nothing is uploaded. */
export async function readDocument(doc: Document): Promise<Reading> {
  const mime = doc.mime ?? "";

  if (mime.startsWith("image/")) {
    return { pages: [await invoke<string>("ocr_document", { id: doc.id })], method: "ocr" };
  }

  const bytes = new Uint8Array(await invoke<ArrayBuffer>("document_bytes", { id: doc.id }));

  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+/g, " ").trim());
    if (letters(pages.join("")) >= MIN_LETTERS_PER_PAGE * pages.length) return { pages, method: "pdf-text" };

    // A scan: read each page's picture instead.
    const scanned: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_SCANNED_PAGES); n++) {
      scanned.push(letters(pages[n - 1] ?? "") >= MIN_LETTERS_PER_PAGE ? pages[n - 1] : await ocrBytes(await pageImage(pdf, n)));
    }
    return { pages: scanned, method: "pdf-ocr" };
  }

  if (mime.startsWith("text/") || mime === "message/rfc822") {
    return { pages: [new TextDecoder().decode(bytes)], method: "text" };
  }
  return { pages: [], method: "unsupported" };
}

export const saveReading = (id: string, r: Reading) => invoke<void>("save_reading", { id, pages: r.pages, method: r.method });
