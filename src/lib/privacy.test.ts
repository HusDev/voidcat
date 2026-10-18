import { describe, expect, it } from "vitest";
import { FOUND_KIND, HIDDEN, Masker, kindOfLabel, parseDate, relative, screenHider } from "./privacy";

/** The fastest of three runs, in ms: a busy machine only makes runs slower, while a slow pattern is slow every time. */
function fastest(run: () => unknown) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

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
    const masked = m.mask("NIE X1234567L, DNI 12345678Z, passport AB1234567, IBAN ES12 3456 7890 1234 5678 9012, mail ana.ruiz@mail.com, call +34 612 345 678.");
    expect(masked).not.toMatch(/X1234567L|12345678Z|AB1234567|ES12|ana\.ruiz|612/);
    expect(masked).toContain("[IBAN_1]");
    expect(masked).toContain("[EMAIL_1]");
    expect(masked).toContain("[PHONE_1]");
    expect(m.entries().filter((e) => e.kind === "ID")).toHaveLength(3);
  });

  it("keeps amounts and ordinary numbers", () => {
    const m = new Masker([], today);
    expect(m.mask("Rent is 1.150 euros, deposit 2.300 euros, 3 rooms.")).toBe("Rent is 1.150 euros, deposit 2.300 euros, 3 rooms.");
  });

  it("keeps approved amounts but masks other numbered details", () => {
    const m = new Masker([{ label: "Deposit", value: "2.300 euros" }, { label: "Monthly rent", value: "€1,150 / month" }, { label: "Policy", value: "PL-889 2213" }], today);
    expect(m.mask("Deposit 2.300 euros, rent €1,150 / month, policy PL-889 2213.")).toBe("Deposit 2.300 euros, rent €1,150 / month, policy [PRIVATE_1].");
  });

  it("keeps recurring date rules but masks real dates", () => {
    const m = new Masker([{ label: "Rent payment dates", value: "del 1 al 5 de cada mes" }, { label: "Start date", value: "01/10/2026" }], today);
    expect(m.mask("Pay del 1 al 5 de cada mes from 01/10/2026.")).toBe("Pay del 1 al 5 de cada mes from [DATE_1].");
  });

  it("turns dates into placeholders with a relative note", () => {
    const m = new Masker([], today);
    const masked = m.mask("Valid until 16/03/2027. Signed 12 de octubre de 2026. Issued March 3, 2020.");
    expect(masked).toBe("Valid until [DATE_1]. Signed [DATE_2]. Issued [DATE_3].");
    expect(m.notes()).toEqual(["[DATE_1] is about 5 months from now.", "[DATE_2] is today.", "[DATE_3] is about 7 years ago."]);
  });

  it("unmasks placeholders written without brackets", () => {
    const m = new Masker([{ label: "Passport number", value: "P1234567" }], today);
    m.mask("P1234567");
    expect(m.unmask("Your passport ID_1 is fine.")).toBe("Your passport P1234567 is fine.");
  });

  it("skips generic fact values", () => {
    const m = new Masker([{ label: "Duration", value: "1 year" }, { label: "Grade", value: "Good" }], today);
    expect(m.mask("A 1 year contract, grade Good.")).toBe("A 1 year contract, grade Good.");
  });

  it("keeps placeholders stable across a conversation", () => {
    const m = new Masker([], today);
    expect(m.mask("X1234567L")).toBe("[ID_1]");
    m.learn([{ label: "Landlord", value: "Carla Ruiz" }]);
    expect(m.mask("Carla Ruiz and X1234567L")).toBe("[PERSON_1] and [ID_1]");
  });

  it("catches shorter forms of an approved address", () => {
    const m = new Masker([{ label: "Property address", value: "Calle Robles 214, Bajo primera" }], today);
    expect(m.mask("Folder: Lease Robles 214")).toBe("Folder: Lease [ADDRESS_1]");
    expect(m.mask("C/ Robles, 214 and Carrer Robles nº 214")).toBe("[ADDRESS_1] and [ADDRESS_1]");
    expect(m.unmask("[ADDRESS_1]")).toBe("Calle Robles 214, Bajo primera");
    expect(m.mask("Robles 21 and Robles 2140")).toBe("Robles 21 and Robles 2140");
  });

  it("finds the street when the address starts with the city", () => {
    const m = new Masker([{ label: "Property Address", value: "Barcelona, Calle Robles 214, bajo primera" }], today);
    expect(m.mask("Home › Lease Robles 214")).toBe("Home › Lease [ADDRESS_1]");
    expect(m.mask("ALEGRE DE DALT 26")).toBe("ALEGRE DE DALT 26");
  });

  it("catches a person's first name and surname", () => {
    const m = new Masker([{ label: "Landlord", value: "Pau Ferrer Vidal" }], today);
    expect(m.mask("Signed by Pau Ferrer.")).toBe("Signed by [PERSON_1].");
  });

  it("masks a date fact as a date, with its note, whatever its label says", () => {
    const m = new Masker([{ label: "Válida hasta", value: "01/02/2027" }, { label: "Caduca el", value: "03/05/2027" }], today);
    const out = m.mask("Válida hasta: 01/02/2027. Caduca el 03/05/2027.");
    expect(out).toBe("Válida hasta: [DATE_1]. Caduca el [DATE_2].");
    expect(m.notes()[0]).toMatch(/^\[DATE_1\] is about/);
  });

  it("reads labels and dates", () => {
    expect(kindOfLabel("Landlord")).toBe("PERSON");
    expect(kindOfLabel("Valid to")).toBe("DATE");
    expect(kindOfLabel("Card no.")).toBe("ID");
    expect(kindOfLabel("Válida hasta")).toBe("DATE");
    expect(kindOfLabel("Fecha de expedición")).toBe("DATE");
    expect(kindOfLabel("Teléfono móvil")).toBe("PHONE");
    expect(parseDate("23 Feb 2034")?.getFullYear()).toBe(2034);
    expect(relative(new Date(2026, 9, 20), today)).toBe("about 8 days from now");
  });

  it("treats approved values as plain text, never as regex syntax", () => {
    // A value that would hang a backtracking engine if it were read as a pattern.
    const evil = "(a+)+$";
    const m = new Masker([{ label: "Holder name", value: `${evil} ${evil} ${evil}` }, { label: "Street address", value: "Calle (x+)+ 12" }], today);
    let out = "";
    expect(fastest(() => (out = m.mask(`${"a".repeat(40_000)}! then ${evil} ${evil} ${evil}`)))).toBeLessThan(500);
    expect(out).toContain("[PERSON_1]");
    expect(out.startsWith("a".repeat(100))).toBe(true);
  });

  it("finds dates with any month name, longest name first", () => {
    const m = new Masker([], today);
    expect(m.mask("Cita el 3 de septiembre de 2027 y el 4 sep 2027.")).toBe("Cita el [DATE_1] y el [DATE_2].");
  });

  it("stays fast on long text with no matches (no slow patterns)", () => {
    const m = new Masker([], today);
    for (const chunk of ["a", "1", "a.", "1 ", "A1", "a@"]) {
      expect(fastest(() => m.mask(chunk.repeat(20_000))), chunk).toBeLessThan(200);
    }
    expect(m.mask("write to lucia.prat@mail.com")).toBe("write to [EMAIL_1]");
  });
});

describe("screenHider", () => {
  const facts = [
    { label: "Nationality", value: "UTOPIAN" },
    { label: "Place of birth", value: "Port Lumen, Utopia" },
    { label: "Issuing authority", value: "LUMEN/UTOPIA" },
    { label: "Date of birth", value: "14/03/1992" },
    { label: "Employer", value: "Nordbyte" },
  ];
  const hide = screenHider(facts, ["Lena Ortiz Brandt"]);

  it("hides nationality, places and your first name, on screen only", () => {
    expect(hide("**Nationality:** UTOPIAN, born in Port Lumen (Utopia). Hi Lena!")).toBe(
      `**Nationality:** ${HIDDEN}, born in ${HIDDEN} ${HIDDEN} (${HIDDEN}). Hi ${HIDDEN}!`,
    );
    expect(hide("Authority: LUMEN/UTOPIA")).toBe(`Authority: ${HIDDEN}/${HIDDEN}`);
  });

  it("hides each word of an approved name, however the model writes it", () => {
    const h = screenHider([{ label: "Full name", value: "LENA MARIE ORTIZ de la BRANDT" }], []);
    expect(h("Your first name is LENA, middle name Marie, last name Ortiz de la Brandt.")).toBe(
      `Your first name is ${HIDDEN}, middle name ${HIDDEN}, last name ${HIDDEN} de la ${HIDDEN}.`,
    );
    expect(h("Lenatech and Ortizville stay")).toBe("Lenatech and Ortizville stay");
  });

  it("hides sex after its label, and leaves other words alone", () => {
    expect(hide("**Sex:** F")).toBe(`**Sex:** ${HIDDEN}`);
    expect(hide("Fees for Nordbyte, 14/03/1992, [PERSON_1]")).toBe("Fees for Nordbyte, 14/03/1992, [PERSON_1]");
  });
});

describe("learnFound", () => {
  it("masks what the privacy-filter model found, next to the approved facts", () => {
    const m = new Masker([{ label: "Tenant name", value: "Lena Ortiz" }], today);
    m.learnFound([
      { value: "Marc Vidal", kind: FOUND_KIND.private_person },
      { value: "Carrer de la Lluna 8", kind: FOUND_KIND.private_address },
      { value: "Lena Ortiz", kind: "PERSON" },
      { value: "Al", kind: "PERSON" },
    ]);
    expect(m.mask("Lena Ortiz rents from Marc Vidal, Carrer de la Lluna 8. Al agreed.")).toBe(
      "[PERSON_1] rents from [PERSON_2], [ADDRESS_1]. Al agreed.",
    );
  });
});
