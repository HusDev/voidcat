import { describe, expect, it } from "vitest";
import type { Document, Fact } from "./library";
import { VoidcatTools } from "./mcp";

const today = new Date(2026, 9, 12);
const doc = { id: "d1", title: "Rental contract, Omar Haddad", folderName: "Home › Lease", docType: "rental_contract", pageCount: 2 } as Document;
const fact = (label: string, value: string): Fact => ({ id: label, documentId: "d1", documentTitle: doc.title, documentMime: null, label, value, page: 1, status: "approved" });
const facts = [fact("Tenant name", "Omar Haddad"), fact("Tenant NIE", "X1234567L"), fact("Contract end date", "30/09/2027"), fact("Monthly rent", "1.150 €/mes"), fact("Tenant name", "Omar Haddad")];

const tools = new VoidcatTools(
  {
    documents: () => [doc],
    approvedFacts: () => facts,
    manualEvents: () => [],
    search: () => [{ documentId: "d1", title: doc.title, page: 1, snippet: "tenant [[Omar]] Haddad, NIE X1234567L" }],
    page: (id, page) => (id === "d1" && page === 1 ? "Omar Haddad (NIE X1234567L) rents the flat for 1.150 €/mes until 30/09/2027." : null),
  },
  today,
);

describe("MCP tools", () => {
  it("never hands out private values, keeps amounts, and notes dates", () => {
    const all = [tools.listDocuments(), tools.facts(), tools.dates(), tools.search("omar"), tools.readPage("d1", 1)].join("\n");
    expect(all).not.toMatch(/Omar|Haddad|X1234567L|30\/09\/2027|2027-09-30/);
    expect(all).toContain("1.150 €/mes");
    expect(tools.readPage("d1", 1)).toContain("Notes on dates:\n[DATE_1] is about 12 months from now.");
  });

  it("lists each fact once and reports missing pages", () => {
    expect(tools.facts().match(/Tenant name/g)).toHaveLength(1);
    expect(tools.readPage("d1", 9)).toMatch(/No such page/);
  });
});
