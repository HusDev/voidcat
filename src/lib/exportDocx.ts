import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  type ParagraphChild,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { List, PhrasingContent, Root, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/**
 * A note's Markdown as a Word document: headings, paragraphs with bold, italic, strikethrough, code and links, lists
 * (nested, numbered or not), quotes, code blocks, tables and rules. Pictures and HTML are left out.
 */

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const MONO = "Menlo";

type Style = { bold?: boolean; italics?: boolean; strike?: boolean };

function runs(nodes: PhrasingContent[], style: Style = {}): ParagraphChild[] {
  return nodes.flatMap((n): ParagraphChild[] => {
    switch (n.type) {
      case "text":
        return [new TextRun({ text: n.value, ...style })];
      case "strong":
        return runs(n.children, { ...style, bold: true });
      case "emphasis":
        return runs(n.children, { ...style, italics: true });
      case "delete":
        return runs(n.children, { ...style, strike: true });
      case "inlineCode":
        return [new TextRun({ text: n.value, font: MONO, ...style })];
      case "break":
        return [new TextRun({ break: 1 })];
      case "link":
        return [new ExternalHyperlink({ link: n.url, children: runs(n.children, style).filter((r) => r instanceof TextRun) })];
      default:
        return "children" in n ? runs(n.children as PhrasingContent[], style) : [];
    }
  });
}

function blocks(nodes: RootContent[], ctx: { level: number; quote: boolean } = { level: 0, quote: false }): (Paragraph | Table)[] {
  const quoted = ctx.quote ? { indent: { left: 567 }, border: { left: { style: "single" as const, size: 12, color: "BBBBBB", space: 8 } } } : {};
  return nodes.flatMap((n): (Paragraph | Table)[] => {
    switch (n.type) {
      case "heading":
        return [new Paragraph({ heading: HEADINGS[n.depth - 1], children: runs(n.children) })];
      case "paragraph":
        return [new Paragraph({ children: runs(n.children, ctx.quote ? { italics: true } : {}), ...quoted })];
      case "blockquote":
        return blocks(n.children, { ...ctx, quote: true });
      case "list":
        return list(n, ctx);
      case "code":
        return n.value.split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, font: MONO, size: 19 })], ...quoted }));
      case "thematicBreak":
        return [new Paragraph({ border: { bottom: { style: "single", size: 6, color: "BBBBBB", space: 1 } }, children: [] })];
      case "table":
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: n.children.map(
              (row, r) =>
                new TableRow({
                  tableHeader: r === 0,
                  children: row.children.map(
                    (cell, c) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            alignment: n.align?.[c] === "right" ? AlignmentType.RIGHT : n.align?.[c] === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
                            children: runs(cell.children, r === 0 ? { bold: true } : {}),
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          }),
          new Paragraph({ children: [] }),
        ];
      default:
        return [];
    }
  });
}

function list(n: List, ctx: { level: number; quote: boolean }): (Paragraph | Table)[] {
  const level = Math.min(ctx.level, 8);
  return n.children.flatMap((item) =>
    item.children.flatMap((child, i): (Paragraph | Table)[] => {
      if (child.type === "list") return list(child, { ...ctx, level: ctx.level + 1 });
      if (child.type === "paragraph" && i === 0) {
        const tick = item.checked === true ? "☑ " : item.checked === false ? "☐ " : "";
        const children = [...(tick ? [new TextRun(tick)] : []), ...runs(child.children)];
        return [new Paragraph(n.ordered ? { numbering: { reference: "numbered", level }, children } : { bullet: { level }, children })];
      }
      return blocks([child], { ...ctx, level: ctx.level + 1 });
    }),
  );
}

export const parseMarkdown = (markdown: string): Root => fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });

/** The Word document for a note; `plain` text keeps every line as it is. */
export function toDocx(text: string, title: string, plain = false) {
  const children = plain ? text.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] })) : blocks(parseMarkdown(text).children);
  return new Document({
    title,
    creator: "Voidcat",
    numbering: {
      config: [
        {
          reference: "numbered",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children }],
  });
}

export const docxBytes = async (text: string, title: string, plain = false) => new Uint8Array(await (await Packer.toBlob(toDocx(text, title, plain))).arrayBuffer());
