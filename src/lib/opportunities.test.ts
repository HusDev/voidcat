import { describe, expect, it } from "vitest";
import type { Document, Fact } from "./library";
import { buildScan, restore } from "./opportunities";
import { Masker } from "./privacy";

const today = new Date(2026, 9, 12);
const doc = (id: string, title: string): Document =>
  ({ id, title, docType: "rental_contract", area: "Home", folderName: "Home › Lease", fileName: "x.pdf" }) as Document;
const fact = (label: string, value: string, documentId = "a"): Fact => ({ id: label, documentId, documentTitle: "", documentMime: null, label, value, page: 2, status: "approved" });

describe("opportunities scan", () => {
  it("sends only masked facts and the document list, and restores the answer", () => {
    const masker = new Masker([], today);
    const facts = [fact("Tenant name", "Omar Haddad"), fact("Deposit", "2.300 euros"), fact("Contract end date", "30/09/2027")];
    const { sent, number } = buildScan(facts, [doc("a", "Rental contract, Omar Haddad")], [{ key: "deposit", title: "Deposit", status: "dismissed" }], masker);
    expect(sent).not.toMatch(/Omar|30\/09\/2027/);
    expect(sent).toContain("2.300 euros");
    expect(sent).toContain("D1 | Rental contract, [PERSON_1]");
    expect(sent).toContain("deposit | Deposit | dismissed");

    const [idea] = restore(
      {
        opportunities: [
          {
            key: "Renew Lease Early!",
            area: "home",
            title: "Negotiate the renewal for [PERSON_1]",
            why: "The lease ends [DATE_1].",
            value: null,
            effort: "low",
            deadline: "[DATE_1]",
            deadlineDate: null,
            nextStep: "Write to the landlord.",
            fit: "yes",
            sources: [{ title: "Rental contract", ref: "D1" }, { title: "Law", ref: "https://www.boe.es/x" }, { title: "Bad", ref: "D9" }, { title: "Bad", ref: "http://x" }],
          },
        ],
      },
      masker,
      number,
    );
    expect(idea.key).toBe("renew-lease-early");
    expect(idea.title).toBe("Negotiate the renewal for Omar Haddad");
    expect(idea.deadline).toBe("30/09/2027");
    expect(idea.deadlineDate).toBe("2027-09-30");
    expect(idea.sources).toEqual([{ title: "Rental contract", url: "doc:a" }, { title: "Law", url: "https://www.boe.es/x" }]);
  });
});
