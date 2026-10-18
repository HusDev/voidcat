import { describe, expect, it, vi } from "vitest";
import type { Fact } from "./library";

vi.mock("./extract", () => ({
  pagesText: (p: string[]) => p.join("\n"),
  askLocal: vi.fn(async () => ({
    ownerName: "F1",
    fields: [
      { group: "Identity", label: "Name", fact: "F1" },
      { group: "Identity", label: "NIE", fact: "f2" },
      { group: "Home", label: "Address", fact: "F3" },
      { group: "Home", label: "Address again", fact: "F3" },
      { group: "Other", label: "Made up", fact: "F99" },
    ],
    conflicts: [
      { label: "Address", facts: ["F3", "F4"] },
      { label: "Only one real", facts: ["F3", "F42"] },
    ],
    missing: [{ label: "Social security number", why: "Not in any document." }],
    timeline: [{ when: "2022-06", what: "Arrived in Spain", fact: "F5" }, { when: "2018", what: "Graduated", fact: null }],
  })),
}));

const { buildProfile, contactFacts, initials, likelyOwner, reachable } = await import("./people");

const fact = (id: string, label: string, value: string): Fact => ({ id, documentId: "d", documentTitle: "Doc", documentMime: null, label, value, page: 1, status: "approved" });

describe("people", () => {
  it("builds a profile that only points at real facts, once each", async () => {
    const facts = [fact("a", "Name", "Omar Haddad"), fact("b", "NIE", "Y1234567X"), fact("c", "Address", "C/ Robles 214"), fact("d", "Address", "C/ Provença 210"), fact("e", "Arrival", "06/2022")];
    const p = await buildProfile(facts);
    expect(p.ownerFactId).toBe("a");
    expect(p.fields.map((f) => f.factId)).toEqual(["a", "b", "c"]);
    expect(p.conflicts).toEqual([{ label: "Address", factIds: ["c", "d"] }]);
    expect(p.timeline[0]).toEqual({ when: "2022-06", what: "Arrived in Spain", factId: "e" });
    expect(p.factCount).toBe(5);
  });

  it("hides people's details but not organisations", () => {
    const base = { role: null, category: "home" as const, organisation: null, address: null, idNumber: null, edited: false, mentions: [] };
    const known = contactFacts([
      { ...base, id: "1", name: "Carla Ruiz", kind: "person", phone: "+34 600 000 000", email: "carla@mail.com" },
      { ...base, id: "2", name: "Banco Sabadell", kind: "organisation", phone: "900 100 200", email: null },
    ]);
    expect(known.map((k) => k.value)).toEqual(["Carla Ruiz", "+34 600 000 000", "carla@mail.com"]);
  });

  it("shows only contacts you can reach, or edited by hand", () => {
    const none = { email: null, phone: null, edited: false };
    expect(reachable(none)).toBe(false);
    expect(reachable({ ...none, email: "info@agencia.example" })).toBe(true);
    expect(reachable({ ...none, email: "see website" })).toBe(false);
    expect(reachable({ ...none, phone: "+34 912 345 678" })).toBe(true);
    expect(reachable({ ...none, phone: "060" })).toBe(false);
    expect(reachable({ ...none, edited: true })).toBe(true);
  });

  it("makes initials from words", () => {
    expect(initials("Carla Ruiz Martín")).toBe("CR");
    expect(initials("  banco  sabadell ")).toBe("BS");
  });
});

describe("likelyOwner", () => {
  const at = (id: string, doc: string, label: string, value: string): Fact => ({ ...fact(id, label, value), documentId: doc });
  it("picks the name approved in the most documents", () => {
    const facts = [
      at("a", "tie", "Nombre", "Lena Ortiz Brandt"),
      at("b", "lease1", "Nombre de la arrendataria", "Lena Ortiz Brandt"),
      at("c", "lease2", "Nombre de la arrendataria", "Lena Ortiz Brandt"),
      at("d", "lease1", "Nombre del arrendador", "Marc Vidal Soler"),
      at("e", "lease2", "Nombre del arrendador", "Marc Vidal Soler"),
      at("f", "dentist", "Doctor's name", "Dr. Pau Riera"),
    ];
    expect(likelyOwner(facts)).toBe("a");
  });
  it("names nobody from a single document", () => {
    expect(likelyOwner([at("a", "tie", "Name", "Lena Ortiz Brandt")])).toBeNull();
  });
});
