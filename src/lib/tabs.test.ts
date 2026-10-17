import { describe, expect, it } from "vitest";
import { tabKey, visit } from "./tabs";

const tab = (key: string, url = key) => ({ key, url });

describe("tabs", () => {
  it("gives each document its own tab, and one tab per screen, Ask included", () => {
    expect(tabKey("/ask")).toBe("/ask");
    expect(tabKey("/ask")).toBe("/ask");
    expect(tabKey("/")).toBe("/");
    expect(tabKey("/doc/12")).toBe("/doc/12");
  });

  it("switches to an open tab and keeps where it was", () => {
    const tabs = [tab("/"), tab("/ask?chat=a")];
    expect(visit(tabs, tab("/", "/?folder=7"), "/ask?chat=a", false)).toEqual([tab("/", "/?folder=7"), tab("/ask?chat=a")]);
  });

  it("opens a new tab right after the one you came from", () => {
    const tabs = [tab("/"), tab("/calendar")];
    expect(visit(tabs, tab("/doc/1"), "/", false).map((t) => t.key)).toEqual(["/", "/doc/1", "/calendar"]);
    expect(visit([], tab("/"), null, false)).toEqual([tab("/")]);
  });

  it("keeps one Ask tab and remembers which chat it shows", () => {
    const tabs = [tab("/"), tab("/ask", "/ask?chat=a")];
    expect(visit(tabs, tab("/ask", "/ask?chat=b"), "/ask", false)).toEqual([tab("/"), tab("/ask", "/ask?chat=b")]);
  });

  it("renames the tab when its address is replaced", () => {
    const tabs = [tab("/"), tab("/doc/1")];
    expect(visit(tabs, tab("/doc/2"), "/doc/1", true).map((t) => t.key)).toEqual(["/", "/doc/2"]);
  });
});
