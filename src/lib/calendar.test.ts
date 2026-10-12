import { describe, expect, it } from "vitest";
import { type CalEvent, dateKind, dueReminders, eventsFromFacts, matchPaper, monthCells, monthlyDueDay, toIcs } from "./calendar";
import type { Document, Fact } from "./library";

const today = new Date(2026, 9, 12); // 12 Oct 2026

const doc = (id: string, title: string, docType: string, folderName: string | null = null) =>
  ({ id, title, docType, folderName, fileName: `${id}.pdf`, mime: "application/pdf", sizeBytes: 1, area: null, status: "filed", addedAt: "", textMethod: null, pageCount: 1, folderId: null, filing: null, suggestedArea: null, suggestedFolder: null, suggestedNew: false, suggestionReason: null }) as Document;
const fact = (id: string, documentId: string, documentTitle: string, label: string, value: string): Fact => ({ id, documentId, documentTitle, documentMime: null, label, value, page: 1, status: "approved" });

const docs = [doc("tie", "Residence card (TIE)", "residence_card"), doc("lease", "Rental contract, Robles 214", "rental_contract"), doc("cita", "Cita previa padrón", "appointment")];

describe("calendar", () => {
  it("reads monthly due days in Spanish and English", () => {
    expect(monthlyDueDay("del 1 al 5 de cada mes")).toBe(5);
    expect(monthlyDueDay("dentro de los siete primeros días de cada mes")).toBe(7);
    expect(monthlyDueDay("within the first 7 days")).toBe(7);
    expect(monthlyDueDay("1.150 €/mes")).toBeNull();
  });

  it("knows which dates are history", () => {
    expect(dateKind("Date Issued")).toBeNull();
    expect(dateKind("Date of Birth")).toBeNull();
    expect(dateKind("Valid to")?.kind).toBe("expires");
    expect(dateKind("Fecha de la cita")?.kind).toBe("appointment");
    expect(dateKind("Start date")?.verb).toBe("Starts");
  });

  it("turns approved facts into events and works out renewals and rent", () => {
    const facts = [
      fact("f1", "tie", "Residence card (TIE)", "Valid to", "16/03/2027"),
      fact("f2", "tie", "Residence card (TIE)", "Date Issued", "26/01/2026"),
      fact("f3", "lease", "Rental contract, Robles 214", "Rent Payment Dates", "del 1 al 5 de cada mes"),
      fact("f4", "lease", "Rental contract, Robles 214", "Monthly Rent", "1.150 €/mes"),
      fact("f5", "cita", "Cita previa padrón", "Fecha de la cita", "04/11/2026"),
      fact("f6", "cita", "Cita previa padrón", "Hora", "10:20"),
      fact("f7", "cita", "Cita previa padrón", "Oficina", "OAC Sant Martí"),
      fact("f8", "lease", "Rental contract, Robles 214", "Start date", "1 de marzo de 2026"),
    ];
    const events = eventsFromFacts(facts, docs, today);
    const by = (key: string) => events.find((e) => e.key === key);

    expect(by("fact:f1")).toMatchObject({ date: "2027-03-16", kind: "expires" });
    expect(by("renew:f1")).toMatchObject({ date: "2027-01-15", kind: "deadline", origin: "worked-out" });
    expect(by("fact:f2")).toBeUndefined();
    expect(by("fact:f8")).toBeUndefined(); // in the past
    expect(by("fact:f5")).toMatchObject({ kind: "appointment", time: "10:20", place: "OAC Sant Martí" });
    const rent = events.filter((e) => e.kind === "payment");
    expect(rent.map((e) => e.date)).toEqual(["2026-11-05", "2026-12-05"]);
    expect(rent[0].title).toBe("Pay rent · 1.150 €/mes");
  });

  it("shows only the latest reminder that has passed, once per event", () => {
    const e: CalEvent = { key: "fact:x", title: "Padrón", date: "2026-11-04", time: "10:20", kind: "appointment", origin: "fact" };
    expect(dueReminders([e], new Date(2026, 10, 3, 9, 0), new Set())).toEqual([]);
    expect(dueReminders([e], new Date(2026, 10, 3, 11, 0), new Set())[0]).toMatchObject({ key: "fact:x@1440", when: "tomorrow" });
    expect(dueReminders([e], new Date(2026, 10, 4, 9, 30), new Set())[0]).toMatchObject({ key: "fact:x@60", when: "in 1 hour" });
    expect(dueReminders([e], new Date(2026, 10, 4, 11, 0), new Set())).toEqual([]);
    expect(dueReminders([e], new Date(2026, 10, 4, 9, 30), new Set(["fact:x"]))).toEqual([]);
  });

  it("writes a calendar file with alarms", () => {
    const ics = toIcs([{ key: "fact:x", title: "Padrón, OAC", date: "2026-11-04", time: "10:20", place: "OAC", kind: "appointment", origin: "fact" }], new Date(Date.UTC(2026, 9, 12)));
    expect(ics).toContain("UID:fact:x@voidcat");
    expect(ics).toContain("DTSTART:20261104T102000");
    expect(ics).toContain("SUMMARY:Padrón\\, OAC");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("TRIGGER:-PT60M");
  });

  it("draws months Monday first", () => {
    const nov = monthCells(2026, 10); // 1 Nov 2026 is a Sunday
    expect(nov.slice(0, 7)).toEqual([null, null, null, null, null, null, 1]);
    expect(nov.filter(Boolean)).toHaveLength(30);
  });

  it("matches checklist papers to documents", () => {
    expect(matchPaper("Contrato de alquiler (rental contract)", docs)?.id).toBe("lease");
    expect(matchPaper("Residence card / TIE", docs)?.id).toBe("tie");
    expect(matchPaper("Proof of last rent payment", [docs[0]])).toBeNull();
  });
});
