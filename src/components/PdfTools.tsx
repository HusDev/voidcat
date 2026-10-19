import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FileText, ImagePlus, LoaderCircle, RotateCw, Search, X } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { useEffect, useRef, useState } from "react";
import { getDocumentProxy } from "unpdf";
import { asPdf, canBePdf, photoOf } from "../lib/asPdf";
import { type Document, type Folder, LIBRARY_CHANGED, announceChange, documentPages, listDocuments, listFolders, openDocument, saveMadePdf } from "../lib/library";
import { photosPdf } from "../lib/notePdf";
import { type Pick, combine, combinedText, pagesName, pickedText, rearrange } from "../lib/pdfTools";
import { process } from "../lib/pipeline";
import { saveReading } from "../lib/reader";
import { Blurred, Private, useVeil } from "../lib/veil";

type Proxy = Awaited<ReturnType<typeof getDocumentProxy>>;

const button = "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 text-[13px] hover:border-ink-2 disabled:opacity-40";
const icon = "grid size-7 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink disabled:opacity-30";
const primary = "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pageCount = async (pdf: Uint8Array) => (await PDFDocument.load(pdf, { ignoreEncryption: true })).getPageCount();
/** The read text of a document, page by page. */
const readText = async (id: string) => (await documentPages(id)).sort((a, b) => a.page - b.page).map((p) => p.text);

/** Finds a document in the library (PDFs, photos, notes) and picks it. */
export function DocumentPicker({ onPick, skip = [], filter = canBePdf, autoFocus = true }: { onPick: (d: Document) => void; skip?: string[]; filter?: (d: Document) => boolean; autoFocus?: boolean }) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const load = () => listDocuments().then((all) => setDocs(all.filter(filter)));
    load();
    window.addEventListener(LIBRARY_CHANGED, load);
    return () => window.removeEventListener(LIBRARY_CHANGED, load);
  }, [filter]);
  const q = query.trim().toLowerCase();
  const shown = docs.filter((d) => !skip.includes(d.id) && (!q || d.title.toLowerCase().includes(q) || (d.folderName ?? "").toLowerCase().includes(q))).slice(0, 40);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-card px-2.5 focus-within:border-ink-2">
        <Search aria-hidden className="size-4 text-ink-2" />
        <span className="sr-only">Find a document</span>
        <input autoFocus={autoFocus} value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Find a document" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" />
      </label>
      <ul className="m-0 flex max-h-[44vh] list-none flex-col gap-0.5 overflow-y-auto p-0">
        {shown.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => onPick(d)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-ground">
              <FileText aria-hidden className="size-4 shrink-0 text-ink-2" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13.5px] font-medium">
                  <Private>{d.title}</Private>
                </span>
                <span className="truncate font-mono text-[11.5px] text-ink-2">{d.folderName ? <Private>{d.folderName}</Private> : "Not filed"}</span>
              </span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="px-2.5 py-2 text-[13px] text-ink-2">{docs.length ? "Nothing matches." : "No PDFs, photos or notes yet."}</li>}
      </ul>
    </div>
  );
}

/** Several documents into one PDF, in the order you set. Photos and notes become pages too. */
export function CombineTool() {
  const [picked, setPicked] = useState<Document[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const move = (i: number, by: number) =>
    setPicked((all) => {
      const next = [...all];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const suggested = picked.length ? `${picked[0].title}${picked.length > 1 ? ` + ${picked.length - 1} more` : ""}` : "";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const pdfs = await Promise.all(picked.map(asPdf));
      const made = await saveMadePdf(name.trim() || suggested, await combine(pdfs), { like: picked[0].id });
      const sources = await Promise.all(picked.map(async (d, i) => ({ read: await readText(d.id), pdfPages: await pageCount(pdfs[i]) })));
      await saveReading(made.id, { pages: combinedText(sources), method: "pdf-text" });
      announceChange();
      setPicked([]);
      setName("");
      openDocument(made.id);
    } catch (e) {
      setError(`They could not be combined: ${message(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] font-bold">Combine PDFs</h2>
        <span className="text-[12.5px] text-ink-2">Pick documents in the order they should appear. Photos and notes become pages too.</span>
      </div>
      {picked.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {picked.map((d, i) => (
            <li key={d.id} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[13px]">
              <span className="w-5 text-right font-mono text-[11.5px] text-ink-2">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                <Private>{d.title}</Private>
              </span>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className={icon}>
                <ArrowUp aria-hidden className="size-3.5" />
              </button>
              <button type="button" aria-label="Move down" disabled={i === picked.length - 1} onClick={() => move(i, 1)} className={icon}>
                <ArrowDown aria-hidden className="size-3.5" />
              </button>
              <button type="button" aria-label={`Take out ${d.title}`} onClick={() => setPicked((all) => all.filter((x) => x.id !== d.id))} className={icon}>
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <DocumentPicker skip={picked.map((d) => d.id)} onPick={(d) => setPicked((all) => [...all, d])} autoFocus={!picked.length} />
      {picked.length > 0 && (
        <>
          <label className="flex flex-col gap-1 text-[12.5px] text-ink-2">
            Name
            <input value={name} placeholder={suggested} onChange={(e) => setName(e.currentTarget.value)} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13.5px] text-ink outline-none focus:border-ink-2" />
          </label>
          {error && <p className="m-0 text-[12.5px] text-danger">{error}</p>}
          <button type="button" disabled={picked.length < 2 || busy} onClick={run} className={primary}>
            {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            {picked.length < 2 ? "Pick at least two" : `Combine ${picked.length} documents`}
          </button>
          <span className="text-[12px] text-ink-2">
            The originals stay. The new PDF goes in {picked[0].folderName ? <Private>{picked[0].folderName}</Private> : "no folder yet"}; its facts stay on the originals.
          </span>
        </>
      )}
    </div>
  );
}

/** One page of a PDF drawn small, turned as it will be saved. */
function Thumb({ pdf, n, turn }: { pdf: Proxy; n: number; turn: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop = false;
    (async () => {
      const page = await pdf.getPage(n);
      const el = canvas.current;
      if (!el || stop) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (150 * (window.devicePixelRatio || 1)) / Math.max(base.width, base.height) });
      [el.width, el.height] = [viewport.width, viewport.height];
      await page.render({ canvasContext: el.getContext("2d")!, viewport, canvas: el }).promise;
    })().catch(() => {});
    return () => {
      stop = true;
    };
  }, [pdf, n]);
  return (
    <div className="grid size-[150px] place-items-center">
      <canvas ref={canvas} aria-label={`Page ${n}`} style={{ transform: `rotate(${turn}deg)` }} className="max-h-[150px] max-w-[150px] bg-white shadow-sm ring-1 ring-line transition-transform" />
    </div>
  );
}

type PageCard = Pick & { keep: boolean };

/** A document's pages as small pictures: keep or drop each, move them, turn them; save them as one PDF or one each. */
export function PagesTool({ start }: { start: string | null }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; proxy: Proxy } | null>(null);
  const [cards, setCards] = useState<PageCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Opened from a document's tab: start with it.
  useEffect(() => {
    if (!start) return;
    listDocuments().then((all) => {
      const d = all.find((x) => x.id === start && canBePdf(x));
      if (d) setDoc(d);
    });
  }, [start]);

  useEffect(() => {
    if (!doc) return;
    let stop = false;
    setPdf(null);
    setError(null);
    (async () => {
      const bytes = await asPdf(doc);
      const proxy = await getDocumentProxy(bytes.slice());
      if (stop) return;
      setPdf({ bytes, proxy });
      setCards(Array.from({ length: proxy.numPages }, (_, i) => ({ page: i + 1, turn: 0, keep: true })));
    })().catch((e) => setError(`This document could not be opened: ${message(e)}`));
    return () => {
      stop = true;
    };
  }, [doc]);

  if (!doc)
    return (
      <div className="flex max-w-md flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-[15px] font-bold">Split or reorder</h2>
          <span className="text-[12.5px] text-ink-2">Pick a document to see its pages.</span>
        </div>
        {notice && (
          <p role="status" className="m-0 text-[13px] text-ok">
            {notice}
          </p>
        )}
        <DocumentPicker
          onPick={(d) => {
            setNotice(null);
            setDoc(d);
          }}
        />
      </div>
    );

  const kept = cards.filter((c) => c.keep);
  const changed = kept.length !== cards.length || cards.some((c, i) => c.page !== i + 1 || c.turn);
  const move = (i: number, by: number) =>
    setCards((all) => {
      const next = [...all];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const update = (i: number, change: Partial<PageCard>) => setCards((all) => all.map((c, j) => (j === i ? { ...c, ...change } : c)));

  const save = async (each: boolean) => {
    if (!pdf) return;
    setBusy(true);
    setError(null);
    try {
      const read = await readText(doc.id);
      const text = read.length === cards.length ? read : [];
      const groups = each ? kept.map((c) => [c]) : [kept];
      let last: Document | null = null;
      for (const group of groups) {
        const pages = group.map((c) => c.page);
        const all = !each && kept.length === cards.length;
        const name = all ? `${doc.title} (reordered)` : pagesName(doc.title, pages);
        last = await saveMadePdf(name, await rearrange(pdf.bytes, group), { like: doc.id });
        await saveReading(last.id, { pages: text.length ? pickedText(text, group) : group.map(() => ""), method: "pdf-text" });
      }
      announceChange();
      if (each) {
        setNotice(`Saved ${groups.length} ${groups.length === 1 ? "page" : "pages"} as separate documents next to the original.`);
        setDoc(null);
      } else if (last) openDocument(last.id);
    } catch (e) {
      setError(`The pages could not be saved: ${message(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 truncate text-[15px] font-bold">
            Pages of <Private>{doc.title}</Private>
          </h2>
          <span className="text-[12.5px] text-ink-2">
            {kept.length} of {cards.length} pages kept. Untick a page to leave it out, turn it, or move it.
          </span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => setDoc(null)} className={button}>
            Another document
          </button>
          <button type="button" onClick={() => setCards((all) => all.map((c) => ({ ...c, keep: !kept.length })))} className={button}>
            {kept.length ? "Untick all" : "Tick all"}
          </button>
          <button type="button" disabled={!kept.length || busy} onClick={() => save(true)} className={button}>
            Save each page separately
          </button>
          <button type="button" disabled={!kept.length || !changed || busy} onClick={() => save(false)} className={primary}>
            {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            Save as a new PDF
          </button>
        </div>
      </div>
      {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
      {!pdf ? (
        !error && (
          <div className="grid place-items-center py-16 text-ink-2">
            <LoaderCircle aria-hidden className="size-5 animate-spin" />
          </div>
        )
      ) : (
        <Blurred>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3 p-0">
            {cards.map((c, i) => (
              <li key={c.page} className={`flex flex-col items-center gap-2 rounded-xl border bg-card p-2.5 ${c.keep ? "border-line" : "border-dashed border-line-strong opacity-45"}`}>
                <Thumb pdf={pdf.proxy} n={c.page} turn={c.turn} />
                <div className="flex w-full items-center gap-1">
                  <label className="flex flex-1 items-center gap-1.5 text-[12.5px]">
                    <input type="checkbox" checked={c.keep} onChange={(e) => update(i, { keep: e.currentTarget.checked })} />
                    Page {c.page}
                  </label>
                  <button type="button" aria-label={`Move page ${c.page} earlier`} disabled={i === 0} onClick={() => move(i, -1)} className={icon}>
                    <ArrowLeft aria-hidden className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`Move page ${c.page} later`} disabled={i === cards.length - 1} onClick={() => move(i, 1)} className={icon}>
                    <ArrowRight aria-hidden className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`Turn page ${c.page}`} title="Turn a quarter clockwise" onClick={() => update(i, { turn: (c.turn + 90) % 360 })} className={icon}>
                    <RotateCw aria-hidden className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </Blurred>
      )}
      <span className="text-[12px] text-ink-2">The original stays as it is. New PDFs go next to it, with its folder; its facts stay on the original.</span>
    </div>
  );
}

type Shot = { id: string; file: File; url: string };

/** Photos of a paper (one per page) into one PDF, which is then read and filed like any document you add. */
export function ScanTool() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [name, setName] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const veil = useVeil();
  const urls = useRef(new Set<string>());
  useEffect(() => {
    listFolders().then(setFolders);
    const made = urls.current;
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const add = (files: File[]) => {
    const fresh = files
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
      .map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { id: crypto.randomUUID(), file, url };
      });
    setShots((all) => [...all, ...fresh]);
  };
  const move = (i: number, by: number) =>
    setShots((all) => {
      const next = [...all];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const suggested = `Scan ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const photos = [];
      for (const s of shots) photos.push(await photoOf(new Uint8Array(await s.file.arrayBuffer()), /\.(heic|heif)$/i.test(s.file.name) ? "image/heic" : s.file.type));
      const made = await saveMadePdf(name.trim() || suggested, await photosPdf(photos), { folder: folder || undefined });
      announceChange();
      // Read on this Mac (Apple Vision) and filed, like any document added.
      process([made]);
      setShots([]);
      setName("");
      openDocument(made.id);
    } catch (e) {
      setError(`The scan could not be made: ${message(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] font-bold">Scan to PDF</h2>
        <span className="text-[12.5px] text-ink-2">Photos of a paper, one per page, become one PDF. It's read and filed on this Mac like anything you add.</span>
      </div>
      {shots.length > 0 && (
        <Blurred>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {shots.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-[13px]">
                <img src={s.url} alt={`Page ${i + 1}`} className="size-11 rounded object-cover ring-1 ring-line" />
                <span className="min-w-0 flex-1 truncate">Page {i + 1}</span>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className={icon}>
                  <ArrowUp aria-hidden className="size-3.5" />
                </button>
                <button type="button" aria-label="Move down" disabled={i === shots.length - 1} onClick={() => move(i, 1)} className={icon}>
                  <ArrowDown aria-hidden className="size-3.5" />
                </button>
                <button type="button" aria-label={`Take out page ${i + 1}`} onClick={() => setShots((all) => all.filter((x) => x.id !== s.id))} className={icon}>
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        </Blurred>
      )}
      <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-card text-[13px] text-ink-2 hover:border-ink-2">
        <ImagePlus aria-hidden className="size-4" /> {shots.length ? "Add more photos" : "Choose photos"}
        <input
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          onChange={(e) => {
            add([...(e.currentTarget.files ?? [])]);
            e.currentTarget.value = "";
          }}
        />
      </label>
      {shots.length > 0 && (
        <>
          <label className="flex flex-col gap-1 text-[12.5px] text-ink-2">
            Name
            <input value={name} placeholder={suggested} onChange={(e) => setName(e.currentTarget.value)} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13.5px] text-ink outline-none focus:border-ink-2" />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] text-ink-2">
            Folder
            <select value={folder} onChange={(e) => setFolder(e.currentTarget.value)} className="h-9 rounded-md border border-line-strong bg-card px-2 text-[13.5px] text-ink">
              <option value="">Let Voidcat choose</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.area} › {veil.on ? veil.mask(f.name) : f.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="m-0 text-[12.5px] text-danger">{error}</p>}
          <button type="button" disabled={busy} onClick={run} className={primary}>
            {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            Make a {shots.length}-page PDF
          </button>
        </>
      )}
    </div>
  );
}
