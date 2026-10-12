import { useCallback, useEffect, useState } from "react";
import { type CalEvent, doneKeys, eventsFromFacts, fromManual, listManualEvents } from "./calendar";
import { type Document, LIBRARY_CHANGED, hasLibrary, listDocuments, listFacts } from "./library";

/** Every calendar event (from facts, worked out, and manual), sorted, plus which are done. Follows library changes. */
export function useCalendar() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Document[]>([]);

  const refresh = useCallback(async () => {
    if (!hasLibrary) return;
    const [facts, documents, manual, doneList] = await Promise.all([listFacts("approved"), listDocuments(), listManualEvents(), doneKeys()]);
    const all = [...eventsFromFacts(facts, documents, new Date()), ...manual.map((e) => fromManual(e, documents))];
    all.sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
    setEvents(all);
    setDone(new Set(doneList));
    setDocs(documents);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, [refresh]);

  return { events, done, docs, refresh };
}
