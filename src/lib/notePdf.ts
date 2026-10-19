import type { List, PhrasingContent, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { writable } from "./signing";

/**
 * Things that aren't PDFs, made into one so they can be signed: a note (Markdown laid out with headings, lists,
 * quotes and tables; plain text line by line) or a photo (one page, the picture filling it).
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const INK = rgb(0.06, 0.06, 0.08);

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont };
type Span = { text: string; font: keyof Fonts };

/** Writes lines down A4 pages, starting a new page when one is full. */
class Writer {
  private page: PDFPage;
  private y: number;
  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
  ) {
    this.page = doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  gap(points: number) {
    this.y -= points;
  }

  /** Spans flowed into lines no wider than the page, each line `size` high. */
  write(spans: Span[], size: number, indent = 0) {
    const width = A4.width - 2 * MARGIN - indent;
    const words = spans.flatMap((s) => writable(this.fonts[s.font], s.text).split(/(\s+)/).filter(Boolean).map((w) => ({ text: w, font: s.font })));
    let line: Span[] = [];
    let used = 0;
    const flush = () => {
      if (this.y - size < MARGIN) {
        this.page = this.doc.addPage([A4.width, A4.height]);
        this.y = A4.height - MARGIN;
      }
      let x = MARGIN + indent;
      for (const w of line) {
        this.page.drawText(w.text, { x, y: this.y - size, size, font: this.fonts[w.font], color: INK });
        x += this.fonts[w.font].widthOfTextAtSize(w.text, size);
      }
      this.y -= size * 1.45;
      line = [];
      used = 0;
    };
    for (const w of words) {
      if (w.text.includes("\n")) {
        flush();
        continue;
      }
      const wide = this.fonts[w.font].widthOfTextAtSize(w.text, size);
      if (used + wide > width && line.length) {
        flush();
        if (!w.text.trim()) continue;
      }
      line.push(w);
      used += wide;
    }
    if (line.length) flush();
  }
}

function spans(nodes: PhrasingContent[], font: keyof Fonts = "regular"): Span[] {
  return nodes.flatMap((n): Span[] => {
    switch (n.type) {
      case "text":
        return [{ text: n.value, font }];
      case "strong":
        return spans(n.children, "bold");
      case "emphasis":
        return spans(n.children, font === "bold" ? "bold" : "italic");
      case "inlineCode":
        return [{ text: n.value, font: "mono" }];
      case "break":
        return [{ text: "\n", font }];
      default:
        return "children" in n ? spans(n.children as PhrasingContent[], font) : [];
    }
  });
}

const HEADING = [18, 15, 13, 12, 11, 11];

function blocks(w: Writer, nodes: RootContent[], indent = 0) {
  for (const n of nodes) {
    switch (n.type) {
      case "heading":
        w.gap(6);
        w.write(spans(n.children, "bold"), HEADING[n.depth - 1], indent);
        w.gap(2);
        break;
      case "paragraph":
        w.write(spans(n.children), 11, indent);
        w.gap(5);
        break;
      case "blockquote":
        blocks(w, n.children, indent + 16);
        break;
      case "list":
        list(w, n, indent);
        w.gap(4);
        break;
      case "code":
        for (const line of n.value.split("\n")) w.write([{ text: line || " ", font: "mono" }], 9.5, indent + 8);
        w.gap(5);
        break;
      case "thematicBreak":
        w.write([{ text: "—".repeat(3), font: "regular" }], 11, indent);
        break;
      case "table":
        for (const [r, row] of n.children.entries()) w.write(row.children.flatMap((cell, c) => [...(c ? [{ text: "  |  ", font: "regular" as const }] : []), ...spans(cell.children, r === 0 ? "bold" : "regular")]), 10.5, indent);
        w.gap(5);
        break;
    }
  }
}

function list(w: Writer, n: List, indent: number) {
  n.children.forEach((item, i) => {
    const mark = item.checked === true ? "[x] " : item.checked === false ? "[ ] " : n.ordered ? `${(n.start ?? 1) + i}. ` : "• ";
    item.children.forEach((child, c) => {
      if (child.type === "paragraph" && c === 0) w.write([{ text: mark, font: "regular" }, ...spans(child.children)], 11, indent + 10);
      else blocks(w, [child], indent + 22);
    });
  });
}

/** A note as an A4 PDF: Markdown laid out, or plain text line by line. */
export async function notePdf(text: string, plain: boolean) {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const w = new Writer(doc, fonts);
  if (plain) for (const line of text.split("\n")) w.write([{ text: line || " ", font: "regular" }], 11);
  else blocks(w, fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }).children);
  return doc.save();
}

export type Photo = { bytes: Uint8Array; kind: "png" | "jpg"; width: number; height: number };

/** Photos as a PDF, one page each, each page as wide as A4 (long side for landscape) and as tall as its picture needs. */
export async function photosPdf(photos: Photo[]) {
  const doc = await PDFDocument.create();
  for (const p of photos) {
    const picture = p.kind === "png" ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes);
    const width = p.width > p.height ? A4.height : A4.width;
    const height = (width * p.height) / p.width;
    doc.addPage([width, height]).drawImage(picture, { x: 0, y: 0, width, height });
  }
  return doc.save();
}

/** A photo as a one-page PDF. */
export const photoPdf = (image: Uint8Array, kind: "png" | "jpg", pixels: { width: number; height: number }) => photosPdf([{ bytes: image, kind, ...pixels }]);
