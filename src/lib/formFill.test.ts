import { describe, expect, it } from "vitest";
import { type Known, fieldBlanks, fillPrompt, findBlanks, resolveFills } from "./formFill";
import type { Run } from "./signing";

const run = (str: string, x: number, y: number, w = 0.2): Run => ({ str, x, y, w, h: 0.015 });

describe("finding the empty places on a form", () => {
  it("finds labels with room after them and lines to write on, in reading order", () => {
    const page = [
      run("SOLICITUD DE CITA", 0.3, 0.05),
      run("Apellidos: ______________", 0.1, 0.3, 0.5),
      run("Nombre:", 0.1, 0.2, 0.08),
      run("NIE:", 0.1, 0.4, 0.04),
      run("X-0000000-T", 0.16, 0.4),
      run("Domicilio", 0.1, 0.5, 0.1),
      run("..............................", 0.22, 0.5, 0.5),
    ];
    const blanks = findBlanks([page]);
    expect(blanks.map((b) => b.label)).toEqual(["Nombre", "Apellidos", "Domicilio"]);
    expect(blanks.map((b) => b.id)).toEqual(["B1", "B2", "B3"]);
    const surname = blanks[1];
    expect(surname.kind === "page" && surname.x).toBeGreaterThan(0.1 + 0.5 * (10 / 25));
    const address = blanks[2];
    expect(address.kind === "page" && address.x).toBeCloseTo(0.224, 3);
  });

  it("numbers the form's own boxes after the page places", () => {
    expect(fieldBlanks([{ name: "f1_01[0]", label: "Apellidos" }], 2)).toEqual([{ id: "B3", kind: "field", field: "f1_01[0]", label: "Apellidos" }]);
  });
});

describe("matching places to your facts", () => {
  const known: Known[] = [
    { id: "F1", label: "Full name", value: "Lena Marsh" },
    { id: "F2", label: "NIE", value: "Y-1234567-Z" },
  ];
  const blanks = findBlanks([[run("Nombre:", 0.1, 0.2, 0.08), run("Fecha:", 0.1, 0.6, 0.07), run("Firma:", 0.5, 0.6, 0.07)]]);

  it("shows the model numbered places and facts", () => {
    const prompt = fillPrompt(blanks, known);
    expect(prompt).toContain("B1 | page 1 | Nombre");
    expect(prompt).toContain("F2 | NIE | Y-1234567-Z");
  });

  it("keeps real ids only, one value per place, and writes TODAY as the date", () => {
    const out = resolveFills(
      {
        fills: [
          { blank: "B1", fact: "F1" },
          { blank: "b1", fact: "F2" },
          { blank: "B2", fact: "today" },
          { blank: "B9", fact: "F1" },
          { blank: "B3", fact: "F7" },
        ],
      },
      blanks,
      known,
      "21/10/2026",
    );
    expect(out.map((s) => [s.blank.label, s.value])).toEqual([
      ["Nombre", "Lena Marsh"],
      ["Fecha", "21/10/2026"],
    ]);
  });
});
