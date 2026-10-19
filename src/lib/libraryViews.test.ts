import { describe, expect, it } from "vitest";
import type { Label } from "./labels";
import type { Document, Fact } from "./library";
import { type Context, NO_FILTERS, addedShort, byTime, copyGroups, filterOptions, inView, keyFact, matches, sortDocs, startView, tasks, timeGroup } from "./libraryViews";

const now = new Date(2026, 9, 19, 12);
const doc = (id: string, added: string, extra: Partial<Document> = {}): Document => ({
  id,
  title: id,
  fileName: `${id}.pdf`,
  mime: "application/pdf",
  sizeBytes: 1,
  area: "Home",
  docType: "bill",
  status: "filed",
  addedAt: added,
  textMethod: "pdf-text",
  pageCount: 1,
  folderId: "f1",
  folderName: "Home › Bills",
  filing: "auto",
  suggestedArea: null,
  suggestedFolder: null,
  suggestedNew: false,
  suggestionReason: null,
  ...extra,
});
const fact = (documentId: string, label: string, value: string, status: Fact["status"] = "approved"): Fact => ({ id: `${documentId}-${label}`, documentId, documentTitle: documentId, documentMime: null, label, value, page: 1, status });
const label = (documentId: string, kind: Label["kind"], relatedId: string | null = null, dismissed = false): Label => ({ documentId, kind, note: null, relatedId, source: "auto", dismissed });
const ctx = (over: Partial<Context> = {}): Context => ({ approved: [], pending: [], labels: [], now, ...over });

describe("library views", () => {
  it("puts documents in the right views", () => {
    const fresh = doc("fresh", "2026-10-10T09:00:00Z");
    const old = doc("old", "2025-01-10T09:00:00Z");
    const card = doc("card", "2025-03-01T09:00:00Z");
    const note = doc("note", "2025-03-01T09:00:00Z", { written: true });
    const c = ctx({ approved: [fact("card", "Valid until", "28/11/2026")], labels: [label("old", "unsigned"), label("note", "unsigned", null, true)] });
    expect(inView("recent", fresh, c)).toBe(true);
    expect(inView("recent", old, c)).toBe(false);
    expect(inView("expiring", card, c)).toBe(true);
    expect(inView("expiring", fresh, c)).toBe(false);
    expect(inView("unsigned", old, c)).toBe(true);
    expect(inView("unsigned", note, c)).toBe(false);
    expect(inView("notes", note, c)).toBe(true);
    expect(inView("notes", old, c)).toBe(false);
  });

  it("counts what needs you and opens there, else on what's recent", () => {
    const docs = [doc("a", "2026-10-18T09:00:00Z", { filing: "suggested" }), doc("b", "2026-01-01T09:00:00Z"), doc("c", "2026-01-01T09:00:00Z", { folderId: null, filing: null })];
    const c = ctx({ pending: [fact("b", "Amount", "64 €", "pending"), fact("b", "Due", "20/10/2026", "pending")], labels: [label("b", "duplicate", "c"), label("c", "duplicate", "b")] });
    const t = tasks(docs, c);
    expect(t.toFile.map((d) => d.id)).toEqual(["a"]);
    expect(t.unsorted.map((d) => d.id)).toEqual(["c"]);
    expect(t.toCheck).toEqual([{ doc: docs[1], facts: 2 }]);
    expect(t.copies.map((g) => g.map((d) => d.id))).toEqual([["b", "c"]]);
    expect(t.count).toBe(1 + 1 + 2 + 1);
    expect(startView(t.count, docs, c)).toBe("needs");
    expect(startView(0, docs, c)).toBe("recent");
    expect(startView(0, [docs[1]], c)).toBe("all");
  });

  it("groups copies and ignores dismissed or one-sided ones", () => {
    const docs = [doc("a", "2026-01-01"), doc("b", "2026-01-01"), doc("c", "2026-01-01")];
    expect(copyGroups(docs, [label("a", "duplicate", "b"), label("b", "duplicate", "c")]).map((g) => g.map((d) => d.id))).toEqual([["a", "b", "c"]]);
    expect(copyGroups(docs, [label("a", "duplicate", "b", true)])).toEqual([]);
    expect(copyGroups(docs, [label("a", "duplicate", "gone")])).toEqual([]);
  });
});

describe("the list", () => {
  it("groups by when documents were added", () => {
    expect(timeGroup(new Date(2026, 9, 19, 8), now)).toBe("Today");
    expect(timeGroup(new Date(2026, 9, 15), now)).toBe("This week");
    expect(timeGroup(new Date(2026, 9, 2), now)).toBe("Earlier in October");
    expect(timeGroup(new Date(2026, 8, 2), now)).toBe("September");
    expect(timeGroup(new Date(2025, 2, 2), now)).toBe("March 2025");
    const groups = byTime(sortDocs([doc("x", new Date(2026, 8, 3).toISOString()), doc("y", new Date(2026, 9, 18).toISOString()), doc("z", new Date(2026, 8, 1).toISOString())], "added"), now);
    expect(groups.map((g) => [g.title, g.docs.map((d) => d.id)])).toEqual([
      ["This week", ["y"]],
      ["September", ["x", "z"]],
    ]);
  });

  it("says when, short", () => {
    expect(addedShort(new Date(2026, 9, 18), now)).toBe("Yesterday");
    expect(addedShort(new Date(2026, 9, 8), now)).toBe("8 Oct");
    expect(addedShort(new Date(2025, 9, 8), now)).toBe("8 Oct 2025");
  });

  it("filters and offers only the values there are", () => {
    const docs = [doc("a", "2026-05-01", { area: "Work", docType: "payslip" }), doc("b", "2025-05-01", { area: null, docType: null })];
    const labels = [label("b", "expired")];
    expect(matches(docs[0], { ...NO_FILTERS, area: "Work" }, labels)).toBe(true);
    expect(matches(docs[1], { ...NO_FILTERS, area: "Not filed", type: "Other", year: "2025" }, labels)).toBe(true);
    expect(matches(docs[0], { ...NO_FILTERS, label: "expired" }, labels)).toBe(false);
    expect(filterOptions(docs, labels)).toEqual({ area: ["Not filed", "Work"], type: ["Other", "payslip"], year: ["2026", "2025"], label: ["expired"] });
  });

  it("sorts by name or folder, unfiled last", () => {
    const docs = [doc("b", "2026-01-01", { folderName: null }), doc("a", "2026-01-02", { folderName: "Work › Pay" }), doc("c", "2026-01-03", { folderName: "Home › Bills" })];
    expect(sortDocs(docs, "name").map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(sortDocs(docs, "folder").map((d) => d.id)).toEqual(["c", "a", "b"]);
    expect(sortDocs(docs, "added").map((d) => d.id)).toEqual(["c", "a", "b"]);
  });

  it("shows the most useful fact: expiry, then money, then a date", () => {
    expect(keyFact([fact("a", "Holder", "Sam Rivera"), fact("a", "Valid until", "01/02/2031")])?.label).toBe("Valid until");
    expect(keyFact([fact("a", "Holder", "Sam Rivera"), fact("a", "Total", "64,20 €")])?.label).toBe("Total");
    expect(keyFact([fact("a", "Holder", "Sam Rivera"), fact("a", "Issued", "03/04/2024")])?.label).toBe("Issued");
    expect(keyFact([fact("a", "Holder", "Sam Rivera")])?.label).toBe("Holder");
    expect(keyFact([])).toBeNull();
  });
});
