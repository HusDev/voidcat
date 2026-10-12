import { useEffect, useState } from "react";
import { Route, Routes } from "react-router";
import { Sidebar } from "./components/Sidebar";
import { LIBRARY_CHANGED, libraryStats } from "./lib/library";
import { Ask } from "./routes/Ask";
import { Connections } from "./routes/Connections";
import { Inbox } from "./routes/Inbox";
import { Library } from "./routes/Library";

export default function App() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => libraryStats().then((s) => setPending(s.pendingFacts));
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar pending={pending} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The window has no title bar; this strip lets you drag it. */}
        <div data-tauri-drag-region className="h-8 shrink-0" />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-8">
          <Routes>
            <Route index element={<Library />} />
            <Route path="ask" element={<Ask />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="connections" element={<Connections />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
