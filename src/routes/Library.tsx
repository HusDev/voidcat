import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, Eye, FileText, FolderInput, FolderSync, LoaderCircle, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { FolderPicker } from "../components/FolderPicker";
import { LabelChips } from "../components/LabelChips";
import { RenameInput } from "../components/RenameInput";
import { ToFile } from "../components/ToFile";
import {
  type Document,
  type Fact,
  type Folder,
  type Hit,
  LIBRARY_CHANGED,
  announceChange,
  downloadZip,
  dragDocument,
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
  renameDocument,
  searchLibrary,
} from "../lib/library";
import { refileDocument } from "../lib/extract";
import { dateKind } from "../lib/calendar";
import { checkAll, removeLabel, useLabels } from "../lib/labels";
import { parseDate } from "../lib/privacy";
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
  const [pending, setPending] = useState<Fact[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [moving, setMoving] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  /** Documents being filed again, or why that failed. */
  const [refiling, setRefiling] = useState(new Map<string, string | null>());
  const [params] = useSearchParams();
  const folderId = params.get("folder");
  const folder = folders.find((f) => f.id === folderId);
  const progress = useProgress();
  const labels = useLabels();
  const veil = useVeil();

  const refresh = useCallback(() => {
    listDocuments().then(setDocs);
    listFacts("approved").then(setFacts);
    listFacts("pending").then(setPending);
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
      // Files from Finder carry paths; a document dragged inside the app doesn't, and isn't an upload.
      if (e.payload.type === "enter") setDragging(e.payload.paths.length > 0);
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

  /** Files documents again one by one with the local model; their facts stay. */
  const refile = async (list: Document[]) => {
    setRefiling((m) => new Map([...m, ...list.map((d) => [d.id, null] as const)]));
    for (const d of list) {
      try {
        await refileDocument(d.id, await listFolders());
        setRefiling((m) => {
          const next = new Map(m);
          next.delete(d.id);
          return next;
        });
      } catch (e) {
        setRefiling((m) => new Map(m).set(d.id, e instanceof Error ? e.message : String(e)));
      }
      announceChange();
    }
    setNotice(`Filed ${list.length === 1 ? "it" : `${list.length} documents`} again. Any that need a new folder wait in "To file".`);
  };

  const choose = async () => {
    const picked = await open({ multiple: true, filters: [{ name: "Documents", extensions: fileTypes }] });
    if (picked) add(Array.isArray(picked) ? picked : [picked]);
  };

  const factsOf = (id: string) => facts.filter((f) => f.documentId === id);
  /** A future expiry date from the document's approved facts (a passport's "valid until"). */
  const validUntil = (id: string) => {
    const today = new Date(new Date().toDateString());
    const dates = factsOf(id)
      .filter((f) => dateKind(f.label)?.kind === "expires")
      .map((f) => parseDate(f.value))
      .filter((d): d is Date => !!d && d >= today);
    return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  };
  const toFile = docs.filter((d) => d.filing === "suggested");
  const inView = folderId ? docs.filter((d) => d.folderId === folderId) : docs.filter((d) => d.filing !== "suggested");
  const toCheck = (id: string) => pending.filter((f) => f.documentId === id).length;
  // Documents with facts you haven't checked get their own section, so it's clear what still needs you.
  const review = inView.filter((d) => toCheck(d.id) > 0);
  const shown = inView.filter((d) => toCheck(d.id) === 0);
  // Possible copies, grouped: each label points at another document of its group.
  const dupeGroups: Document[][] = [];
  for (const l of labels.labels.filter((l) => l.kind === "duplicate")) {
    const ids = [l.documentId, l.relatedId ?? ""];
    const group = dupeGroups.find((g) => g.some((d) => ids.includes(d.id)));
    const docsOf = ids.map((id) => inView.find((d) => d.id === id)).filter((d): d is Document => !!d);
    if (group) docsOf.forEach((d) => !group.includes(d) && group.push(d));
    else if (docsOf.length) dupeGroups.push(docsOf);
  }
  // Read and filed before folders existed: offer to sort them.
  const unsorted = docs.filter((d) => d.status === "filed" && !d.folderId && !d.filing);
  const busy = (s?: Step) => s && (s.stage === "queued" || s.stage === "reading" || s.stage === "filing");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="m-0 text-[30px] font-light tracking-tight">
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
          {inView.length} {inView.length === 1 ? "document" : "documents"}
          {!folder && ` · ${facts.length} ${facts.length === 1 ? "fact" : "facts"}`}
        </span>
        {folder && inView.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              try {
                if (await downloadZip(folder.name, inView.map((d) => d.id))) setNotice(`Saved ${inView.length} ${inView.length === 1 ? "document" : "documents"} as ${folder.name}.zip.`);
              } catch (e) {
                setNotice(`The zip could not be saved: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[13px] hover:border-ink-2"
          >
            <Download aria-hidden className="size-4" /> Download zip
          </button>
        )}
        {folder && inView.some((d) => d.status === "filed") && (
          <button
            type="button"
            onClick={() => refile(inView.filter((d) => d.status === "filed"))}
            disabled={refiling.size > 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[13px] hover:border-ink-2 disabled:opacity-50"
          >
            <FolderSync aria-hidden className="size-4" /> Re-file these {inView.filter((d) => d.status === "filed").length}
          </button>
        )}
        <label htmlFor="lib-search" className="ml-auto flex h-10 w-80 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm text-ink-2">
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
            className={`flex items-center gap-4.5 rounded-xl border-2 border-dashed px-6 py-5 transition-colors ${dragging ? "border-accent bg-accent-soft" : "border-accent/40 bg-accent-soft/40"}`}
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
              className="ml-auto h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
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
              <button type="button" onClick={() => process(unsorted)} className="h-8 rounded-md bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-strong">
                Suggest folders
              </button>
            </div>
          )}

          {review.length > 0 && (
            <section aria-labelledby="needs-review" className="flex flex-col gap-3 rounded-2xl bg-accent-soft p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="needs-review" className="m-0 text-[15px] font-bold">
                  Needs your review
                </h2>
                <span className="text-[13px] text-ink-2">
                  {review.length} {review.length === 1 ? "document" : "documents"} · {review.reduce((n, d) => n + toCheck(d.id), 0)} facts waiting. Nothing is used until you approve it.
                </span>
              </div>
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 p-0">
                {review.map((d) => {
                  const left = toCheck(d.id);
                  const done = factsOf(d.id).length;
                  return (
                    <li key={d.id} draggable onDragStart={(e) => dragDocument(e, d.id)} className="flex flex-col gap-2.5 rounded-xl border border-line-strong bg-card p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-semibold text-ink-2">
                          {d.folderName ? <Private>{d.folderName}</Private> : (d.area ?? "Not filed yet")}
                        </span>
                        <span className="shrink-0 rounded-full bg-private-soft px-2 py-0.5 text-xs font-semibold text-private-ink">{left} to check</span>
                      </div>
                      <span className="text-[15px] font-semibold leading-snug">
                        <Private>{d.title}</Private>
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-ground">
                          <span className="block h-full bg-accent" style={{ width: `${(done / (done + left)) * 100}%` }} />
                        </span>
                        <span className="text-[12.5px] text-ink-2">
                          {done} of {done + left} approved
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openDocument(d.id)}
                        className="mt-1 self-start rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-strong"
                      >
                        Review {left} {left === 1 ? "fact" : "facts"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {labels.progress ? (
            <p role="status" className="m-0 flex items-center gap-2 text-sm text-link">
              <LoaderCircle aria-hidden className="size-4 animate-spin" /> Checking documents on this Mac… {labels.progress.done} of {labels.progress.total}
            </p>
          ) : (
            labels.waiting > 0 &&
            !folder && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
                <span className="flex-1">
                  {labels.waiting} {labels.waiting === 1 ? "document hasn't" : "documents haven't"} been checked for expiry, copies, missing signatures or parts.
                </span>
                <button type="button" onClick={() => checkAll()} className="h-8 rounded-md bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-strong">
                  Check them
                </button>
              </div>
            )
          )}

          {dupeGroups.map((group) => (
            <section key={group.map((d) => d.id).join()} aria-label="Possible duplicates" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="m-0 text-[15px] font-bold">These look like the same document</h2>
                <span className="text-[13px] text-ink-2">Keep the right one and remove the others, or tell Voidcat they're different.</span>
              </div>
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5 p-0">
                {group.map((d) => (
                  <li key={d.id} className="flex flex-col gap-2 rounded-xl border border-line bg-ground/50 p-3">
                    <span className="truncate text-xs font-semibold text-ink-2">{d.folderName ? <Private>{d.folderName}</Private> : (d.area ?? "Not filed yet")}</span>
                    <span className="font-semibold">
                      <Private>{d.title}</Private>
                    </span>
                    <span className="text-[12.5px] text-ink-2">
                      {d.pageCount ? `${d.pageCount} ${d.pageCount === 1 ? "page" : "pages"} · ` : ""}added {formatDay(d.addedAt)}
                    </span>
                    <LabelChips documentId={d.id} labels={labels.labels.filter((l) => l.kind !== "duplicate")} />
                    <div className="mt-auto flex items-center gap-1.5 pt-1">
                      <button type="button" onClick={() => openDocument(d.id)} className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2">
                        <Eye aria-hidden className="size-4" /> Open
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(d.id)}
                        className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-ink-2 hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 aria-hidden className="size-4" /> Remove this copy
                      </button>
                    </div>
                    {confirming === d.id && (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-[12.5px] text-ink-2">Remove it from Voidcat?</span>
                        <button type="button" onClick={() => setConfirming(null)} className="h-7 px-2 text-[12.5px] text-ink-2 hover:text-ink">
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await removeDocument(d.id);
                            setConfirming(null);
                            announceChange();
                          }}
                          className="h-7 rounded-md bg-danger px-2 text-[12.5px] font-semibold text-white"
                        >
                          Remove for good
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={async () => {
                  for (const d of group) await removeLabel(d.id, "duplicate");
                  announceChange();
                }}
                className="self-start text-[13px] text-link hover:underline"
              >
                They're different documents
              </button>
            </section>
          ))}

          {review.length > 0 && shown.length > 0 && <h2 className="m-0 -mb-1 text-[15px] font-bold">All set</h2>}

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
                  <li
                    key={d.id}
                    draggable
                    onDragStart={(e) => dragDocument(e, d.id)}
                    title="Drag onto a folder in the sidebar to move it"
                    className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-ink-2">
                        {d.folderName ? <Private>{d.folderName}</Private> : (d.area ?? "Not filed yet")}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
                    </div>
                    {renaming === d.id ? (
                      <RenameInput
                        id={`rename-card-${d.id}`}
                        value={d.title}
                        label="Document name"
                        className="text-[15px] font-semibold text-ink"
                        onSave={async (title) => {
                          await renameDocument(d.id, title);
                          announceChange();
                        }}
                        onDone={() => setRenaming(null)}
                      />
                    ) : (
                      <span className="text-[15px] font-semibold leading-snug" onDoubleClick={() => setRenaming(d.id)} title="Double-click to rename">
                        <Private>{d.title}</Private>
                      </span>
                    )}

                    <LabelChips documentId={d.id} labels={labels.labels.filter((l) => l.kind !== "duplicate")} />
                    {validUntil(d.id) && (
                      <span className="text-[12.5px] text-ok">
                        Valid until <Private>{validUntil(d.id)!.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Private>
                      </span>
                    )}

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
                    {refiling.has(d.id) &&
                      (refiling.get(d.id) ? (
                        <span className="text-[13px] text-danger">{refiling.get(d.id)}</span>
                      ) : (
                        <span role="status" className="flex items-center gap-1.5 text-[13px] text-link">
                          <LoaderCircle aria-hidden className="size-4 animate-spin" /> Filing again on this Mac…
                        </span>
                      ))}

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
                    {confirming === d.id ? (
                      <div className="mt-auto flex items-center gap-2 pt-1">
                        <span className="flex-1 text-[13px] text-ink-2">Remove it from Voidcat?</span>
                        <button type="button" onClick={() => setConfirming(null)} className="h-8 px-2 text-[13px] text-ink-2 hover:text-ink">
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await removeDocument(d.id);
                            setConfirming(null);
                            announceChange();
                          }}
                          className="h-8 rounded-md bg-danger px-2.5 text-[13px] font-semibold text-white"
                        >
                          Remove for good
                        </button>
                      </div>
                    ) : (
                      <div className="mt-auto flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => openDocument(d.id)}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2"
                        >
                          <Eye aria-hidden className="size-4" /> Open
                        </button>
                        {d.status !== "filed" && !busy(step) && (
                          <button
                            type="button"
                            onClick={() => process([d])}
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2"
                          >
                            <Sparkles aria-hidden className="size-4" /> Find facts
                          </button>
                        )}
                        {/* Less frequent actions: icons with a label on hover, all on one line. */}
                        <span className="ml-auto flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setMoving(moving === d.id ? null : d.id)}
                            aria-label="Move to a folder"
                            aria-expanded={moving === d.id}
                            title="Move to a folder"
                            className={`grid size-8 place-items-center rounded-md hover:bg-ground hover:text-ink ${moving === d.id ? "bg-ground text-ink" : "text-ink-2"}`}
                          >
                            <FolderInput aria-hidden className="size-4" />
                          </button>
                          {d.status === "filed" && (
                            <button
                              type="button"
                              onClick={() => refile([d])}
                              disabled={refiling.has(d.id) && !refiling.get(d.id)}
                              aria-label="Re-file"
                              title="Re-file: decide the area and folder again. Facts are kept."
                              className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink disabled:opacity-40"
                            >
                              <FolderSync aria-hidden className="size-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirming(d.id)}
                            aria-label={`Remove ${d.title}`}
                            title="Remove"
                            className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </button>
                        </span>
                      </div>
                    )}
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
