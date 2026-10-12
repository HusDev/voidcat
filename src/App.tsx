import { useState } from "react";
import { Route, Routes } from "react-router";
import { Sidebar } from "./components/Sidebar";
import { pendingFacts, type PendingFact } from "./lib/sample";
import { Connections } from "./routes/Connections";
import { Inbox } from "./routes/Inbox";
import { Library } from "./routes/Library";

export default function App() {
  const [pending, setPending] = useState<PendingFact[]>(pendingFacts);
  const settle = (id: string) => setPending((list) => list.filter((f) => f.id !== id));

  return (
    <div className="flex h-full">
      <Sidebar pending={pending.length} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The window has no title bar; this strip lets you drag it. */}
        <div data-tauri-drag-region className="h-8 shrink-0" />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-8">
          <Routes>
            <Route index element={<Library />} />
            <Route path="inbox" element={<Inbox facts={pending} onSettle={settle} />} />
            <Route path="connections" element={<Connections />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
