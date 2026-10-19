import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docxBytes } from "./exportDocx";

const xml = async (md: string, plain = false) => strFromU8(unzipSync(await docxBytes(md, "Test", plain))["word/document.xml"]);

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

  it("keeps plain text as it is, line by line", async () => {
    const doc = await xml("# not a heading\nsecond line", true);
    expect(doc).not.toContain("Heading1");
    expect(doc).toContain("# not a heading");
    expect(doc).toContain("second line");
  });
});
