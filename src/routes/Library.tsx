import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { Eye, FileText, Search, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type Document, fileTypes, formatDay, formatSize, hasLibrary, importFiles, listDocuments, openDocument, removeDocument } from "../lib/library";

const statusBadge: Record<Document["status"], [string, string]> = {
  new: ["Not read yet", "bg-private-soft text-private-ink"],
  read: ["Read", "bg-ground text-ink-2"],
  filed: ["Filed", "bg-ok-soft text-ok"],
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function Library() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = useCallback(() => listDocuments().then(setDocs), []);

  const add = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      const r = await importFiles(paths);
      const parts = [
        r.added.length && `Added ${r.added.length} ${r.added.length === 1 ? "document" : "documents"}`,
        r.duplicates.length && `${r.duplicates.length} already in your library`,
        r.failed.length && `${r.failed.length} could not be read (${r.failed.map(([n]) => n).join(", ")})`,
      ].filter(Boolean);
      setNotice(parts.join(" · "));
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
    if (!hasLibrary) return;
    // Tauri delivers dropped files with their paths, which the browser's own drop event can't.
    const off = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "over" || e.payload.type === "enter") setDragging(true);
      else if (e.payload.type === "leave") setDragging(false);
      else if (e.payload.type === "drop") {
        setDragging(false);
        add(e.payload.paths);
      }
    });
    return () => {
      off.then((f) => f());
    };
  }, [refresh, add]);

  const choose = async () => {
    const picked = await open({ multiple: true, filters: [{ name: "Documents", extensions: fileTypes }] });
    if (picked) add(Array.isArray(picked) ? picked : [picked]);
  };

  const q = norm(query.trim());
  const shown = q ? docs.filter((d) => norm(`${d.title} ${d.fileName} ${d.area ?? ""}`).includes(q)) : docs;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="m-0 text-[26px] font-bold tracking-tight">Library</h1>
        <span className="text-sm tabular-nums text-ink-2">
          {docs.length} {docs.length === 1 ? "document" : "documents"}
        </span>
        <label htmlFor="lib-search" className="ml-auto flex h-10 w-80 items-center gap-2 rounded-lg border border-[#d3d8dd] bg-card px-3 text-sm text-ink-2">
          <Search aria-hidden className="size-4" />
          <input
            id="lib-search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search your documents…"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none"
          />
        </label>
      </header>

      <section
        aria-label="Drop files"
        className={`flex items-center gap-4.5 rounded-xl border-2 border-dashed px-6 py-5 transition-colors ${dragging ? "border-link bg-[#e3eef2]" : "border-[#9fb4c1] bg-[#f7fafb]"}`}
      >
        <Upload aria-hidden className="size-10 text-link" strokeWidth={1.6} />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{dragging ? "Let go to add" : "Drop any document here"}</span>
          <span className="text-[13.5px] text-ink-2">PDF, photo, scan or email. It's copied into your library on this Mac; nothing is uploaded.</span>
        </div>
        <button
          type="button"
          onClick={choose}
          disabled={!hasLibrary}
          className="ml-auto h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2 disabled:opacity-50"
        >
          Choose files
        </button>
      </section>

      {!hasLibrary && <p className="m-0 text-sm text-private-ink">This is the browser preview. Open the desktop app to add documents.</p>}
      {notice && (
        <p role="status" className="m-0 text-sm text-ink-2">
          {notice}
        </p>
      )}

      {docs.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-xl border border-line bg-card px-6 py-12 text-center">
          <FileText aria-hidden className="size-8 text-ink-2" strokeWidth={1.5} />
          <p className="m-0 font-semibold">Your library is empty</p>
          <p className="m-0 max-w-sm text-sm text-ink-2">Drop in a passport scan, a contract or a payslip to start. Everything stays on this Mac.</p>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5 p-0">
          {shown.map((d) => {
            const [label, cls] = statusBadge[d.status];
            return (
              <li key={d.id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">{d.area ?? "Not filed yet"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
                </div>
                <span className="text-[15px] font-semibold leading-snug">{d.title}</span>
                <span className="truncate text-[13px] text-ink-2" title={d.fileName}>
                  {d.fileName} · {formatSize(d.sizeBytes)} · added {formatDay(d.addedAt)}
                </span>
                <div className="mt-auto flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openDocument(d.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d3d8dd] px-2.5 text-[13px] hover:border-ink-2"
                  >
                    <Eye aria-hidden className="size-4" /> Open
                  </button>
                  {confirming === d.id ? (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await removeDocument(d.id);
                          setConfirming(null);
                          refresh();
                        }}
                        className="h-8 rounded-md bg-[#b42318] px-2.5 text-[13px] font-semibold text-white"
                      >
                        Remove for good
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="h-8 px-2 text-[13px] text-ink-2 hover:text-ink">
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(d.id)}
                      aria-label={`Remove ${d.title}`}
                      className="ml-auto grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {shown.length === 0 && <p className="text-sm text-ink-2">Nothing matches “{query.trim()}”.</p>}
        </ul>
      )}
    </div>
  );
}
