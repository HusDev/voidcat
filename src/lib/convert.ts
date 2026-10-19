import { strToU8, zipSync } from "fflate";

/**
 * What a document can be converted into, by its type, and the conversions that are plain data work (CSV and Excel).
 * Everything runs on this Mac: office formats through macOS's own tools (`convertOffice`), the rest in the app.
 */

export type Target = {
  /** The file type made. */
  ext: "pdf" | "docx" | "odt" | "rtf" | "html" | "txt" | "md" | "csv" | "xlsx" | "jpg" | "png";
  label: string;
  /** What is kept, when it isn't everything ("Words only"). */
  note?: string;
  /** Makes several documents (one per sheet, one per page). */
  many?: boolean;
};

const WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ODT = "application/vnd.oasis.opendocument.text";
export const OFFICE: Record<string, Target["ext"]> = { [WORD]: "docx", [ODT]: "odt", "application/rtf": "rtf", "text/html": "html" };
const SHEETS = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/vnd.oasis.opendocument.spreadsheet"];
const IMAGES: Record<string, Target["ext"]> = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" as Target["ext"], "image/webp": "webp" as Target["ext"] };

const T = {
  pdf: { ext: "pdf", label: "PDF" },
  docx: { ext: "docx", label: "Word (.docx)" },
  odt: { ext: "odt", label: "OpenDocument (.odt)" },
  rtf: { ext: "rtf", label: "Rich text (.rtf)" },
  html: { ext: "html", label: "Web page (.html)" },
  txt: { ext: "txt", label: "Plain text", note: "Words only" },
} satisfies Record<string, Target>;

/** The conversions offered for a document of type `mime`, best first. Empty when there are none. */
export function targets(mime: string | null): Target[] {
  const m = mime ?? "";
  const office = OFFICE[m];
  if (office) return [T.pdf, T.docx, T.odt, T.rtf, T.html, T.txt].filter((t) => t.ext !== office);
  if (m === "text/markdown") return [T.pdf, { ...T.docx, note: "Headings, lists, tables" }, T.txt];
  if (m === "text/plain") return [T.pdf, T.docx, T.odt, T.rtf];
  if (m === "text/csv") return [{ ext: "xlsx", label: "Excel (.xlsx)" }];
  if (SHEETS.includes(m)) return [{ ext: "csv", label: "CSV", note: "One per sheet", many: true }];
  if (m in IMAGES)
    return [
      { ext: "pdf", label: "PDF" },
      { ext: "jpg", label: "JPEG picture" },
      { ext: "png", label: "PNG picture" },
    ].filter((t) => t.ext !== IMAGES[m]) as Target[];
  if (m === "application/pdf")
    return [
      { ext: "txt", label: "Plain text", note: "The text Voidcat read" },
      { ext: "png", label: "Pictures", note: "One per page", many: true },
    ];
  return [];
}

/** Whether a document has anything to convert into. */
export const canConvert = (doc: { mime: string | null }) => targets(doc.mime).length > 0;

/** Short name of a target for a document's title: "Contract (PDF)". */
export const shortLabel = (t: Target) => t.label.replace(/ \(\.\w+\)$/, "").replace(/ picture$/, "");

/** Rows as CSV: cells with commas, quotes or line breaks are quoted. */
export function toCsv(rows: string[][]) {
  return rows.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
}

/** CSV as rows: quoted cells, doubled quotes and line breaks inside quotes; commas or semicolons, whichever the first line uses. */
export function parseCsv(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** "A", "B", … "Z", "AA": a column's letters. */
const column = (i: number): string => (i >= 26 ? column(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
// nosemgrep: nodejs_scan.javascript-dos-rule-regex_dos -- anchored, no nested repetition, one cell at a time
const NUMBER = /^-?\d+(\.\d+)?$/;

/** Rows as an Excel workbook with one sheet: numbers as numbers, everything else as text. */
export function toXlsx(rows: string[][], sheet = "Sheet1") {
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const cells = rows
    .map(
      (r, y) =>
        `<row r="${y + 1}">${r
          .map((c, x) => {
            const ref = `${column(x)}${y + 1}`;
            if (c === "") return "";
            return NUMBER.test(c.trim()) && c.trim().length < 16 ? `<c r="${ref}"><v>${c.trim()}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(c)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  const name = esc(sheet.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}
