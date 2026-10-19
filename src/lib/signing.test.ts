import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { notePdf, photoPdf } from "./notePdf";
import { type Run, cleanSignature, findSpot, stampPdf, toPdfPoint, todayText, trimInk, unsignedHint } from "./signing";

const run = (str: string, x: number, y: number): Run => ({ str, x, y, w: 0.2, h: 0.015 });

describe("finding where to sign", () => {
  it("reads the spot from the Unsigned label", () => {
    expect(unsignedHint("Nothing signed at “Firma del arrendatario” (page 6)")).toEqual({ quote: "Firma del arrendatario", page: 6 });
    expect(unsignedHint("Looks like the same document")).toBeNull();
    expect(unsignedHint(null)).toBeNull();
  });

  it("puts the signature just above the words that ask for it, on the label's page first", () => {
    const pages = [[run("Signature:", 0.1, 0.5)], [run("Clause 7", 0.1, 0.2), run("Firma del arrendatario", 0.55, 0.8)]];
    const spot = findSpot(pages, { quote: "Firma del arrendatario", page: 2 })!;
    expect(spot.page).toBe(2);
    expect(spot.y).toBeLessThan(0.8);
    expect(spot.y).toBeGreaterThan(0.7);
    expect(spot.x).toBeCloseTo(0.65 - 0.12, 5);
  });

  it("falls back to signing words, last page first, and gives up when nothing asks", () => {
    expect(findSpot([[run("Fdo.: el trabajador", 0.1, 0.9)], [run("Anexo", 0.1, 0.1)]])?.page).toBe(1);
    expect(findSpot([[run("Signed by both parties", 0.1, 0.3)], [run("Signature", 0.6, 0.95)]])?.page).toBe(2);
    expect(findSpot([[run("Just a receipt", 0.1, 0.1)]])).toBeNull();
  });

  it("keeps the box on the page", () => {
    const spot = findSpot([[run("Firma", 0.95, 0.01)]])!;
    expect(spot.x + 0.24).toBeLessThanOrEqual(0.98 + 1e-9);
    expect(spot.y).toBeGreaterThanOrEqual(0.01);
  });
});

describe("placing on turned pages", () => {
  it("maps the shown page's corners to the PDF's own corners", () => {
    expect(toPdfPoint(0, 0, 600, 800, 0)).toEqual({ x: 0, y: 800 });
    expect(toPdfPoint(0, 1, 600, 800, 0)).toEqual({ x: 0, y: 0 });
    // Turned a quarter clockwise: the shown top-left is the PDF's bottom-left, the shown top-right its top-left.
    expect(toPdfPoint(0, 0, 600, 800, 90)).toEqual({ x: 0, y: 0 });
    expect(toPdfPoint(1, 0, 600, 800, 90)).toEqual({ x: 0, y: 800 });
    expect(toPdfPoint(0, 0, 600, 800, 180)).toEqual({ x: 600, y: 0 });
    expect(toPdfPoint(0, 0, 600, 800, 270)).toEqual({ x: 600, y: 800 });
  });
});

describe("the signed PDF", () => {
  const png = async () => {
    // The smallest valid PNG: one pixel.
    return Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  };

  it("draws the signature and text into the page and keeps every page", async () => {
    const src = await PDFDocument.create();
    src.addPage([600, 800]);
    src.addPage([600, 800]).setRotation(degrees(90));
    const bytes = await stampPdf(
      await src.save(),
      [
        { id: "s", page: 1, kind: "signature", x: 0.5, y: 0.8, w: 0.24, h: 0.07 },
        { id: "d", page: 1, kind: "text", x: 0.5, y: 0.88, text: "19/10/2026", size: 11 },
        { id: "p", page: 2, kind: "text", x: 0.1, y: 0.1, text: "En Łódź", size: 11 },
      ],
      await png(),
    );
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(2);
    expect(bytes.length).toBeGreaterThan((await src.save()).length);
  });

  it("writes today like Spanish forms do", () => {
    expect(todayText(new Date(2026, 9, 9))).toBe("09/10/2026");
  });
});

describe("making a PDF to sign", () => {
  it("lays a note out over as many pages as it needs", async () => {
    const long = `# Moving checklist\n\n${Array.from({ length: 120 }, (_, i) => `- Box ${i + 1}: **kitchen** things`).join("\n")}\n\n| Item | Cost |\n| --- | --- |\n| Van | 80 |`;
    const doc = await PDFDocument.load(await notePdf(long, false));
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const plain = await PDFDocument.load(await notePdf("Call the landlord\nأهلا", true));
    expect(plain.getPageCount()).toBe(1);
  });

  it("makes a photo one page as wide as A4", async () => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const doc = await PDFDocument.load(await photoPdf(png, "png", { width: 1000, height: 1500 }));
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(892.92, 1);
  });
});

describe("a signature from a photo", () => {
  const photo = (w: number, h: number, ink: [number, number][]) => {
    const data = new Uint8ClampedArray(w * h * 4).fill(240);
    for (const [x, y] of ink) data.set([20, 20, 60, 255], (y * w + x) * 4);
    return { data, width: w, height: h };
  };

  it("makes the paper see-through and cuts the picture to the ink", () => {
    const clean = cleanSignature(photo(100, 50, [[40, 20], [60, 30]]))!;
    expect(clean.width).toBe(21 + 12);
    expect(clean.height).toBe(11 + 12);
    expect(clean.data[3]).toBe(0);
    expect(clean.data[(6 * clean.width + 6) * 4 + 3]).toBe(255);
  });

  it("finds nothing on blank paper", () => {
    expect(cleanSignature(photo(20, 20, []))).toBeNull();
    expect(trimInk({ data: new Uint8ClampedArray(16), width: 2, height: 2 })).toBeNull();
  });
});
