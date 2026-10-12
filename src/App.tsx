import { useEffect, useState } from "react";
import { Route, Routes } from "react-router";
import { Sidebar } from "./components/Sidebar";
import { EyeOff } from "lucide-react";
import { LIBRARY_CHANGED, libraryStats } from "./lib/library";
import { useVeil } from "./lib/veil";
import { fromIso } from "./lib/calendar";
import { useReminders } from "./lib/reminders";
import { useCalendar } from "./lib/useCalendar";
import { Ask } from "./routes/Ask";
import { Calendar } from "./routes/Calendar";
import { Connections } from "./routes/Connections";
import { Contacts } from "./routes/Contacts";
import { Inbox } from "./routes/Inbox";
import { Library } from "./routes/Library";
import { Me } from "./routes/Me";
import { Opportunities } from "./routes/Opportunities";
import { Settings } from "./routes/Settings";

export default function App() {
  const [pending, setPending] = useState(0);
  const [toFile, setToFile] = useState(0);
  const veil = useVeil();
  const calendar = useCalendar();
  useReminders(calendar.events, calendar.done);
  // Appointments, deadlines and expiries in the next 14 days.
  const soon = calendar.events.filter((e) => {
    const days = (fromIso(e.date).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000;
    return !calendar.done.has(e.key) && days >= 0 && days <= 14 && ["appointment", "deadline", "expires"].includes(e.kind);
  }).length;

  useEffect(() => {
    const refresh = () =>
      libraryStats().then((s) => {
        setPending(s.pendingFacts);
        setToFile(s.toFile);
      });
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar pending={pending} toFile={toFile} soon={soon} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The window has no title bar; this strip lets you drag it. */}
        <div data-tauri-drag-region className="flex h-8 shrink-0 items-center justify-center">
          {veil.on && (
            <button
              type="button"
              onClick={veil.toggle}
              className="inline-flex items-center gap-1.5 rounded-full bg-private px-3 py-0.5 text-[12px] font-semibold text-[#0b0b0f]"
            >
              <EyeOff aria-hidden className="size-3.5" /> Private details hidden · ⌘⇧H to show
            </button>
          )}
        </div>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-8">
          <Routes>
            <Route index element={<Library />} />
            <Route path="me" element={<Me />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="ask" element={<Ask />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="opportunities" element={<Opportunities />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="connections" element={<Connections />} />
            <Route path="settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
