import { describe, expect, it } from "vitest";
import { month, parseFiled, parseRequest } from "./read";

describe("voidcat-api checks", () => {
  it("takes only masked text and a short folder list", () => {
    expect(parseRequest({ text: "Contrato de [PERSON_1]", folders: ["Home › Lease"] })).toEqual({ text: "Contrato de [PERSON_1]", folders: ["Home › Lease"] });
    expect(parseRequest({ text: "  " })).toBe("No text to read.");
    expect(parseRequest({ text: "x".repeat(60_001) })).toMatch(/too long/);
    expect(parseRequest({ text: "x", folders: "Home" })).toMatch(/folders/i);
    expect(parseRequest(null)).toBe("Send JSON.");
  });

  it("checks the model's answer", () => {
    const filed = parseFiled(
      JSON.stringify({ title: " Rental contract ", docType: "Rental contract", area: "Space", folder: "", facts: [{ label: "Landlord", value: "[PERSON_1]", page: 1 }, { label: "", value: "x" }, { label: "Rent", value: "€1,150", page: -2 }] }),
    );
    expect(filed).toEqual({ title: "Rental contract", docType: "rental_contract", area: "Other", folder: "General", facts: [{ label: "Landlord", value: "[PERSON_1]", page: 1 }, { label: "Rent", value: "€1,150", page: null }] });
  });

  it("counts reads per calendar month", () => {
    expect(month(new Date("2026-10-18T10:00:00Z"))).toBe("2026-10");
  });
});
