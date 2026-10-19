import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosave, type SaveState } from "./noteEditor";

describe("Autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves once typing pauses, keeping the previous version only on the first save", async () => {
    const saves: [string, boolean][] = [];
    const states: SaveState[] = [];
    const a = new Autosave(async (t, k) => void saves.push([t, k]), (s) => states.push(s), 1000);
    a.change("Sh");
    a.change("Shopping");
    await vi.advanceTimersByTimeAsync(999);
    expect(saves).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toEqual([["Shopping", true]]);
    a.change("Shopping list");
    await a.flush();
    expect(saves).toEqual([
      ["Shopping", true],
      ["Shopping list", false],
    ]);
    expect(states[states.length - 1]).toBe("saved");
  });

  it("flushes at once and does nothing when there is nothing new", async () => {
    const save = vi.fn(async () => {});
    const a = new Autosave(save, undefined, 1000);
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    a.change("Call the plumber");
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps the text after a failed save and tries again on the next flush", async () => {
    let fail = true;
    const saved: string[] = [];
    const a = new Autosave(async (t) => {
      if (fail) throw new Error("disk full");
      saved.push(t);
    });
    a.change("Gate code 4417");
    await a.flush();
    expect(a.state).toBe("error");
    expect(a.error).toBe("disk full");
    fail = false;
    await a.flush();
    expect(saved).toEqual(["Gate code 4417"]);
    expect(a.state).toBe("saved");
  });
});
