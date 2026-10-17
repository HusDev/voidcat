import { describe, expect, it } from "vitest";
import { scopeIds, splitThinking } from "./ask";

const docs = [
  { id: "lease", folderId: "f-home", area: "Home" },
  { id: "card", folderId: "f-permits", area: "Residency" },
  { id: "fee", folderId: "f-fees", area: "Residency" },
  { id: "loose", folderId: null, area: null },
];

describe("ask scope", () => {
  it("is the whole library with no mentions or with @all", () => {
    expect(scopeIds(undefined, docs)).toBeNull();
    expect(scopeIds([], docs)).toBeNull();
    expect(scopeIds([{ kind: "document", id: "lease", label: "Rental contract" }, { kind: "all", id: "all", label: "All documents" }], docs)).toBeNull();
  });

  it("covers chosen documents, folders and areas", () => {
    expect([...scopeIds([{ kind: "document", id: "lease", label: "Rental contract" }], docs)!]).toEqual(["lease"]);
    expect([...scopeIds([{ kind: "folder", id: "f-fees", label: "Fee receipts" }, { kind: "document", id: "lease", label: "Rental contract" }], docs)!].sort()).toEqual(["fee", "lease"]);
    expect([...scopeIds([{ kind: "area", id: "residency", label: "Residency" }], docs)!].sort()).toEqual(["card", "fee"]);
  });
});

describe("splitThinking", () => {
  it("puts a thinking model's reasoning aside and keeps the answer", () => {
    expect(splitThinking("<think>Check the passport.</think>\n\nYour first name is Lena.")).toEqual({ thinking: "Check the passport.", answer: "Your first name is Lena." });
    expect(splitThinking("Okay, let me look. </think>\n\nIt expires in 2031.")).toEqual({ thinking: "Okay, let me look.", answer: "It expires in 2031." });
    expect(splitThinking("<think>Still reading")).toEqual({ thinking: "Still reading", answer: "" });
    expect(splitThinking("Plain answer.")).toEqual({ thinking: "", answer: "Plain answer." });
  });
});
