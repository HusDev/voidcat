import { describe, expect, it } from "vitest";
import { addedLines, findLeaks, normalise, parseList, redact, watchHash } from "./guard";

const none = new Set<string>();

describe("privacy guard", () => {
  it("finds emails, IBANs and ID numbers", async () => {
    const leaks = await findLeaks("mail lucia.prat@mail.com, NIE Z7654321K, IBAN ES98 7654 3210 9876 5432 1098", none, none);
    expect(leaks.map((l) => l.kind)).toEqual(["EMAIL", "IBAN", "ID"]);
  });

  it("lets through allowed values, safe addresses and file names", async () => {
    const allow = parseList("# invented\nZ7654321K\n");
    expect(await findLeaks("NIE Z7654321K", allow, none)).toEqual([]);
    expect(await findLeaks("write to someone@example.com or noreply@anthropic.com", none, none)).toEqual([]);
    expect(await findLeaks('"icons/128x128@2x.png"', none, none)).toEqual([]);
  });

  it("finds watched words by hash, whatever the accents, case or punctuation", async () => {
    const watch = new Set([await watchHash("Robles 214")]);
    const leaks = await findLeaks("const title = 'Lease, C/ ROBLES-214';", none, watch);
    expect(leaks).toEqual([{ kind: "WATCHED", value: "robles 214" }]);
    expect(normalise("Calle Pérez-Galdós, 7")).toBe("calle perez galdos 7");
  });

  it("redacts values for public logs", () => {
    expect(redact("lucia.prat@mail.com")).toBe("lu" + "•".repeat(17));
  });

  it("reads added lines with their numbers from a diff", () => {
    const diff = ["diff --git a/x.ts b/x.ts", "--- a/x.ts", "+++ b/x.ts", "@@ -3,0 +4,2 @@", "+one", "+two", "@@ -9 +11 @@", "-old", "+new"].join("\n");
    expect(addedLines(diff)).toEqual([
      { file: "x.ts", line: 4, text: "one" },
      { file: "x.ts", line: 5, text: "two" },
      { file: "x.ts", line: 11, text: "new" },
    ]);
  });
});
