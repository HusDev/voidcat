import { invoke } from "@tauri-apps/api/core";
import { extractText, getDocumentProxy } from "unpdf";
import type { Document } from "./library";

export type Reading = { pages: string[]; method: "pdf-text" | "text" | "needs-ocr" | "unsupported" };

/** A page with fewer letters than this is treated as a scan with no text layer. */
const MIN_LETTERS_PER_PAGE = 20;

/** Reads a document's text, page by page, inside the app. Nothing is uploaded. */
export async function readDocument(doc: Document): Promise<Reading> {
  const bytes = new Uint8Array(await invoke<ArrayBuffer>("document_bytes", { id: doc.id }));
  const mime = doc.mime ?? "";

  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+/g, " ").trim());
    const letters = pages.join("").replace(/[^\p{L}]/gu, "").length;
    return { pages, method: letters < MIN_LETTERS_PER_PAGE * pages.length ? "needs-ocr" : "pdf-text" };
  }
  if (mime.startsWith("text/") || mime === "message/rfc822") {
    return { pages: [new TextDecoder().decode(bytes)], method: "text" };
  }
  if (mime.startsWith("image/")) return { pages: [], method: "needs-ocr" };
  return { pages: [], method: "unsupported" };
}

export const saveReading = (id: string, r: Reading) => invoke<void>("save_reading", { id, pages: r.pages, method: r.method });
