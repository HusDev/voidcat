import { describe, expect, it } from "vitest";
import { Masker } from "../lib/privacy";
import { maskForCloud, restore } from "./readNow";

const pages = ["CONTRATO DE ARRENDAMIENTO\nArrendador: Marta Vidal, DNI 12345678Z.\nVivienda en Carrer del Sol 21, Valencia.\nRenta: 1.150 euros mensuales."];

describe("Read now in the cloud", () => {
  it("sends only masked text and masked folder names", () => {
    const masker = new Masker([
      { label: "Landlord", value: "Marta Vidal" },
      { label: "Address", value: "Carrer del Sol 21" },
    ]);
    const body = maskForCloud(pages, masker, [{ id: "f", area: "Home", name: "Lease Carrer del Sol 21", documents: 1 }]);
    for (const secret of ["Marta Vidal", "12345678Z", "Carrer del Sol 21"]) {
      expect(body.text).not.toContain(secret);
      expect(body.folders.join()).not.toContain(secret);
    }
    expect(body.text).toContain("1.150 euros");
  });

  it("fills the placeholders back in and keeps only facts found on the page", () => {
    const masker = new Masker([{ label: "Landlord", value: "Marta Vidal" }]);
    const body = maskForCloud(pages, masker, []);
    const person = body.text.match(/\[PERSON_\d+\]/)![0];
    const restored = restore(
      {
        title: `Lease with ${person}`,
        docType: "rental_contract",
        area: "Home",
        folder: "Home › Leases",
        facts: [
          { label: "Landlord", value: person, page: 1 },
          { label: "Rent", value: "1.150 euros", page: 1 },
          { label: "Deposit", value: "2.300 euros", page: 1 },
        ],
      },
      masker,
      pages,
    );
    expect(restored.title).toBe("Lease with Marta Vidal");
    expect(restored.folder).toBe("Leases");
    expect(restored.facts.map((f) => f.value)).toEqual(["Marta Vidal", "1.150 euros"]);
  });
});
