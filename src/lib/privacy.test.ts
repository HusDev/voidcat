import { describe, expect, it } from "vitest";
import { Masker, kindOfLabel, parseDate, relative } from "./privacy";

const today = new Date(2026, 9, 12); // 12 Oct 2026

describe("privacy layer", () => {
  it("masks approved facts and puts them back", () => {
    const m = new Masker([{ label: "Tenant name", value: "Omar Haddad" }, { label: "Property address", value: "Carrer de Provença 210, 3º 1ª" }], today);
    const masked = m.mask("Omar Haddad lives at Carrer de Provença 210, 3º 1ª. OMAR HADDAD pays rent.");
    expect(masked).toBe("[PERSON_1] lives at [ADDRESS_1]. [PERSON_1] pays rent.");
    expect(m.unmask("Yes, [PERSON_1] can register at [ADDRESS_1].")).toBe("Yes, Omar Haddad can register at Carrer de Provença 210, 3º 1ª.");
  });

  it("masks IDs, IBANs, emails and phones by pattern", () => {
    const m = new Masker([], today);
    const masked = m.mask("NIE X1234567L, DNI 12345678Z, passport B47307758, IBAN ES12 3456 7890 1234 5678 9012, mail ana.ruiz@mail.com, call +34 612 345 678.");
    expect(masked).not.toMatch(/X1234567L|12345678Z|B47307758|ES12|ana\.ruiz|612/);
    expect(masked).toContain("[IBAN_1]");
    expect(masked).toContain("[EMAIL_1]");
    expect(masked).toContain("[PHONE_1]");
    expect(m.entries().filter((e) => e.kind === "ID")).toHaveLength(3);
  });

  it("keeps amounts and ordinary numbers", () => {
    const m = new Masker([], today);
    expect(m.mask("Rent is 1.150 euros, deposit 2.300 euros, 3 rooms.")).toBe("Rent is 1.150 euros, deposit 2.300 euros, 3 rooms.");
  });

  it("turns dates into placeholders with a relative note", () => {
    const m = new Masker([], today);
    const masked = m.mask("Valid until 16/03/2027. Signed 12 de octubre de 2026. Issued March 3, 2020.");
    expect(masked).toBe("Valid until [DATE_1]. Signed [DATE_2]. Issued [DATE_3].");
    expect(m.notes()).toEqual(["[DATE_1] is about 5 months from now.", "[DATE_2] is today.", "[DATE_3] is about 7 years ago."]);
  });

  it("unmasks placeholders written without brackets", () => {
    const m = new Masker([{ label: "Passport number", value: "P4821907" }], today);
    m.mask("P4821907");
    expect(m.unmask("Your passport ID_1 is fine.")).toBe("Your passport P4821907 is fine.");
  });

  it("skips generic fact values", () => {
    const m = new Masker([{ label: "Duration", value: "1 year" }, { label: "Grade", value: "Good" }], today);
    expect(m.mask("A 1 year contract, grade Good.")).toBe("A 1 year contract, grade Good.");
  });

  it("reads labels and dates", () => {
    expect(kindOfLabel("Landlord")).toBe("PERSON");
    expect(kindOfLabel("Valid to")).toBe("DATE");
    expect(kindOfLabel("Card no.")).toBe("ID");
    expect(parseDate("23 Feb 2034")?.getFullYear()).toBe(2034);
    expect(relative(new Date(2026, 9, 20), today)).toBe("about 8 days from now");
  });
});
