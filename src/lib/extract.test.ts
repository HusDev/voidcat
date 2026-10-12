import { describe, expect, it } from "vitest";
import { folderList, folderName } from "./extract";

describe("folders", () => {
  it("keeps two levels", () => {
    expect(folderName("Homes › Leases", "Home")).toBe("Leases");
    expect(folderName("Home > Lease Provença 210", "Home")).toBe("Lease Provença 210");
    expect(folderName("payslips", "Work & money")).toBe("Payslips");
    expect(folderName("Home", "Home")).toBe("General");
  });

  it("lists folders for the model", () => {
    expect(folderList([])).toBe("(no folders yet)");
    expect(folderList([{ id: "1", area: "Identity", name: "Passports", documents: 1 }])).toBe("- Identity › Passports (1 document)");
  });
});
