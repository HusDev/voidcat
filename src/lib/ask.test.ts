import { describe, expect, it } from "vitest";
import { claimsZip, mergeFacts, scopeIds, splitThinking } from "./ask";
import { alwaysThinks } from "./models";

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

describe("alwaysThinks", () => {
  it("knows the models whose thinking can't be turned off", () => {
    expect(["qwen3:4b", "deepseek-r1:8b", "gpt-oss:20b"].every(alwaysThinks)).toBe(true);
    expect(["qwen3.5:9b", "qwen3.5:2b", "llama3.2:3b"].some(alwaysThinks)).toBe(false);
  });
});

describe("mergeFacts", () => {
  it("lists the same fact from several documents once", () => {
    const fact = (label: string, value: string, documentTitle: string, page: number | null) =>
      ({ id: `${label}${documentTitle}`, documentId: documentTitle, documentTitle, documentMime: null, label, value, page, status: "approved" }) as never;
    expect(
      mergeFacts([fact("Full name", "Lena Ortiz", "Passport", 1), fact("Full name", "LENA ORTIZ", "Lease", 2), fact("Surname", "Ortiz", "Passport", 1)]),
    ).toEqual(["- Full name: Lena Ortiz (Passport, p. 1; Lease, p. 2)", "- Surname: Ortiz (Passport, p. 1)"]);
  });
});

describe("claimsZip", () => {
  it("spots an answer that says a zip was made", () => {
    expect(claimsZip("I've bundled your rental contracts (D1 and D2) into a zip file named 'Rental papers'.")).toBe(true);
    expect(claimsZip("Here is Rental papers.zip")).toBe(true);
    expect(claimsZip("You pay 1,150 euros between the 1st and the 5th.")).toBe(false);
  });
});
