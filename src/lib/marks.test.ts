import { describe, expect, it } from "vitest";
import { cellHas, findRuns, pageText } from "./marks";

describe("marks", () => {
  it("finds a value across PDF text runs, ignoring case and extra spaces", () => {
    const page = pageText(["La renta mensual es de ", "1.150  euros", ", pagaderos del 1 al 5"]);
    expect(findRuns(page, "1.150 Euros")).toEqual(new Map([[1, [0, 12]]]));
    expect(findRuns(page, "mensual es de 1.150")).toEqual(
      new Map([
        [0, [9, 23]],
        [1, [0, 5]],
      ]),
    );
    expect(findRuns(page, "2.300 euros")).toBeNull();
  });

  it("matches spreadsheet cells by value, not by a short piece of it", () => {
    expect(cellHas("80000", "80000")).toBe(true);
    expect(cellHas("Total comp (excl. bonus)", "total comp")).toBe(true);
    expect(cellHas("1200", "12")).toBe(false);
    expect(cellHas("", "80000")).toBe(false);
  });
});
