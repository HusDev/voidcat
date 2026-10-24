import { strToU8, zipSync } from "fflate";
import type { List, PhrasingContent, Root, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/**
 * A note's Markdown as a Word document: headings, paragraphs with bold, italic, strikethrough, code and links, lists
 * (nested, numbered or not), quotes, code blocks, tables and rules. Pictures and HTML are left out. The .docx is
 * written here as its few XML parts in a zip (fflate), so no Word library is needed.
 */

const MONO = "Menlo";
/** Bullets use numbering 1; each numbered list gets its own numbering from 2 on, so it starts at 1 again. */
const BULLETS = 1;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Style = { bold?: boolean; italic?: boolean; strike?: boolean; mono?: boolean; link?: boolean };

/** Everything a document collects while it is written: its links and its numbered lists. */
type Parts = { links: string[]; numbered: number };

function run(text: string, s: Style) {
  const props = [s.link && '<w:rStyle w:val="Hyperlink"/>', s.mono && `<w:rFonts w:ascii="${MONO}" w:hAnsi="${MONO}" w:cs="${MONO}"/>`, s.bold && "<w:b/>", s.italic && "<w:i/>", s.strike && "<w:strike/>"]
    .filter(Boolean)
    .join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function runs(nodes: PhrasingContent[], parts: Parts, style: Style = {}): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return run(n.value, style);
        case "strong":
          return runs(n.children, parts, { ...style, bold: true });
        case "emphasis":
          return runs(n.children, parts, { ...style, italic: true });
        case "delete":
          return runs(n.children, parts, { ...style, strike: true });
        case "inlineCode":
          return run(n.value, { ...style, mono: true });
        case "break":
          return "<w:r><w:br/></w:r>";
        case "link": {
          parts.links.push(n.url);
          return `<w:hyperlink r:id="rIdLink${parts.links.length}">${runs(n.children, parts, { ...style, link: true })}</w:hyperlink>`;
        }
        default:
          return "children" in n ? runs(n.children as PhrasingContent[], parts, style) : "";
      }
    })
    .join("");
}

const para = (props: string, content: string) => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${content}</w:p>`;
const QUOTE = '<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="BBBBBB"/></w:pBdr><w:ind w:left="567"/>';

function blocks(nodes: RootContent[], parts: Parts, ctx = { level: 0, quote: false }): string {
  const quote = ctx.quote ? QUOTE : "";
  return nodes
    .map((n) => {
      switch (n.type) {
        case "heading":
          return para(`<w:pStyle w:val="Heading${n.depth}"/>`, runs(n.children, parts));
        case "paragraph":
          return para(quote, runs(n.children, parts, ctx.quote ? { italic: true } : {}));
        case "blockquote":
          return blocks(n.children, parts, { ...ctx, quote: true });
        case "list":
          return list(n, parts, ctx, n.ordered ? ++parts.numbered + 1 : BULLETS);
        case "code":
          return n.value
            .split("\n")
            .map((line) => para(quote, run(line, { mono: true })))
            .join("");
        case "thematicBreak":
          return para('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr>', "");
        case "table": {
          const cols = Math.max(1, ...n.children.map((r) => r.children.length));
          const grid = `<w:tblGrid>${`<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`.repeat(cols)}</w:tblGrid>`;
          const rows = n.children
            .map((row, r) => {
              const cells = row.children
                .map((cell, c) => {
                  const align = n.align?.[c] === "right" ? "right" : n.align?.[c] === "center" ? "center" : "left";
                  return `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / cols)}" w:type="dxa"/></w:tcPr>${para(`<w:jc w:val="${align}"/>`, runs(cell.children, parts, r === 0 ? { bold: true } : {}))}</w:tc>`;
                })
                .join("");
              return `<w:tr>${r === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells}</w:tr>`;
            })
            .join("");
          const line = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`;
          const borders = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(line).join("")}</w:tblBorders>`;
          return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr>${grid}${rows}</w:tbl>${para("", "")}`;
        }
        default:
          return "";
      }
    })
    .join("");
}

function list(n: List, parts: Parts, ctx: { level: number; quote: boolean }, numId: number): string {
  const level = Math.min(ctx.level, 8);
  return n.children
    .map((item) =>
      item.children
        .map((child, i) => {
          if (child.type === "list") return list(child, parts, { ...ctx, level: ctx.level + 1 }, child.ordered ? (child.ordered === n.ordered ? numId : ++parts.numbered + 1) : BULLETS);
          if (child.type === "paragraph" && i === 0) {
            const tick = item.checked === true ? "☑ " : item.checked === false ? "☐ " : "";
            return para(`<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`, (tick ? run(tick, {}) : "") + runs(child.children, parts));
          }
          return blocks([child], parts, { ...ctx, level: ctx.level + 1 });
        })
        .join(""),
    )
    .join("");
}

export const parseMarkdown = (markdown: string): Root => fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function levels(numbered: boolean) {
  return Array.from({ length: 9 }, (_, l) => {
    const indent = `<w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr>`;
    return numbered
      ? `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${l + 1}."/><w:lvlJc w:val="left"/>${indent}</w:lvl>`
      : `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${["•", "◦", "▪"][l % 3]}"/><w:lvlJc w:val="left"/>${indent}</w:lvl>`;
  }).join("");
}

function numbering(numbered: number) {
  const lists = Array.from(
    { length: numbered },
    (_, i) => `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`,
  ).join("");
  return `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0">${levels(false)}</w:abstractNum><w:abstractNum w:abstractNumId="1">${levels(true)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${lists}</w:numbering>`;
}

const STYLES = (() => {
  const sizes = [32, 28, 26, 24, 22, 22];
  const headings = sizes
    .map((sz, i) => `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/></w:rPr></w:style>`)
    .join("");
  return `${XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica" w:cs="Helvetica"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${headings}<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F4E9C"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`;
})();

/** The .docx for a note; `plain` text keeps every line as it is. */
export function docxBytes(text: string, title: string, plain = false) {
  const parts: Parts = { links: [], numbered: 0 };
  const body = plain ? text.split("\n").map((line) => para("", run(line, {}))).join("") : blocks(parseMarkdown(text).children, parts);
  const document = `${XML}<w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${parts.links
    .map((url, i) => `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(url)}" TargetMode="External"/>`)
    .join("")}</Relationships>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "docProps/core.xml": `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Voidcat</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`,
    "word/document.xml": document,
    "word/styles.xml": STYLES,
    "word/numbering.xml": numbering(parts.numbered),
    "word/_rels/document.xml.rels": rels,
  };
  return Promise.resolve(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
}
