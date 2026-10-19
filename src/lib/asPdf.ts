import { call as invoke } from "./backend";
import type { Document } from "./library";
import { type Photo, notePdf, photosPdf } from "./notePdf";

/** A document's file, decrypted on this Mac. */
export const bytesOf = async (id: string) => new Uint8Array(await invoke<ArrayBuffer>("document_bytes", { id }));

/** A picture the PDF can hold (JPEG or PNG; HEIC, WebP… drawn once to become a PNG), with its size. */
export async function photoOf(bytes: Uint8Array, mime: string): Promise<Photo> {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    if (mime === "image/jpeg") return { bytes, kind: "jpg", ...size };
    if (mime === "image/png") return { bytes, kind: "png", ...size };
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [size.width, size.height];
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
    if (!png) throw new Error("This picture could not be read.");
    return { bytes: new Uint8Array(await png.arrayBuffer()), kind: "png", ...size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { canBePdf } from "./library";

/** The document as a PDF: PDFs as they are, photos and notes made into one first. */
export async function asPdf(doc: Pick<Document, "id" | "mime">) {
  const bytes = await bytesOf(doc.id);
  const mime = doc.mime ?? "";
  if (mime === "application/pdf") return bytes;
  if (mime === "text/markdown" || mime === "text/plain") return notePdf(new TextDecoder().decode(bytes), mime === "text/plain");
  if (mime.startsWith("image/")) return photosPdf([await photoOf(bytes, mime)]);
  throw new Error("This kind of file can't be made into a PDF yet.");
}
