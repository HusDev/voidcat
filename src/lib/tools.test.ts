import { describe, expect, it } from "vitest";
import { catalogLines, resolveBundle, todayLine } from "./tools";

const catalog = [
  { id: "a", title: "Passport", folder: "Identity › Passports", type: "passport" },
  { id: "b", title: "Residence card", folder: "Residency › Permits", type: "residence_card" },
  { id: "c", title: "Fee receipt", folder: null, type: null },
];

describe("tools", () => {
  it("lists the library by D-number", () => {
    expect(catalogLines(catalog).split("\n")[2]).toBe("D3 | Fee receipt | Not filed | ");
  });

  it("turns D-numbers into documents, once each, dropping made-up ones", () => {
    expect(resolveBundle({ documents: ["D2", "d3", "3", "D9"], name: "[PERSON_1] residency" }, catalog, (s) => s.replace("[PERSON_1]", "Sam"))).toEqual({
      name: "Sam residency",
      ids: ["b", "c"],
      titles: ["Residence card", "Fee receipt"],
    });
  });

  it("gives nothing for an empty or wrong call", () => {
    expect(resolveBundle({ documents: ["D9"], name: "x" }, catalog)).toBeNull();
    expect(resolveBundle({ name: "x" }, catalog)).toBeNull();
  });
});

describe("todayLine", () => {
  it("gives the model today's date", () => {
    expect(todayLine(new Date(2026, 9, 17))).toContain("Today is Saturday, 17 October 2026");
  });
});
