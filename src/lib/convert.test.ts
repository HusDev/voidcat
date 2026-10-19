import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseCsv, shortLabel, targets, toCsv, toXlsx } from "./convert";

describe("convert", () => {
  it("offers only conversions that make sense for each type", () => {
    const word = targets("application/vnd.openxmlformats-officedocument.wordprocessingml.document").map((t) => t.ext);
    expect(word).toEqual(["pdf", "odt", "rtf", "html", "txt"]);
    expect(targets("text/markdown").map((t) => t.ext)).toEqual(["pdf", "docx", "txt"]);
    expect(targets("image/png").map((t) => t.ext)).toEqual(["pdf", "jpg"]);
    expect(targets("image/heic").map((t) => t.ext)).toEqual(["pdf", "jpg", "png"]);
    expect(targets("application/pdf").map((t) => t.ext)).toEqual(["txt", "png"]);
    expect(targets("application/vnd.ms-excel")[0]).toMatchObject({ ext: "csv", many: true });
    expect(targets("text/csv").map((t) => t.ext)).toEqual(["xlsx"]);
    expect(targets("message/rfc822")).toEqual([]);
    expect(targets(null)).toEqual([]);
  });

  it("names targets short", () => {
    expect(targets("text/plain").map(shortLabel)).toEqual(["PDF", "Word", "OpenDocument", "Rich text"]);
  });

  it("writes and reads CSV, quotes and line breaks included", () => {
    const rows = [
      ["Item", "Note"],
      ["Van, large", 'Say "hi"'],
      ["Boxes", "two\nlines"],
    ];
    const csv = toCsv(rows);
    expect(csv).toBe('Item,Note\r\n"Van, large","Say ""hi"""\r\nBoxes,"two\nlines"');
    expect(parseCsv(csv)).toEqual(rows);
    expect(parseCsv("a;b;c\n1;2,5;3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2,5", "3"],
    ]);
  });

  it("makes an Excel sheet with numbers as numbers", () => {
    const files = unzipSync(toXlsx([["Item", "Cost"], ["Van", "80"], ["Tape & ties", "4.50"], ["", "x"]], "Moving: costs"));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('<c r="B2"><v>80</v></c>');
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">Tape &amp; ties</t></is></c>');
    expect(sheet).not.toContain('r="A4"');
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Moving  costs"');
  });
});
