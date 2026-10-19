import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, Eye, FileText, FolderInput, FolderSync, LayoutGrid, List, LoaderCircle, Pencil, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { type DragEvent, Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCloud } from "../cloud/CloudGate";
import { Link, useSearchParams } from "react-router";
import { useCloudStatus } from "../cloud/mac";
import { CloudCardMark, CloudToggle } from "../components/CloudMark";
import { ReadNow } from "../components/ReadNow";
import { FolderPicker } from "../components/FolderPicker";
import { LabelChips } from "../components/LabelChips";
import { RenameInput } from "../components/RenameInput";
import { TaskSection, ToFile, smallButton, taskRow } from "../components/ToFile";
import { NewNoteButton } from "../components/NewNoteButton";
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
  onMac,
  importFiles,
  listDocuments,
  fileInFolder,
  listFacts,
  listFolders,
  openDocument,
  removeDocument,
  renameDocument,
  renameFolder,
  searchLibrary,
} from "../lib/library";
import { refileDocument } from "../lib/extract";
import { type Label, LABELS, checkAll, removeLabel, useLabels } from "../lib/labels";
import {
  type Context,
  type Filters,
  NO_FILTERS,
  type Sort,
  VIEWS,
  type View,
  addedShort,
  byTime,
  expiresOn,
  filterOptions,
  inView,
  keyFact,
  matches,
  sortDocs,
  startView,
  tasks,
} from "../lib/libraryViews";
import { type Step, process, useProgress } from "../lib/pipeline";
import { LocalModelBanner } from "../components/LocalModelSetup";
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

/** How many rows show before "Show more" (the list keeps going as you scroll). */
const PAGE = 120;
const SHOW_KEY = "voidcat.libraryShow";
const readShow = (): "list" | "cards" => {
  try {
    return localStorage.getItem(SHOW_KEY) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
};

/** "...the [[renta]] mensual..." → text with the matches in bold. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split(/\[\[|\]\]/).map((part, i) => (i % 2 ? <b key={i} className="bg-private-soft text-ink">{part}</b> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

const busy = (s?: Step) => s && (s.stage === "queued" || s.stage === "reading" || s.stage === "filing");
const labelName = (kind: string) => LABELS[kind as Label["kind"]]?.name ?? kind;

/** A filter as a small select: "Area: all", "Type: Payslip"… */
function FilterSelect({ name, value, options, onChange, show = (v) => v }: { name: string; value: string; options: string[]; onChange: (v: string) => void; show?: (v: string) => string }) {
  if (options.length < 2 && !value) return null;
  return (
    <label className={`flex h-8 items-center gap-1 rounded-lg border bg-card pl-2.5 text-[13px] ${value ? "border-ink-2" : "border-line-strong"}`}>
      <span className="text-ink-2">{name}:</span>
      <select value={value} onChange={(e) => onChange(e.currentTarget.value)} className="h-full cursor-pointer bg-transparent pr-1.5 outline-none">
        <option value="">all</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {show(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Library() {
  // Connected to Voidcat Cloud with new documents going up: the empty library says so.
  const cloudOn = !!useCloudStatus().account?.newDocuments;
  const [docs, setDocs] = useState<Document[]>([]);
  const [loaded, setLoaded] = useState(false);
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
  const [params, setParams] = useSearchParams();
  const folderId = params.get("folder");
  const folder = folders.find((f) => f.id === folderId);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [show, setShowState] = useState(readShow);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>("added");
  const [limit, setLimit] = useState(PAGE);
  const progress = useProgress();
  const labels = useLabels();
  const veil = useVeil();

  const setShow = (s: "list" | "cards") => {
    setShowState(s);
    try {
      localStorage.setItem(SHOW_KEY, s);
    } catch {
      /* just not remembered */
    }
  };

  const refresh = useCallback(() => {
    Promise.all([listDocuments().then(setDocs), listFacts("approved").then(setFacts), listFacts("pending").then(setPending), listFolders().then(setFolders)]).finally(() => setLoaded(true));
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
    if (!onMac) return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
    // Tauri delivers dropped files with their paths, which the browser's own drop event can't. Drop anywhere here.
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
    setNotice(`Filed ${list.length === 1 ? "it" : `${list.length} documents`} again. Any that need a new folder wait in Needs you.`);
  };

  const choose = async () => {
    if (!onMac) return picker.current?.click();
    const picked = await open({ multiple: true, filters: [{ name: "Documents", extensions: fileTypes }] });
    if (picked) add(Array.isArray(picked) ? picked : [picked]);
  };

  // In a browser: files are locked here and uploaded; the Mac reads and files them on its next sync.
  const picker = useRef<HTMLInputElement>(null);
  const cloud = useCloud();
  const upload = async (files: File[]) => {
    if (!cloud || !files.length) return;
    setNotice(`Locking and uploading ${files.length} ${files.length === 1 ? "file" : "files"}…`);
    const r = await cloud.library.upload(files);
    setNotice(
      [
        r.added && `Added ${r.added} ${r.added === 1 ? "document" : "documents"}. Your Mac reads and files ${r.added === 1 ? "it" : "them"} when Voidcat is open there`,
        r.duplicates.length && `${r.duplicates.length} already in your library`,
        r.failed.length && `${r.failed.length} couldn't be added (${r.failed.map(([n, why]) => `${n}: ${why}`).join(", ")})`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  };
  const browserDrop = onMac
    ? {}
    : {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (e.currentTarget === e.target) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          upload([...e.dataTransfer.files]);
        },
      };

  const activeLabels = useMemo(() => labels.labels.filter((l) => !l.dismissed), [labels.labels]);
  const ctx: Context = useMemo(() => ({ approved: facts, pending, labels: activeLabels, now: new Date() }), [facts, pending, activeLabels]);
  const work = useMemo(() => tasks(docs, ctx), [docs, ctx]);
  const factsOf = (id: string) => facts.filter((f) => f.documentId === id);

  const asked = params.get("view") as View | null;
  const view: View = asked && VIEWS.some((v) => v.id === asked) ? asked : startView(work.count, docs, ctx);
  const pickView = (v: View) => {
    setLimit(PAGE);
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set("view", v);
      return next;
    }, { replace: true });
  };
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, v.id === "needs" ? work.count : docs.filter((d) => inView(v.id, d, ctx)).length])) as Record<View, number>, [docs, ctx, work.count]);

  // Documents waiting for a folder show under Needs you, not in the lists.
  const base = folderId ? docs.filter((d) => d.folderId === folderId) : docs.filter((d) => d.filing !== "suggested" && inView(view, d, ctx));
  const listed = sortDocs(
    base.filter((d) => matches(d, filters, activeLabels)),
    sort,
  );
  const options = filterOptions(base, activeLabels);
  const filtering = Object.values(filters).some(Boolean);

  // Keep showing more as the end of the list scrolls into view.
  const more = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const watch = new IntersectionObserver((seen) => seen.some((s) => s.isIntersecting) && setLimit((l) => l + PAGE));
    watch.observe(el);
    return () => watch.disconnect();
  }, [listed.length > limit]);

  const confirmRemove = (d: Document, small = false) => (
    <span role="group" aria-label="Remove this document?" className="flex items-center gap-2">
      <span className={`text-ink-2 ${small ? "text-[12.5px]" : "text-[13px]"}`}>Remove it from Voidcat?</span>
      <button type="button" autoFocus onClick={() => setConfirming(null)} className={smallButton}>
        Keep
      </button>
      <button
        type="button"
        onClick={async () => {
          await removeDocument(d.id);
          setConfirming(null);
          announceChange();
        }}
        className="h-7 rounded-md bg-danger px-2.5 text-[12.5px] font-semibold text-white"
      >
        Remove for good
      </button>
    </span>
  );

  /** Reading, filing or failed: what's happening to a document right now, if anything. */
  const state = (d: Document) => {
    const step = progress.get(d.id);
    if (busy(step))
      return (
        <span role="status" className="flex items-center gap-1.5 text-[12.5px] text-link">
          <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> {stageText[step!.stage]}
        </span>
      );
    if (step?.stage === "failed") return <span className="text-[12.5px] text-private-ink">{step.message}</span>;
    if (refiling.has(d.id))
      return refiling.get(d.id) ? (
        <span className="text-[12.5px] text-danger">{refiling.get(d.id)}</span>
      ) : (
        <span role="status" className="flex items-center gap-1.5 text-[12.5px] text-link">
          <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> Filing again on this Mac…
        </span>
      );
    return null;
  };

  /** The less frequent actions, as small icons: cloud, rename, move, re-file, remove. */
  const actions = (d: Document) => (
    <span className="flex items-center gap-0.5">
      <CloudToggle id={d.id} />
      <button type="button" onClick={() => setRenaming(d.id)} aria-label={`Rename ${d.title}`} title="Rename" className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink">
        <Pencil aria-hidden className="size-4" />
      </button>
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
      <button type="button" onClick={() => setConfirming(d.id)} aria-label={`Remove ${d.title}`} title="Remove" className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-danger-soft hover:text-danger">
        <Trash2 aria-hidden className="size-4" />
      </button>
    </span>
  );

  const picking = (d: Document) =>
    moving === d.id && (
      <div className="max-w-md">
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
      </div>
    );

  const title = (d: Document, big = false) =>
    renaming === d.id ? (
      <RenameInput
        id={`rename-${d.id}`}
        value={d.title}
        label="Document name"
        className={`${big ? "text-[15px]" : "text-[13.5px]"} font-semibold text-ink`}
        onSave={async (t) => {
          await renameDocument(d.id, t);
          announceChange();
        }}
        onDone={() => setRenaming(null)}
      />
    ) : (
      <button
        type="button"
        onClick={() => openDocument(d.id)}
        onDoubleClick={(e) => {
          e.preventDefault();
          setRenaming(d.id);
        }}
        className={`min-w-0 truncate text-left font-semibold hover:underline ${big ? "text-[15px] leading-snug whitespace-normal" : "text-[13.5px]"}`}
      >
        <Private>{d.title}</Private>
      </button>
    );

  /** Read but not filed, or not read yet: the button that lets the local model do it. */
  const findFacts = (d: Document) =>
    d.status !== "filed" &&
    !busy(progress.get(d.id)) &&
    onMac && (
      <button type="button" onClick={() => process([d])} className={`${smallButton} inline-flex items-center gap-1`}>
        <Sparkles aria-hidden className="size-3.5" /> Find facts
      </button>
    );

  const row = (d: Document) => {
    const fact = keyFact(factsOf(d.id));
    const now = state(d);
    return (
      <Fragment key={d.id}>
        <tr draggable onDragStart={(e) => dragDocument(e, d.id)} title="Drag onto a folder in the sidebar to move it" className="group border-b border-line last:border-b-0 hover:bg-ground/50">
          <td className="max-w-0 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                {title(d)}
                {now}
                <LabelChips documentId={d.id} labels={labels.labels.filter((l) => l.kind !== "duplicate")} />
              </div>
              {confirming === d.id ? confirmRemove(d, true) : <span className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">{actions(d)}</span>}
            </div>
          </td>
          <td className="max-w-0 truncate px-3 py-2 font-mono text-[12px] text-ink-2">{d.folderName ? <Private>{d.folderName}</Private> : (d.area ?? "Not filed")}</td>
          <td className="max-w-0 truncate px-3 py-2 text-[12.5px]">
            {fact ? (
              <span title={`${fact.label}: ${veil.on ? "" : fact.value}`}>
                <span className="text-ink-2">{fact.label}</span> <Private>{fact.value}</Private>
              </span>
            ) : d.status !== "filed" ? (
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${statusBadge[d.status][1]}`}>{statusBadge[d.status][0]}</span>
                {findFacts(d)}
                <ReadNow doc={d} />
              </span>
            ) : null}
          </td>
          <td className="whitespace-nowrap px-3 py-2 text-[12.5px] text-ink-2">{addedShort(new Date(d.addedAt), ctx.now)}</td>
        </tr>
        {moving === d.id && (
          <tr>
            <td colSpan={4} className="px-3 pb-3">
              {picking(d)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const card = (d: Document) => {
    const known = factsOf(d.id);
    const [label, cls] = statusBadge[d.status];
    const until = expiresOn(known);
    return (
      <li key={d.id} draggable onDragStart={(e) => dragDocument(e, d.id)} title="Drag onto a folder in the sidebar to move it" className="group flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-semibold text-ink-2">{d.folderName ? <Private>{d.folderName}</Private> : (d.area ?? "Not filed yet")}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
        </div>
        {title(d, true)}
        <LabelChips documentId={d.id} labels={labels.labels.filter((l) => l.kind !== "duplicate")} />
        {until && until >= new Date(new Date().toDateString()) && (
          <span className="text-[12.5px] text-ok">
            Valid until <Private>{until.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Private>
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
        <CloudCardMark id={d.id} />
        <ReadNow doc={d} />
        {state(d)}
        {picking(d)}
        {confirming === d.id ? (
          <div className="mt-auto pt-1">{confirmRemove(d)}</div>
        ) : (
          <div className="mt-auto flex items-center gap-1.5 pt-1">
            <button type="button" onClick={() => openDocument(d.id)} className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2">
              <Eye aria-hidden className="size-4" /> Open
            </button>
            {findFacts(d)}
            <span className="ml-auto">{actions(d)}</span>
          </div>
        )}
      </li>
    );
  };

  const list = () => {
    if (!listed.length)
      return (
        <p className="m-0 rounded-xl border border-line bg-card px-4 py-6 text-center text-sm text-ink-2">
          {filtering ? "Nothing matches these filters." : view === "expiring" ? "Nothing expires in the next three months." : view === "unsigned" ? "Nothing is waiting for a signature." : view === "notes" ? "No notes yet. + New makes one." : "Nothing here yet."}
        </p>
      );
    const page = listed.slice(0, limit);
    const body =
      show === "cards" ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3.5 p-0">{page.map(card)}</ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-[44%]" />
              <col className="w-[20%]" />
              <col className="w-[25%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-2">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Folder</th>
                <th className="px-3 py-2 font-medium">Key fact</th>
                <th className="px-3 py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {sort === "added"
                ? byTime(page, ctx.now).map((g) => (
                    <Fragment key={g.title}>
                      <tr>
                        <th colSpan={4} scope="colgroup" className="border-b border-line bg-ground/70 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                          {g.title} · {g.docs.length}
                        </th>
                      </tr>
                      {g.docs.map(row)}
                    </Fragment>
                  ))
                : page.map(row)}
            </tbody>
          </table>
        </div>
      );
    return (
      <>
        {body}
        {listed.length > limit ? (
          <div ref={more} className="flex justify-center">
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={smallButton}>
              Show more ({listed.length - limit} left)
            </button>
          </div>
        ) : (
          listed.length > 12 && <p className="m-0 text-center text-[12.5px] text-ink-2">That's all {listed.length}.</p>
        )}
      </>
    );
  };

  const needs = (): ReactNode => {
    if (!work.count && !labels.progress && !labels.waiting)
      return <p className="m-0 rounded-xl border border-line bg-card px-4 py-6 text-center text-sm text-ink-2">Nothing needs you. Everything is filed and checked.</p>;
    return (
      <div className="flex flex-col gap-5">
        <ToFile docs={work.toFile} unsorted={work.unsorted} folders={folders} />
        {work.toCheck.length > 0 && (
          <TaskSection id="to-check" title={`Facts to check · ${work.toCheck.reduce((n, t) => n + t.facts, 0)}, in ${work.toCheck.length} ${work.toCheck.length === 1 ? "document" : "documents"}`}>
            {work.toCheck.map(({ doc: d, facts: n }) => (
              <li key={d.id} className={taskRow}>
                <button type="button" onClick={() => openDocument(d.id)} className="min-w-0 flex-1 truncate text-left font-semibold hover:underline">
                  <Private>{d.title}</Private>
                </button>
                <span className="truncate font-mono text-[12px] text-ink-2">{d.folderName ? <Private>{d.folderName}</Private> : (d.area ?? "Not filed")}</span>
                <span className="text-ink-2">
                  {n} {n === 1 ? "fact" : "facts"}
                </span>
                <button type="button" onClick={() => openDocument(d.id)} className={smallButton}>
                  Check
                </button>
              </li>
            ))}
          </TaskSection>
        )}
        {work.copies.length > 0 && (
          <TaskSection id="copies" title={`Possible copies · ${work.copies.length}`}>
            {work.copies.map((group) => (
              <li key={group.map((d) => d.id).join()} className={taskRow}>
                <span className="min-w-0 flex-[1_1_260px]">
                  {group.map((d, i) => (
                    <Fragment key={d.id}>
                      {i > 0 && (i === group.length - 1 ? " and " : ", ")}
                      <button type="button" onClick={() => openDocument(d.id)} className="font-semibold hover:underline">
                        <Private>{d.title}</Private>
                      </button>
                    </Fragment>
                  ))}{" "}
                  look like the same document. Open one to remove it.
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    for (const d of group) await removeLabel(d.id, "duplicate");
                    announceChange();
                  }}
                  className={smallButton}
                >
                  They're different
                </button>
              </li>
            ))}
          </TaskSection>
        )}
        {labels.progress ? (
          <p role="status" className="m-0 flex items-center gap-2 text-sm text-link">
            <LoaderCircle aria-hidden className="size-4 animate-spin" /> Checking documents on this Mac… {labels.progress.done} of {labels.progress.total}
          </p>
        ) : (
          labels.waiting > 0 && (
            <TaskSection id="not-checked" title={`Not checked yet · ${labels.waiting}`}>
              <li className={taskRow}>
                <span className="flex-1">
                  {labels.waiting} {labels.waiting === 1 ? "document hasn't" : "documents haven't"} been checked for expiry, copies, missing signatures or parts.
                </span>
                <button type="button" onClick={() => checkAll()} className={smallButton}>
                  Check them
                </button>
              </li>
            </TaskSection>
          )
        )}
      </div>
    );
  };

  const empty = loaded && docs.length === 0;

  return (
    <div {...browserDrop} className="relative flex min-h-full flex-col gap-4">
      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80">
          <span className="flex items-center gap-3 text-lg font-semibold">
            <Upload aria-hidden className="size-6" /> Let go to add {onMac ? (cloudOn ? "(read on this Mac, a locked copy goes to Voidcat Cloud)" : "(read on this Mac)") : "(locked in this browser, then uploaded)"}
          </span>
        </div>
      )}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[30px] font-light tracking-tight">
          {folder ? (
            <>
              <Link to="/" className="text-ink-2 no-underline hover:text-ink">
                Library
              </Link>{" "}
              <span className="text-ink-2">›</span> {folder.area} ›{" "}
              {renamingFolder ? (
                <span className="inline-flex w-72 align-middle">
                  <RenameInput
                    id={`rename-folder-view-${folder.id}`}
                    value={folder.name}
                    label="Folder name"
                    className="h-10 font-display text-[26px] font-light text-ink"
                    onSave={async (name) => {
                      await renameFolder(folder.id, name);
                      announceChange();
                    }}
                    onDone={() => setRenamingFolder(false)}
                  />
                </span>
              ) : (
                <>
                  <span onDoubleClick={() => setRenamingFolder(true)}>
                    <Private>{folder.name}</Private>
                  </span>
                  <button
                    type="button"
                    onClick={() => setRenamingFolder(true)}
                    aria-label={`Rename ${folder.name}`}
                    title="Rename"
                    className="ml-1.5 inline-grid size-8 place-items-center rounded-lg align-middle text-ink-2 hover:bg-card hover:text-ink"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </button>
                </>
              )}
            </>
          ) : (
            "Library"
          )}
        </h1>
        <span className="text-sm tabular-nums text-ink-2">
          {(folder ? base : docs).length} {(folder ? base : docs).length === 1 ? "document" : "documents"}
        </span>
        {folder && base.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              try {
                if (await downloadZip(folder.name, base.map((d) => d.id))) setNotice(`Saved ${base.length} ${base.length === 1 ? "document" : "documents"} as ${folder.name}.zip.`);
              } catch (e) {
                setNotice(`The zip could not be saved: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[13px] hover:border-ink-2"
          >
            <Download aria-hidden className="size-4" /> Download zip
          </button>
        )}
        {folder && base.some((d) => d.status === "filed") && (
          <button
            type="button"
            onClick={() => refile(base.filter((d) => d.status === "filed"))}
            disabled={refiling.size > 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[13px] hover:border-ink-2 disabled:opacity-50"
          >
            <FolderSync aria-hidden className="size-4" /> Re-file these {base.filter((d) => d.status === "filed").length}
          </button>
        )}
        <label htmlFor="lib-search" className="ml-auto flex h-10 w-80 max-w-full items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm text-ink-2">
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
        {onMac && <NewNoteButton folderId={folder?.id} onError={setNotice} />}
        <button
          type="button"
          onClick={choose}
          disabled={!hasLibrary}
          title="Or drop files anywhere on this page"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
        >
          <Upload aria-hidden className="size-4" /> Add files
        </button>
      </header>
      <LocalModelBanner />

      {!onMac && (
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          accept={fileTypes.map((t) => `.${t}`).join(",")}
          onChange={(e) => {
            upload([...(e.currentTarget.files ?? [])]);
            e.currentTarget.value = "";
          }}
        />
      )}
      {!hasLibrary && <p className="m-0 text-sm text-private-ink">This is the browser preview. Open the desktop app to add documents.</p>}
      {notice && (
        <p role="status" className="m-0 text-sm text-ink-2">
          {notice}
        </p>
      )}

      {hits ? (
        <section aria-label="Search results" className="flex flex-col gap-2">
          <p className="m-0 text-sm text-ink-2">{hits.length ? `${hits.length} ${hits.length === 1 ? "page matches" : "pages match"}` : "No page contains all of those words."}</p>
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
      ) : empty ? (
        <div className="grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/40 px-6 py-14 text-center">
          <FileText aria-hidden className="size-8 text-ink-2" strokeWidth={1.5} />
          <p className="m-0 font-semibold">Your library is empty</p>
          <p className="m-0 max-w-sm text-sm text-ink-2">
            Drop a passport scan, a contract or a payslip anywhere here, or click Add files.{" "}
            {onMac ? (cloudOn ? "It's read on this Mac; a locked copy goes to Voidcat Cloud." : "Everything stays on this Mac.") : "It's locked in this browser before upload."}
          </p>
        </div>
      ) : (
        <>
          {!folder && (
            <div role="tablist" aria-label="Views" className="flex flex-wrap gap-1 border-b border-line">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => pickView(v.id)}
                  className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] ${view === v.id ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
                >
                  {v.name}
                  {(v.id !== "recent" || view === v.id) && counts[v.id] > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[11.5px] font-semibold ${v.id === "needs" ? "bg-private-soft text-private-ink" : v.id === "expiring" ? "bg-danger-soft text-danger" : "bg-ground text-ink-2"}`}
                    >
                      {counts[v.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!folder && view === "needs" ? (
            needs()
          ) : (
            <section aria-label="Documents" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect name="Area" value={filters.area} options={options.area} onChange={(area) => setFilters({ ...filters, area })} />
                <FilterSelect name="Type" value={filters.type} options={options.type} onChange={(type) => setFilters({ ...filters, type })} />
                <FilterSelect name="Year" value={filters.year} options={options.year} onChange={(year) => setFilters({ ...filters, year })} />
                <FilterSelect name="Label" value={filters.label} options={options.label} onChange={(label) => setFilters({ ...filters, label })} show={labelName} />
                {filtering && (
                  <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-[13px] text-link hover:underline">
                    Clear
                  </button>
                )}
                <label className="ml-auto flex h-8 items-center gap-1 text-[13px] text-ink-2">
                  Sort by
                  <select value={sort} onChange={(e) => setSort(e.currentTarget.value as Sort)} className="h-full cursor-pointer rounded-lg border border-line-strong bg-card px-1.5 text-ink outline-none">
                    <option value="added">date added</option>
                    <option value="name">name</option>
                    <option value="folder">folder</option>
                  </select>
                </label>
                <div role="group" aria-label="Show as" className="flex overflow-hidden rounded-lg border border-line-strong text-[13px]">
                  <button type="button" aria-pressed={show === "list"} onClick={() => setShow("list")} className={`inline-flex h-8 items-center gap-1 px-2.5 ${show === "list" ? "bg-accent-soft font-semibold" : "bg-card hover:bg-ground"}`}>
                    <List aria-hidden className="size-4" /> List
                  </button>
                  <button type="button" aria-pressed={show === "cards"} onClick={() => setShow("cards")} className={`inline-flex h-8 items-center gap-1 px-2.5 ${show === "cards" ? "bg-accent-soft font-semibold" : "bg-card hover:bg-ground"}`}>
                    <LayoutGrid aria-hidden className="size-4" /> Cards
                  </button>
                </div>
              </div>
              {list()}
            </section>
          )}
        </>
      )}
    </div>
  );
}
