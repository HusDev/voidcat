import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build, HELP } from "../lib/ask";
import { Masker } from "../lib/privacy";

const guide = readFileSync(new URL("./guide.md", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../routes/Settings.tsx", import.meta.url), "utf8") + readFileSync(new URL("../components/MacCloud.tsx", import.meta.url), "utf8");

describe("Voidcat guide", () => {
  it("only links to screens that exist", () => {
    const routes = new Set([...app.matchAll(/path="([^":]+)"/g)].map((m) => m[1]));
    const links = [...guide.matchAll(/\]\(#\/([^)]*)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(10);
    for (const link of links) expect(link === "" || routes.has(link), `#/${link}`).toBe(true);
  });

  it("names settings that exist", () => {
    for (const name of ["Hide private details", "Catch names the rules miss", "Export everything", "Recovery key", "Open Voidcat when you log in", "Email me a sign-in link", "New documents go to the cloud", "Disconnect this Mac", "Delete the cloud copy", "Delete my account"]) {
      expect(guide).toContain(name);
      expect(settings, name).toContain(name);
    }
  });

  it("is all that @help sends: no library, nothing to mask", async () => {
    const built = await build("how do I export?", new Masker([]), [HELP]);
    expect(built.plain).toContain("Question: how do I export?");
    expect(built.plain).toContain("## Encryption and your data");
    expect(built.masked).toBe(built.plain);
    expect(built.sources).toEqual([]);
  });
});
