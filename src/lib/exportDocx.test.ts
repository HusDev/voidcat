import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docxBytes } from "./exportDocx";

const part = async (md: string, name: string, plain = false) => strFromU8(unzipSync(await docxBytes(md, "Test", plain))[name]);
const xml = (md: string, plain = false) => part(md, "word/document.xml", plain);

describe("toDocx", () => {
  it("turns Markdown into Word headings, styled runs, lists, links and tables", async () => {
    const doc = await xml(
      "# Moving checklist\n\nBook the **van** for *Saturday* ~~Friday~~.\n\n- Boxes\n  - Tape\n1. Call [the landlord](https://example.com/flat)\n\n| Item | Cost |\n| --- | ---: |\n| Van | 80 |\n\n- [x] Keys",
    );
    expect(doc).toContain('w:val="Heading1"');
    expect(doc).toContain("Moving checklist");
    expect(doc).toMatch(/<w:b\/>.*van/s);
    expect(doc).toMatch(/<w:i\/>.*Saturday/s);
    expect(doc).toContain("<w:strike/>");
    expect(doc).toContain("<w:numPr>");
    expect(doc).toContain("w:hyperlink");
    expect(doc).toContain("<w:tbl>");
    expect(doc).toContain('w:val="right"');
    expect(doc).toContain("☑ ");
  });

  it("restarts each numbered list at 1 and links to the real address", async () => {
    const md = "1. One\n2. Two\n\nText & 5 < 6\n\n1. Again\n\n[site](https://example.com/a?b=1&c=2)";
    expect(await part(md, "word/numbering.xml")).toContain('<w:num w:numId="3">');
    expect(await xml(md)).toContain("Text &amp; 5 &lt; 6");
    expect(await part(md, "word/_rels/document.xml.rels")).toContain('Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"');
  });

  it("keeps plain text as it is, line by line", async () => {
    const doc = await xml("# not a heading\nsecond line", true);
    expect(doc).not.toContain("Heading1");
    expect(doc).toContain("# not a heading");
    expect(doc).toContain("second line");
  });
});
