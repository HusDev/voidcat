import { describe, expect, it } from "vitest";
import { applyEdit, type DocRecord, folderId, searchRecords, titleFrom, toDocument } from "./webLibrary";

const lease: DocRecord = {
  kind: "document",
  v: 1,
  id: "d1",
  title: "Rental contract",
  fileName: "lease.pdf",
  mime: "application/pdf",
  sizeBytes: 1200,
  sha256: "ab",
  area: "Home",
  docType: "contract",
  status: "filed",
  addedAt: "2026-03-01T10:00:00Z",
  textMethod: "pdf-text",
  pageCount: 2,
  folder: ["Home", "Rental"],
  filing: "auto",
  facts: [
    { id: "f1", label: "Monthly rent", value: "€1,150", page: 1, status: "pending" },
    { id: "f2", label: "Landlord", value: "Marta Vidal", page: 1, status: "approved" },
  ],
  pages: [
    [1, "Contrato de arrendamiento. La renta mensual es de 1.150 euros, pagadera del 1 al 5 de cada mes."],
    [2, "Firmado en Valencia por ambas partes."],
  ],
  pagesCut: false,
};

describe("cloud library in the browser", () => {
  it("shows a record as the Mac's Document", () => {
    const d = toDocument(lease);
    expect(d.folderId).toBe(folderId("Home", "Rental"));
    expect(d.folderName).toBe("Home › Rental");
    expect(d.suggestedNew).toBe(false);
  });

  it("searches pages ignoring accents and case, every word or any word", () => {
    expect(searchRecords([lease], "ARRENDAMIENTO renta", false)).toHaveLength(1);
    expect(searchRecords([lease], "arrendamiento valencia", false)).toHaveLength(0);
    const any = searchRecords([lease], "arrendamiento valencia", true);
    expect(any.map((h) => h.page).sort()).toEqual([1, 2]);
    expect(searchRecords([lease], "mensual", false)[0].snippet).toContain("[[mensual]]");
    expect(searchRecords([{ ...lease, pages: [[1, "Educación"]] }], "educacion", false)).toHaveLength(1);
  });

  it("applies the same changes the Mac will", () => {
    expect(applyEdit(lease, { op: "settle_fact", factId: "f1", status: "approved", value: "€1,200" })?.facts[0]).toMatchObject({ status: "approved", value: "€1,200" });
    expect(applyEdit(lease, { op: "settle_fact", factId: "f1", status: "rejected", value: null })?.facts).toHaveLength(1);
    expect(applyEdit(lease, { op: "settle_fact", factId: "other", status: "approved", value: null })).toBeNull();
    expect(applyEdit(lease, { op: "rename_document", id: "d1", title: "  " })?.title).toBe("Rental contract");
    expect(applyEdit(lease, { op: "file_document", id: "d1", area: "Home", name: "Lease" })?.folder).toEqual(["Home", "Lease"]);
    expect(applyEdit(lease, { op: "rename_folder", area: "home", from: "RENTAL", to: "Lease" })?.folder).toEqual(["Home", "Lease"]);
    expect(applyEdit(lease, { op: "rename_document", id: "d2", title: "x" })).toBeNull();
  });

  it("titles files like the Mac", () => {
    expect(titleFrom("rental_contract-signed.pdf")).toBe("Rental contract signed");
  });
});
