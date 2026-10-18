import { describe, expect, it } from "vitest";
import { keysFrom, masterFromCode, newMaster, open, openText, recoveryCode, seal, sealText } from "./vault";

const seven = new Uint8Array(32).fill(7);

describe("browser vault", () => {
  it("derives the same keys and recovery key as the Mac (values pinned in vault.rs too)", async () => {
    expect((await keysFrom(seven, true)).databaseHex).toBe("11776c2d26779b5eb27bde41c7199f4b0559b1627484b492e82ababb918f4307");
    expect(recoveryCode(seven)).toBe("A4DQ-OBYH-A4DQ-OBYH-A4DQ-OBYH-A4DQ-OBYH-A4DQ-OBYH-A4DQ-OBYH-A4DQ");
  });

  it("reads a recovery key back however it is typed", () => {
    const master = newMaster();
    const code = recoveryCode(master);
    expect(masterFromCode(code)).toEqual(master);
    expect(masterFromCode(code.toLowerCase().replace(/-/g, " ").replace(/o/g, "0"))).toEqual(master);
    expect(masterFromCode("ABCD-EFGH")).toBeNull();
    expect(masterFromCode("not a key!")).toBeNull();
  });

  it("seals and opens, and refuses changed data or another key", async () => {
    const keys = await keysFrom(seven);
    const sealed = await sealText(keys.records, "invented lease, Carrer del Sol 21");
    expect(new TextDecoder().decode(sealed)).not.toContain("Carrer");
    expect(await openText(keys.records, sealed)).toBe("invented lease, Carrer del Sol 21");

    const changed = sealed.slice();
    changed[changed.length - 1] ^= 1;
    await expect(open(keys.records, changed)).rejects.toThrow();
    await expect(open(keys.files, sealed)).rejects.toThrow();
    expect((await seal(keys.files, new Uint8Array([1, 2]))).length).toBe(6 + 12 + 2 + 16);
  });
});
