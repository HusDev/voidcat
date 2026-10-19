import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { combine, combinedText, pagesName, pickedText, rearrange } from "./pdfTools";

async function pdf(sizes: [number, number][], rotation = 0) {
  const doc = await PDFDocument.create();
  for (const s of sizes) doc.addPage(s).setRotation(degrees(rotation));
  return doc.save();
}
const sizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => [p.getWidth(), p.getHeight(), p.getRotation().angle]);

describe("PDF tools", () => {
  it("combines PDFs in order, keeping every page", async () => {
    const out = await combine([await pdf([[100, 200], [110, 200]]), await pdf([[300, 400]])]);
    expect(await sizes(out)).toEqual([
      [100, 200, 0],
      [110, 200, 0],
      [300, 400, 0],
    ]);
  });

  it("keeps picked pages in the new order, turned on top of their own rotation", async () => {
    const out = await rearrange(await pdf([[100, 100], [200, 200], [300, 300]], 90), [
      { page: 3, turn: 0 },
      { page: 1, turn: 270 },
      { page: 9, turn: 0 },
    ]);
    expect(await sizes(out)).toEqual([
      [300, 300, 90],
      [100, 100, 0],
    ]);
    await expect(rearrange(await pdf([[100, 100]]), [{ page: 4, turn: 0 }])).rejects.toThrow("Pick at least one page");
  });

  it("carries each page's text over", () => {
    expect(
      combinedText([
        { read: ["p1", "p2"], pdfPages: 2 },
        { read: ["a long note"], pdfPages: 3 },
      ]),
    ).toEqual(["p1", "p2", "a long note", "", ""]);
    expect(pickedText(["one", "two", "three"], [{ page: 3, turn: 0 }, { page: 1, turn: 90 }])).toEqual(["three", "one"]);
  });

  it("names picked pages as ranges", () => {
    expect(pagesName("Lease", [1, 2, 3, 5])).toBe("Lease, pages 1–3, 5");
    expect(pagesName("Lease", [4])).toBe("Lease, page 4");
    expect(pagesName("Lease", [3, 2])).toBe("Lease, pages 3, 2");
  });
});
