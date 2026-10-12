import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { Eye, FileText, FolderInput, LoaderCircle, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { FolderPicker } from "../components/FolderPicker";
import { ToFile } from "../components/ToFile";
import {
  type Document,
  type Fact,
  type Folder,
  type Hit,
  LIBRARY_CHANGED,
  announceChange,
  fileTypes,
  formatDay,
  formatSize,
  hasLibrary,
  importFiles,
  listDocuments,
  fileInFolder,
  listFacts,
  listFolders,
  openDocument,
  removeDocument,
  searchLibrary,
} from "../lib/library";
import { type Step, process, useProgress } from "../lib/pipeline";
import { Private, useVeil } from "../lib/veil";

const statusBadge: Record<Document["status"], [string, string]> = {
  new: ["Not read yet", "bg-private-soft text-private-ink"],
  read: ["Read", "bg-ground text-ink-2"],
  filed: ["Filed", "bg-ok-soft text-ok"],
};

const stageText: Record<Step["stage"], string> = {
  queued: "Waiting…",
  reading: "Reading on this Mac…",
  filing: "Finding facts with the local model…",
  done: "Done",
  failed: "",
};

/** "...the [[renta]] mensual..." → text with the matches in bold. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split(/\[\[|\]\]/).map((part, i) => (i % 2 ? <b key={i} className="bg-private-soft text-ink">{part}</b> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

export function Library() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [moving, setMoving] = useState<string | null>(null);
  const [params] = useSearchParams();
  const folderId = params.get("folder");
  const folder = folders.find((f) => f.id === folderId);
  const progress = useProgress();
  const veil = useVeil();

  const refresh = useCallback(() => {
    listDocuments().then(setDocs);
    listFacts("approved").then(setFacts);
    listFolders().then(setFolders);
  }, []);

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
      process(r.added);
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    if (!hasLibrary) return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
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
      window.removeEventListener(LIBRARY_CHANGED, refresh);
      off.then((f) => f());
    };
  }, [refresh, add]);

  // Search inside the documents' text, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (!q || !hasLibrary) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => searchLibrary(q).then(setHits), 200);
    return () => clearTimeout(t);
  }, [query]);

  const choose = async () => {
    const picked = await open({ multiple: true, filters: [{ name: "Documents", extensions: fileTypes }] });
    if (picked) add(Array.isArray(picked) ? picked : [picked]);
  };

  const factsOf = (id: string) => facts.filter((f) => f.documentId === id);
  const toFile = docs.filter((d) => d.filing === "suggested");
  const shown = folderId ? docs.filter((d) => d.folderId === folderId) : docs.filter((d) => d.filing !== "suggested");
  // Read and filed before folders existed: offer to sort them.
  const unsorted = docs.filter((d) => d.status === "filed" && !d.folderId && !d.filing);
  const busy = (s?: Step) => s && (s.stage === "queued" || s.stage === "reading" || s.stage === "filing");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="m-0 text-[26px] font-bold tracking-tight">
          {folder ? (
            <>
              <Link to="/" className="text-ink-2 no-underline hover:text-ink">
                Library
              </Link>{" "}
              <span className="text-ink-2">›</span> {folder.area} › <Private>{folder.name}</Private>
            </>
          ) : (
            "Library"
          )}
        </h1>
        <span className="text-sm tabular-nums text-ink-2">
          {shown.length} {shown.length === 1 ? "document" : "documents"}
          {!folder && ` · ${facts.length} ${facts.length === 1 ? "fact" : "facts"}`}
        </span>
        <label htmlFor="lib-search" className="ml-auto flex h-10 w-80 items-center gap-2 rounded-lg border border-[#d3d8dd] bg-card px-3 text-sm text-ink-2">
          <Search aria-hidden className="size-4" />
          <input
            id="lib-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search inside your documents…"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none"
          />
        </label>
      </header>

      {hits ? (
        <section aria-label="Search results" className="flex flex-col gap-2">
          <p className="m-0 text-sm text-ink-2">
            {hits.length ? `${hits.length} ${hits.length === 1 ? "page matches" : "pages match"}` : "No page contains all of those words."}
          </p>
          {hits.map((h) => (
            <button
              type="button"
              key={`${h.documentId}-${h.page}`}
              onClick={() => openDocument(h.documentId)}
              className="flex flex-col gap-1 rounded-xl border border-line bg-card px-4 py-3 text-left hover:border-ink-2"
            >
              <span className="text-sm font-semibold">
                <Private>{h.title}</Private> <span className="font-normal text-ink-2">· page {h.page}</span>
              </span>
              <span data-selectable className="text-[13px] leading-relaxed text-ink-2">
                {veil.on ? <Private>{h.snippet.replace(/\[\[|\]\]/g, "")}</Private> : <Snippet text={h.snippet} />}
              </span>
            </button>
          ))}
        </section>
      ) : (
        <>
          <section
            aria-label="Drop files"
            className={`flex items-center gap-4.5 rounded-xl border-2 border-dashed px-6 py-5 transition-colors ${dragging ? "border-link bg-[#e3eef2]" : "border-[#9fb4c1] bg-[#f7fafb]"}`}
          >
            <Upload aria-hidden className="size-10 text-link" strokeWidth={1.6} />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">{dragging ? "Let go to add" : "Drop any document here"}</span>
              <span className="text-[13.5px] text-ink-2">PDF, photo, scan or email. It's read and filed on this Mac; nothing is uploaded.</span>
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

          {!folder && <ToFile docs={toFile} folders={folders} />}

          {!folder && unsorted.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
              <FolderInput aria-hidden className="size-4.5 text-link" />
              <span className="flex-1">
                {unsorted.length} {unsorted.length === 1 ? "document has" : "documents have"} no folder yet.
              </span>
              <button type="button" onClick={() => process(unsorted)} className="h-8 rounded-md bg-ink px-3 text-[13px] font-semibold text-white hover:bg-rail-2">
                Suggest folders
              </button>
            </div>
          )}

          {docs.length === 0 ? (
            <div className="grid place-items-center gap-2 rounded-xl border border-line bg-card px-6 py-12 text-center">
              <FileText aria-hidden className="size-8 text-ink-2" strokeWidth={1.5} />
              <p className="m-0 font-semibold">Your library is empty</p>
              <p className="m-0 max-w-sm text-sm text-ink-2">Drop in a passport scan, a contract or a payslip to start. Everything stays on this Mac.</p>
            </div>
          ) : (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3.5 p-0">
              {shown.map((d) => {
                const step = progress.get(d.id);
                const [label, cls] = statusBadge[d.status];
                const known = factsOf(d.id);
                return (
                  <li key={d.id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-ink-2">
                        {d.folderName ? <Private>{d.folderName}</Private> : (d.area ?? "Not filed yet")}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
                    </div>
                    <span className="text-[15px] font-semibold leading-snug">
                      <Private>{d.title}</Private>
                    </span>

                    {known.length > 0 && (
                      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                        {known.slice(0, 3).map((f) => (
                          <div key={f.id} className="contents">
                            <dt className="text-ink-2">{f.label}</dt>
                            <dd data-selectable className="m-0 min-w-0 truncate">
                              <Private>{f.value}</Private>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    <span className="truncate text-[12.5px] text-ink-2" title={veil.on ? undefined : d.fileName}>
                      <Private>{d.fileName}</Private> · {formatSize(d.sizeBytes)}
                      {d.pageCount ? ` · ${d.pageCount} ${d.pageCount === 1 ? "page" : "pages"}` : ""} · added {formatDay(d.addedAt)}
                    </span>

                    {busy(step) && (
                      <span role="status" className="flex items-center gap-1.5 text-[13px] text-link">
                        <LoaderCircle aria-hidden className="size-4 animate-spin" /> {stageText[step!.stage]}
                      </span>
                    )}
                    {step?.stage === "failed" && <span className="text-[13px] text-private-ink">{step.message}</span>}
                    {step?.stage === "done" && d.status === "filed" && (
                      <Link to="/inbox" className="text-[13px] font-semibold text-link hover:underline">
                        Review the facts found
                      </Link>
                    )}

                    {moving === d.id && (
                      <FolderPicker
                        folders={folders}
                        area={d.area ?? "Other"}
                        onPick={async (area, name) => {
                          await fileInFolder(d.id, area, name);
                          setMoving(null);
                          announceChange();
                        }}
                        onCancel={() => setMoving(null)}
                      />
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openDocument(d.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d3d8dd] px-2.5 text-[13px] hover:border-ink-2"
                      >
                        <Eye aria-hidden className="size-4" /> Open
                      </button>
                      <button
                        type="button"
                        onClick={() => setMoving(moving === d.id ? null : d.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d3d8dd] px-2.5 text-[13px] hover:border-ink-2"
                      >
                        <FolderInput aria-hidden className="size-4" /> Move
                      </button>
                      {d.status !== "filed" && !busy(step) && (
                        <button
                          type="button"
                          onClick={() => process([d])}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d3d8dd] px-2.5 text-[13px] hover:border-ink-2"
                        >
                          <Sparkles aria-hidden className="size-4" /> Find facts
                        </button>
                      )}
                      {confirming === d.id ? (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await removeDocument(d.id);
                              setConfirming(null);
                              announceChange();
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
            </ul>
          )}
        </>
      )}
    </div>
  );
}
