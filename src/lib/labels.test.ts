import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
const { dateLabels, duplicateGroups, signRequest, signable, statedPages } = await import("./labels");

const today = new Date(2026, 9, 17);

describe("labels", () => {
  it("labels expired IDs and ended contracts from their latest date", () => {
    const labels = dateLabels(
      [
        { documentId: "passport", label: "Valid to", value: "09/01/2026" },
        { documentId: "card", label: "Expiry date", value: "02/02/2025" },
        { documentId: "card", label: "Expiry date (renewed)", value: "02/02/2028" },
        { documentId: "lease", label: "End date", value: "31/08/2025" },
        { documentId: "lease", label: "Issued", value: "01/01/2020" },
        { documentId: "new-lease", label: "End date", value: "31/08/2027" },
      ],
      today,
    );
    expect(labels.map((l) => `${l.documentId}:${l.kind}`).sort()).toEqual(["lease:ended", "passport:expired"]);
    expect(labels.find((l) => l.documentId === "lease")?.note).toBe("Ended 31 Aug 2025");
  });

  it("groups copies of the same text, even with a few words different", () => {
    const contract = "Contrato de arrendamiento de vivienda entre la arrendadora y la parte arrendataria. La renta mensual es de mil ciento cincuenta euros pagaderos del uno al cinco de cada mes. La fianza es de dos mensualidades. El contrato dura un año desde el uno de septiembre.";
    const texts = new Map([
      ["signed", `${contract} Firmado: Marta Ibáñez.`],
      ["unsigned", `${contract} Firma: ________`],
      ["payslip", "Nómina del mes de septiembre. Salario base, complementos, retenciones de IRPF y cotizaciones a la seguridad social de la empresa y del trabajador en el periodo."],
      ["photo", "Tarjeta"],
    ]);
    expect(duplicateGroups(texts)).toEqual([["signed", "unsigned"]]);
  });

  it("knows a document is missing pages only from its own page numbers", () => {
    expect(statedPages(["Contrato… Página 1 de 3", "Página 2 de 3"])).toBe(3);
    expect(statedPages(["Page 2/4"])).toBe(4);
    expect(statedPages(["Passport. Valid to 09/01/2032"])).toBe(0);
  });

  it("only counts a signature request that is really in the text and about signing", () => {
    const text = "El solicitante declara… Firma del solicitante: ________";
    expect(signRequest(text, "Firma del solicitante")).toBe(true);
    expect(signRequest(text, "Sign here")).toBe(false);
    expect(signRequest("PASSPORT Type P Code IRQ", "Passport")).toBe(false);
  });

  it("only asks for signatures on papers that are signed: contracts, applications, authorisations", () => {
    for (const t of ["rental_contract", "lease_agreement", "application_form", "authorization", "solicitud"]) expect(signable(t)).toBe(true);
    for (const t of ["passport", "residence_card", "payment_receipt", "tax_receipt", "payslip", "certificate", "spreadsheet", "equity_offer", null]) expect(signable(t)).toBe(false);
  });
});
