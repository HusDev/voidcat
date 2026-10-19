import { call as invoke } from "../lib/backend";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Check, ChevronDown, Download, ExternalLink, PenLine, Trash2, FolderInput, History, ListChecks, LoaderCircle, MessageSquareText, Pencil, ScanText, Sparkles } from "lucide-react";
import { readDocument, saveReading } from "../lib/reader";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { useParams } from "react-router";
import remarkGfm from "remark-gfm";
import { getDocumentProxy } from "unpdf";
import { DocChat } from "../components/SideChat";
import { LabelChips } from "../components/LabelChips";
import { KeepInCloud } from "../components/CloudMark";
import { FolderPicker } from "../components/FolderPicker";
import { RenameInput } from "../components/RenameInput";
import { ReviewPanel } from "../components/ReviewPanel";
import {
  type Document,
  type Fact,
  type Folder,
  type Page,
  type Sheet,
  LIBRARY_CHANGED,
  announceChange,
  canSign,
  documentPages,
  fileInFolder,
  discardEmptyNote,
  freshNotes,
  hasPreviousVersion,
  isEditable,
  isSpreadsheet,
  listFacts,
  listFolders,
  onMac,
  openDocument,
  openInDefaultApp,
  readSheets,
  removeDocument,
  renameDocument,
  restorePreviousVersion,
  settleFact,
} from "../lib/library";
import { type SaveState, afterSaves } from "../lib/noteEditor";
import { process, useProgress } from "../lib/pipeline";
import { useLabels } from "../lib/labels";
import { type Mark, type PageText, cellHas, findRuns, markClass, markText, pageText } from "../lib/marks";
import { useTabs } from "../lib/tabs";
import { Blurred, Private, useVeil } from "../lib/veil";

/** The document whose tab is on screen. */
let onScreen: string | null = null;

const NoteEditor = lazy(() => import("../components/NoteEditor"));
const Signer = lazy(() => import("../components/Signer").then((m) => ({ default: m.Signer })));

const bytesOf = async (id: string) => new Uint8Array(await invoke<ArrayBuffer>("document_bytes", { id }));

type Box = { x: number; y: number; w: number; h: number; len: number };
/** A drawn PDF page: where its marks go, its text, and each text run's box (in % of the page). */
type DrawnPage = { overlay: HTMLDivElement; text: PageText; boxes: Box[] };

/** Every page of a PDF drawn with pdf.js, one under the other, with the facts marked over the words they came from. */
function PdfPages({ id, marks, selected }: { id: string; marks: Mark[]; selected: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const drawn = useRef<DrawnPage[]>([]);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const box = ref.current;
    if (!box) return;
    box.replaceChildren();
    drawn.current = [];
    setPages(0);
    (async () => {
      const pdf = await getDocumentProxy(await bytesOf(id));
      const dpr = window.devicePixelRatio || 1;
      for (let n = 1; n <= pdf.numPages && !stop; n++) {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (Math.min(box.clientWidth, 920) * dpr) / base.width });
        const frame = document.createElement("div");
        frame.className = "relative overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-line";
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "block w-full";
        canvas.setAttribute("aria-label", `Page ${n}`);
        const overlay = document.createElement("div");
        overlay.className = "pointer-events-none absolute inset-0";
        frame.append(canvas, overlay);
        box.append(frame);
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;

        const runs = (await page.getTextContent()).items.flatMap((it) => ("str" in it ? [it] : []));
        drawn.current.push({
          overlay,
          text: pageText(runs.map((r) => r.str)),
          boxes: runs.map((r) => {
            const [x, y] = base.convertToViewportPoint(r.transform[4], r.transform[5]);
            const h = Math.hypot(r.transform[2], r.transform[3]) || r.height;
            return { x: (x / base.width) * 100, y: ((y - h * 0.85) / base.height) * 100, w: (r.width / base.width) * 100, h: ((h * 1.15) / base.height) * 100, len: r.str.length };
          }),
        });
        setPages(n);
      }
    })().catch((e) => setError(String(e)));
    return () => {
      stop = true;
    };
  }, [id]);

  // Draw the marks: each fact on its own page first, else on the first page that has it.
  useEffect(() => {
    for (const p of drawn.current) p.overlay.replaceChildren();
    for (const m of marks) {
      const order = m.page ? [drawn.current[m.page - 1], ...drawn.current] : drawn.current;
      for (const p of order) {
        const runs = p && findRuns(p.text, m.value);
        if (!runs) continue;
        let first: HTMLElement | null = null;
        for (const [run, [from, to]] of runs) {
          const b = p.boxes[run];
          if (!b?.len) continue;
          const el = document.createElement("span");
          el.className = `absolute rounded-sm mix-blend-multiply ${markClass(m.status, m.id === selected)}`;
          el.style.left = `${b.x + (b.w * from) / b.len}%`;
          el.style.width = `${(b.w * (to - from)) / b.len}%`;
          el.style.top = `${b.y}%`;
          el.style.height = `${b.h}%`;
          p.overlay.append(el);
          first ??= el;
        }
        if (m.id === selected) first?.scrollIntoView({ block: "center", behavior: "smooth" });
        break;
      }
    }
  }, [marks, selected, pages]);

  if (error) return <p className="text-sm text-danger">This PDF could not be shown: {error}</p>;
  return <div ref={ref} className="mx-auto flex w-full max-w-[920px] flex-col gap-4" />;
}

function ImageFile({ doc }: { doc: Document }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    bytesOf(doc.id).then((bytes) => {
      made = URL.createObjectURL(new Blob([bytes], { type: doc.mime ?? "image/png" }));
      setUrl(made);
    });
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [doc.id, doc.mime]);
  if (!url) return <Loading />;
  return <img src={url} alt={doc.title} className="mx-auto max-h-[calc(100vh-10rem)] rounded-md object-contain shadow-sm ring-1 ring-line" />;
}

/** Marks the facts in text the app laid out itself (text, Markdown, read pages). */
function useMarked(marks: Mark[], selected: string | null, ready: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) markText(ref.current, marks, selected);
  }, [marks, selected, ready]);
  return ref;
}

/** A text or Markdown document, shown as a page, or written in when `editing` (a note). */
function TextFile({
  doc,
  marks,
  selected,
  editing,
  focus,
  version,
  onState,
}: {
  doc: Document;
  marks: Mark[];
  selected: string | null;
  editing: boolean;
  focus: boolean;
  version: number;
  onState: (state: SaveState, error: string | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const ref = useMarked(marks, selected, editing ? null : text);
  useEffect(() => {
    setText(null);
    bytesOf(doc.id).then((b) => setText(new TextDecoder().decode(b)));
  }, [doc.id, version]);
  if (text === null) return <Loading />;
  if (editing)
    return (
      <div className="mx-auto w-full max-w-[820px] rounded-xl border border-line bg-card px-6 py-5 text-page-ink">
        <Suspense fallback={<Loading />}>
          <NoteEditor doc={doc} text={text} focus={focus} onState={onState} onText={setText} />
        </Suspense>
      </div>
    );
  return (
    <div ref={ref} data-selectable className="mx-auto w-full max-w-[820px] rounded-xl border border-line bg-card px-8 py-8 text-page-ink">
      {!text.trim() ? (
        <p className="m-0 text-sm text-ink-2">This document is empty.</p>
      ) : doc.mime === "text/markdown" ? (
        <div className="md-page text-[14px] leading-relaxed">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed">{text}</pre>
      )}
    </div>
  );
}

/** A cell that holds a number ("1.150", "-3,5", "20%"), so it lines up on the right. */
// nosemgrep: nodejs_scan.javascript-dos-rule-regex_dos -- a single character class, linear time on any cell
const isNumber = (cell: string) => /^-?[\d.,]+%?$/.test(cell);

/** A spreadsheet: one tab per sheet, the cells as a table with column letters and row numbers, facts marked in their cells. */
function Spreadsheet({ doc, marks, selected }: { doc: Document; marks: Mark[]; selected: string | null }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    readSheets(doc.id)
      .then(setSheets)
      .catch((e) => setError(String(e)));
  }, [doc.id]);

  // Show the chosen fact's sheet (a sheet is a page), then scroll to its cell.
  const chosen = marks.find((m) => m.id === selected);
  useEffect(() => {
    if (chosen?.page && sheets && chosen.page <= sheets.length) setAt(chosen.page - 1);
  }, [chosen?.id, chosen?.page, sheets]);
  useEffect(() => {
    box.current?.querySelector("[data-chosen]")?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [selected, at, sheets]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!sheets) return <Loading />;
  if (!sheets.length) return <p className="text-sm text-ink-2">This spreadsheet is empty.</p>;
  const sheet = sheets[Math.min(at, sheets.length - 1)];
  const width = Math.max(...sheet.rows.map((r) => r.length));
  const column = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : "") + String.fromCharCode(65 + (i % 26));
  // The chosen fact wins a cell that more than one fact matches.
  const markOf = (cell: string) => (cell ? ((chosen && cellHas(cell, chosen.value) ? chosen : undefined) ?? marks.find((m) => cellHas(cell, m.value))) : undefined);

  return (
    <div className="flex flex-col gap-3">
      {sheets.length > 1 && (
        <div role="tablist" aria-label="Sheets" className="flex flex-wrap gap-1.5">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              aria-selected={i === at}
              onClick={() => setAt(i)}
              className={`rounded-md px-2.5 py-1 text-[12.5px] ${i === at ? "bg-accent-soft font-semibold text-ink" : "text-ink-2 hover:bg-card hover:text-ink"}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div ref={box} data-selectable className="max-h-[calc(100vh-14rem)] overflow-auto rounded-xl border border-line bg-card">
        <table className="border-collapse font-mono text-[12px] tabular-nums text-page-ink">
          <thead className="sticky top-0 z-10 bg-ground text-ink-2">
            <tr>
              <th className="sticky left-0 border-b border-r border-line bg-ground px-2 py-1" />
              {Array.from({ length: width }, (_, i) => (
                <th key={i} className="min-w-16 border-b border-r border-line px-2 py-1 font-medium">
                  {column(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                <th className="sticky left-0 border-b border-r border-line bg-ground px-2 py-1 text-right font-medium text-ink-2">{r + 1}</th>
                {Array.from({ length: width }, (_, c) => {
                  const cell = row[c] ?? "";
                  const mark = markOf(cell);
                  return (
                    <td
                      key={c}
                      data-chosen={(mark && mark.id === selected) || undefined}
                      className={`max-w-80 truncate border-b border-r border-line px-2 py-1 ${isNumber(cell) ? "text-right" : ""} ${mark ? markClass(mark.status, mark.id === selected) : ""}`}
                      title={cell}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.cut && <p className="m-0 text-[12.5px] text-ink-2">Only the first 2,000 rows are shown. Open in the default app to see the rest.</p>}
    </div>
  );
}

/** Files the app can't draw (Word, email): the text Voidcat read from them, with the facts marked. */
function ReadPages({ doc, marks, selected }: { doc: Document; marks: Mark[]; selected: string | null }) {
  const [pages, setPages] = useState<Page[] | null>(null);
  const ref = useMarked(marks, selected, pages);
  useEffect(() => {
    documentPages(doc.id).then(setPages);
  }, [doc.id]);
  if (pages === null) return <Loading />;
  if (!pages.length)
    return (
      <p className="text-sm text-ink-2">
        Voidcat can't show this kind of file yet. Use <b>Open in default app</b> above.
      </p>
    );
  return (
    <div ref={ref} className="mx-auto flex w-full max-w-[820px] flex-col gap-4">
      {pages.map((p) => (
        <div key={p.page} data-selectable className="whitespace-pre-wrap rounded-xl border border-line bg-card px-8 py-8 text-[13px] leading-relaxed text-page-ink">
          {p.text}
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center py-20 text-ink-2">
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
    </div>
  );
}

/** A document opened in its tab, with the facts found in it beside it to check. */
export function Viewer() {
  const { id = "" } = useParams();
  const { documents, active, close } = useTabs();
  const doc = documents.get(id);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const { labels } = useLabels();
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState<Folder[] | null>(null);
  /** What sits beside the document: its facts to check, a chat about it, or nothing. */
  const [panel, setPanel] = useState<"facts" | "ask" | null>(null);
  const veil = useVeil();
  /** Writing in a note (Markdown or text); a note just made opens this way, with its name ready to type. */
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<{ state: SaveState; error: string | null }>({ state: "saved", error: null });
  /** Signing it: the pages with your signature placed, and the signing tools beside them. */
  const [signing, setSigning] = useState(false);
  /** Bumped when the file changes under the page (restoring the earlier version), so it loads again. */
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const fresh = freshNotes.delete(id);
    setEditing(fresh);
    setRenaming(fresh);
    setSigning(false);
    setSaveState({ state: "saved", error: null });
  }, [id]);
  // A note closed while still empty and "Untitled" (made by mistake) is removed, once its last save is done.
  useEffect(() => {
    if (!onMac) return;
    onScreen = id;
    return () => {
      if (onScreen === id) onScreen = null;
      setTimeout(async () => {
        await afterSaves();
        // Back on screen already (React mounting the page twice in development, or reopened at once): keep it.
        if (onScreen === id) return;
        if (await discardEmptyNote(id).catch(() => false)) announceChange();
      });
    };
  }, [id]);
  // Hiding private details closes the editor (which saves first) and stops signing.
  const writing = editing && !veil.on && onMac && !signing;
  const signingNow = signing && !veil.on && onMac;

  useEffect(() => {
    const load = () => Promise.all([listFacts("pending"), listFacts("approved")]).then(([p, a]) => setFacts([...p, ...a].filter((f) => f.documentId === id)));
    load();
    window.addEventListener(LIBRARY_CHANGED, load);
    return () => window.removeEventListener(LIBRARY_CHANGED, load);
  }, [id]);

  const pending = facts.filter((f) => f.status === "pending");
  const approved = facts.filter((f) => f.status === "approved");
  const current = facts.some((f) => f.id === selected) ? selected : (pending[0]?.id ?? null);
  const marks = useMemo<Mark[]>(() => facts.map((f) => ({ id: f.id, value: f.value, status: f.status, page: f.page })), [facts]);

  if (!doc) return <Loading />;
  const side = panel ?? (facts.length ? "facts" : null);

  const settle = async (f: Fact, status: "approved" | "rejected", value?: string) => {
    // Move on to the next fact to check.
    const at = pending.findIndex((p) => p.id === f.id);
    setSelected(pending[at + 1]?.id ?? pending[at - 1]?.id ?? null);
    await settleFact(f.id, status, value);
    announceChange();
  };
  const approveAll = async () => {
    for (const f of pending) await settleFact(f.id, "approved");
    announceChange();
  };

  const mime = doc.mime ?? "";
  const body =
    mime === "application/pdf" ? (
      <PdfPages id={doc.id} marks={marks} selected={current} />
    ) : isSpreadsheet(doc.mime) ? (
      <Spreadsheet doc={doc} marks={marks} selected={current} />
    ) : mime.startsWith("image/") ? (
      <ImageFile doc={doc} />
    ) : mime.startsWith("text/") ? (
      <TextFile doc={doc} marks={marks} selected={current} editing={writing} focus={!renaming} version={version} onState={(state, error) => setSaveState({ state, error })} />
    ) : (
      <ReadPages doc={doc} marks={marks} selected={current} />
    );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col">
          {renaming ? (
            <RenameInput
              id="rename-document"
              value={doc.title}
              label="Document name"
              className="h-9 font-display text-2xl font-light text-ink"
              onSave={async (title) => {
                await renameDocument(doc.id, title);
                announceChange();
              }}
              onDone={() => setRenaming(false)}
            />
          ) : (
            <div className="group flex min-w-0 items-center gap-2">
              <h1 className="truncate text-2xl" onDoubleClick={() => setRenaming(true)}>
                <Private>{doc.title}</Private>
              </h1>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                aria-label="Rename document"
                title="Rename"
                className="grid size-7 shrink-0 place-items-center rounded-md text-ink-2 opacity-0 hover:bg-card hover:text-ink focus:opacity-100 group-hover:opacity-100"
              >
                <Pencil aria-hidden className="size-3.5" />
              </button>
            </div>
          )}
          <span className="font-mono text-xs text-ink-2">
            {doc.folderName ? <Private>{doc.folderName}</Private> : "Not filed"}
            {doc.pageCount && !isEditable(doc) ? ` · ${doc.pageCount} ${doc.pageCount === 1 ? "page" : "pages"}` : ""}
            {doc.signedFrom && documents.get(doc.signedFrom) && (
              <>
                {" · "}
                <button type="button" onClick={() => openDocument(doc.signedFrom!)} className="text-link hover:underline">
                  Signed copy of <Private>{documents.get(doc.signedFrom)!.title}</Private>
                </button>
              </>
            )}
            {[...documents.values()]
              .filter((d) => d.signedFrom === doc.id)
              .map((d) => (
                <span key={d.id}>
                  {" · "}
                  <button type="button" onClick={() => openDocument(d.id)} className="text-link hover:underline">
                    Signed copy
                  </button>
                </span>
              ))}
            {writing && (
              <span role="status" className={saveState.state === "error" ? "text-danger" : ""} title={saveState.error ?? undefined}>
                {" · "}
                {saveState.state === "saving" ? "Saving…" : saveState.state === "unsaved" ? "Edited" : saveState.state === "error" ? `Couldn't save: ${saveState.error}` : "Saved"}
              </span>
            )}
          </span>
          <div className="mt-1.5">
            <LabelChips documentId={doc.id} labels={labels} canAdd />
          </div>
        </div>
        {pending.length > 0 && (
          <span className="rounded-full bg-private-soft px-3 py-1 text-[13px] font-semibold text-private-ink">
            {pending.length} {pending.length === 1 ? "fact" : "facts"} to check
          </span>
        )}
        <div role="group" aria-label="Beside the document" className="flex rounded-md border border-line-strong">
          {facts.length > 0 && (
            <button
              type="button"
              aria-pressed={side === "facts"}
              onClick={() => setPanel(side === "facts" ? "ask" : "facts")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-l-md px-2.5 text-[13px] ${side === "facts" ? "bg-accent-soft font-semibold" : "hover:bg-card"}`}
            >
              <ListChecks aria-hidden className="size-4" /> Facts
            </button>
          )}
          <button
            type="button"
            aria-pressed={side === "ask"}
            onClick={() => setPanel(side === "ask" ? (facts.length ? "facts" : null) : "ask")}
            className={`inline-flex h-8 items-center gap-1.5 px-2.5 text-[13px] ${facts.length ? "rounded-r-md" : "rounded-md"} ${side === "ask" ? "bg-accent-soft font-semibold" : "hover:bg-card"}`}
          >
            <MessageSquareText aria-hidden className="size-4" /> Ask
          </button>
        </div>
        {canSign(doc) &&
          (onMac ? (
            <button
              type="button"
              aria-pressed={signingNow}
              disabled={veil.on}
              title={veil.on ? "Turn off Hide private details to sign" : "Sign this document; the signed copy is saved next to it"}
              onClick={() => {
                setEditing(false);
                setSigning(!signingNow);
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] disabled:opacity-50 ${signingNow ? "bg-accent font-semibold text-on-accent hover:bg-accent-strong" : "border border-line-strong hover:border-ink-2"}`}
            >
              <PenLine aria-hidden className="size-4" /> Sign
            </button>
          ) : (
            <span className="text-[12.5px] text-ink-2">Sign on your Mac</span>
          ))}
        {isEditable(doc) &&
          (onMac ? (
            <button
              type="button"
              aria-pressed={writing}
              disabled={veil.on}
              title={veil.on ? "Turn off Hide private details to edit" : writing ? "Stop editing (it's saved)" : "Write in this document"}
              onClick={() => setEditing(!writing)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] disabled:opacity-50 ${writing ? "bg-accent font-semibold text-on-accent hover:bg-accent-strong" : "border border-line-strong hover:border-ink-2"}`}
            >
              {writing ? <Check aria-hidden className="size-4" /> : <Pencil aria-hidden className="size-4" />} {writing ? "Done" : "Edit"}
            </button>
          ) : (
            <span className="text-[12.5px] text-ink-2">Edit on your Mac</span>
          ))}
        {onMac && isEditable(doc) && <FindFacts doc={doc} saving={writing && saveState.state !== "saved"} />}
        {isEditable(doc) && <ExportMenu doc={doc} />}
        {onMac && isEditable(doc) && !writing && <RestorePrevious doc={doc} onRestored={() => setVersion((v) => v + 1)} />}
        <KeepInCloud id={doc.id} />
        {onMac && doc.written && (
          <DeleteNote
            onDelete={async () => {
              close(active);
              await removeDocument(doc.id);
              announceChange();
            }}
          />
        )}
        <button
          type="button"
          onClick={async () => setMoving(moving ? null : await listFolders())}
          aria-expanded={!!moving}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2"
        >
          <FolderInput aria-hidden className="size-4" /> Move
        </button>
        {onMac && <ReadAgain doc={doc} />}
        <button
          type="button"
          onClick={() => openInDefaultApp(doc.id)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2"
        >
          <ExternalLink aria-hidden className="size-4" /> Open in default app
        </button>
      </header>
      {moving && (
        <div className="max-w-md">
          <FolderPicker
            folders={moving.filter((f) => f.id !== doc.folderId)}
            area={doc.area ?? "Other"}
            onPick={async (area, name) => {
              await fileInFolder(doc.id, area, name);
              setMoving(null);
              announceChange();
            }}
            onCancel={() => setMoving(null)}
          />
        </div>
      )}
      {signingNow ? (
        <Suspense fallback={<Loading />}>
          <Signer doc={doc} onClose={() => setSigning(false)} />
        </Suspense>
      ) : side ? (
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-0 flex-[999_1_520px]">
            <Blurred>{body}</Blurred>
            {side === "facts" && mime.startsWith("image/") && <p className="m-0 mt-2 text-[12.5px] text-ink-2">Values can't be marked on a photo; check them against the picture.</p>}
          </div>
          {side === "facts" ? (
            <ReviewPanel pending={pending} approved={approved} selected={current} onSelect={setSelected} onSettle={settle} onApproveAll={approveAll} />
          ) : (
            <DocChat doc={doc} />
          )}
        </div>
      ) : (
        <Blurred>{body}</Blurred>
      )}
    </div>
  );
}

/**
 * Reads the document's text again on this Mac (Apple Vision for scans and photos), e.g. after a browser's OCR got a
 * scan wrong. The filing and facts stay as they are.
 */
function ReadAgain({ doc }: { doc: Document }) {
  const [state, setState] = useState<"idle" | "reading" | "done" | string>("idle");
  return (
    <button
      type="button"
      disabled={state === "reading"}
      title={typeof state === "string" && !["idle", "reading", "done"].includes(state) ? state : "Read the text again on this Mac; the facts stay"}
      onClick={async () => {
        setState("reading");
        try {
          await saveReading(doc.id, await readDocument(doc));
          announceChange();
          setState("done");
        } catch (e) {
          setState(`Couldn't read it again: ${e instanceof Error ? e.message : String(e)}`);
        }
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2 disabled:opacity-50"
    >
      {state === "reading" ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ScanText aria-hidden className="size-4" />}
      {state === "reading" ? "Reading…" : state === "done" ? "Read again ✓" : "Read again"}
    </button>
  );
}

/**
 * Runs the local model on a note when you ask (never on its own): filing suggestion, facts to check, contacts and
 * labels. A dot shows the text changed since it last ran. A folder you chose stays.
 */
function FindFacts({ doc, saving }: { doc: Document; saving: boolean }) {
  const step = useProgress().get(doc.id);
  const busy = step?.stage === "queued" || step?.stage === "reading" || step?.stage === "filing";
  const stale = doc.contentChanged || doc.status !== "filed";
  return (
    <button
      type="button"
      disabled={busy || saving}
      title={step?.stage === "failed" ? step.message : saving ? "Wait for the note to save" : "Let the local model file this note and find facts in it"}
      onClick={() => process([doc])}
      className="relative inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2 disabled:opacity-50"
    >
      {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
      {busy ? "Finding facts…" : "Find facts & file"}
      {stale && !busy && <span aria-label="(text changed)" className="absolute -right-1 -top-1 size-2.5 rounded-full bg-accent ring-2 ring-ground" />}
    </button>
  );
}

/** Saves a copy of a note elsewhere: as a Word document, or as it is. */
function ExportMenu({ doc }: { doc: Document }) {
  const [error, setError] = useState<string | null>(null);
  const plain = doc.mime === "text/plain";
  const ext = plain ? "txt" : "md";
  const stem = doc.fileName.replace(/\.[^.]+$/, "") || "Untitled";
  const exportAs = async (kind: "docx" | "same") => {
    setError(null);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const bytes = await bytesOf(doc.id);
      const target = kind === "docx" ? "docx" : ext;
      const path = await save({ defaultPath: `${stem}.${target}`, filters: [{ name: kind === "docx" ? "Word document" : plain ? "Text" : "Markdown", extensions: [target] }] });
      if (!path) return;
      const out = kind === "docx" ? await (await import("../lib/exportDocx")).docxBytes(new TextDecoder().decode(bytes), doc.title, plain) : bytes;
      const hex = [...new TextEncoder().encode(path)].map((b) => b.toString(16).padStart(2, "0")).join("");
      await invoke<void>("save_export_file", out, { headers: { "Content-Type": "application/octet-stream", "x-voidcat-path": hex } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  if (!onMac) return null;
  return (
    <Menu>
      <MenuButton
        title={error ? `Couldn't export: ${error}` : "Save a copy"}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] hover:border-ink-2 ${error ? "border-danger text-danger" : "border-line-strong"}`}
      >
        <Download aria-hidden className="size-4" /> Export <ChevronDown aria-hidden className="size-3.5" />
      </MenuButton>
      <MenuItems anchor="bottom end" className="z-50 mt-1 flex w-52 flex-col rounded-lg border border-line-strong bg-card p-1 text-[13px] shadow-xl focus:outline-none">
        <MenuItem>
          <button type="button" onClick={() => exportAs("docx")} className="rounded-md px-2.5 py-1.5 text-left data-focus:bg-accent-soft">
            Word (.docx)
          </button>
        </MenuItem>
        <MenuItem>
          <button type="button" onClick={() => exportAs("same")} className="rounded-md px-2.5 py-1.5 text-left data-focus:bg-accent-soft">
            {plain ? "Text (.txt)" : "Markdown (.md)"}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}

/** Puts back the version from before the last editing session; doing it again undoes that. */
function RestorePrevious({ doc, onRestored }: { doc: Document; onRestored: () => void }) {
  const [has, setHas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const check = () => hasPreviousVersion(doc.id).then(setHas, () => setHas(false));
    check();
    window.addEventListener(LIBRARY_CHANGED, check);
    return () => window.removeEventListener(LIBRARY_CHANGED, check);
  }, [doc.id]);
  if (!has) return null;
  return (
    <button
      type="button"
      title={error ?? "Swap in the version from before your last edits (do it again to undo)"}
      onClick={async () => {
        try {
          await restorePreviousVersion(doc.id);
          onRestored();
          announceChange();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2"
    >
      <History aria-hidden className="size-4" /> Restore previous version
    </button>
  );
}

/** Removes a note for good, after asking once. */
function DeleteNote({ onDelete }: { onDelete: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] hover:border-danger hover:text-danger"
      >
        <Trash2 aria-hidden className="size-4" /> Delete
      </button>
    );
  return (
    <span role="group" aria-label="Delete this note?" className="inline-flex items-center gap-1.5 text-[13px]">
      <button type="button" autoFocus onClick={() => setAsking(false)} className="h-8 rounded-md border border-line-strong px-2.5 hover:border-ink-2">
        Keep
      </button>
      <button type="button" onClick={onDelete} className="h-8 rounded-md bg-danger px-2.5 font-semibold text-white">
        Remove for good
      </button>
    </span>
  );
}
