import { describe, expect, it } from "vitest";
import type { Document, Folder } from "../lib/library";
import { mentionOptions } from "./MentionBox";

const docs = [{ id: "c", title: "Residence card" }, { id: "l", title: "Rental contract" }] as Document[];
const folders = [{ id: "p", area: "Residency", name: "Permits", documents: 1 }] as Folder[];

describe("@ options", () => {
  it("offers everything first, then matching documents, folders and areas", () => {
    expect(mentionOptions("", docs, folders).map((o) => o.label)).toEqual(["All documents", "Help", "Residence card", "Rental contract", "Residency › Permits", "Residency"]);
    expect(mentionOptions("res", docs, folders).map((o) => o.kind)).toEqual(["document", "folder", "area"]);
    expect(mentionOptions("al", docs, folders)[0].kind).toBe("all");
  });
  it("offers @help for questions about the app", () => {
    expect(mentionOptions("he", docs, folders)[0].kind).toBe("help");
    expect(mentionOptions("res", docs, folders).some((o) => o.kind === "help")).toBe(false);
  });
});
