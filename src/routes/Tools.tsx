import { Combine, EyeOff, FilePen, FilePlus, FileScan, FileText, FileInput, type LucideIcon, PenLine, Repeat, Search, Sheet, Split } from "lucide-react";
import { useEffect, useState } from "react";
import { type Document, LIBRARY_CHANGED, canSign, listDocuments, newNote, onMac, openDocument, signNext } from "../lib/library";
import { Private } from "../lib/veil";

type Tool = { id: string; name: string; note: string; Icon: LucideIcon; ready: boolean };

const WRITE: Tool[] = [
  { id: "note", name: "New document", note: "Markdown or plain text, written here", Icon: FilePlus, ready: true },
  { id: "sheet", name: "New sheet", note: "Rows and columns, saved as .xlsx", Icon: Sheet, ready: false },
  { id: "form", name: "Fill a form", note: "Type into a PDF form; your facts offered", Icon: FileInput, ready: false },
];
const PDF: Tool[] = [
  { id: "sign", name: "Sign", note: "Draw, type or upload your signature", Icon: PenLine, ready: true },
  { id: "combine", name: "Combine PDFs", note: "Several documents into one", Icon: Combine, ready: false },
  { id: "split", name: "Split or reorder", note: "Pick, move, rotate, remove pages", Icon: Split, ready: false },
  { id: "scan", name: "Scan to PDF", note: "Photos of a paper into one PDF", Icon: FileScan, ready: false },
  { id: "convert", name: "Convert", note: "Word, PDF, Markdown, images, sheets", Icon: Repeat, ready: false },
  { id: "redact", name: "Redact", note: "Black out IDs and addresses for a copy", Icon: EyeOff, ready: false },
];

function Card({ tool, chosen, onPick }: { tool: Tool; chosen: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      disabled={!tool.ready}
      aria-pressed={chosen}
      onClick={onPick}
      className={`flex flex-col items-start gap-1.5 rounded-xl border bg-card p-3.5 text-left disabled:cursor-default ${chosen ? "border-2 border-ink p-[13px]" : "border-line hover:border-ink-2 disabled:hover:border-line"}`}
    >
      <span className="flex w-full items-center gap-2">
        <tool.Icon aria-hidden className={`size-4.5 ${tool.ready ? "text-ink" : "text-ink-2"}`} />
        <span className={`text-[14px] font-semibold ${tool.ready ? "" : "text-ink-2"}`}>{tool.name}</span>
        {!tool.ready && <span className="ml-auto rounded-full bg-ground px-2 py-0.5 text-[11px] text-ink-2">Coming</span>}
      </span>
      <span className="text-[12.5px] text-ink-2">{tool.note}</span>
    </button>
  );
}

/** Picks the document to sign, then opens it ready to sign. */
function PickToSign() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const load = () => listDocuments().then((all) => setDocs(all.filter(canSign)));
    load();
    window.addEventListener(LIBRARY_CHANGED, load);
    return () => window.removeEventListener(LIBRARY_CHANGED, load);
  }, []);
  const q = query.trim().toLowerCase();
  const shown = docs.filter((d) => !q || d.title.toLowerCase().includes(q) || (d.folderName ?? "").toLowerCase().includes(q)).slice(0, 40);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] font-bold">Sign a document</h2>
        <span className="text-[12.5px] text-ink-2">PDFs, photos and notes. The signed copy goes next to the original.</span>
      </div>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-card px-2.5 focus-within:border-ink-2">
        <Search aria-hidden className="size-4 text-ink-2" />
        <span className="sr-only">Find a document</span>
        <input autoFocus value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Find a document" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" />
      </label>
      <ul className="m-0 flex max-h-[52vh] list-none flex-col gap-1 overflow-y-auto p-0">
        {shown.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => {
                signNext.add(d.id);
                openDocument(d.id);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-ground"
            >
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

/** Every tool in one place: writing, and working with PDFs. Results are new documents; originals stay. */
export function Tools() {
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = (t: Tool) => setChosen(chosen === t.id ? null : t.id);

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-3xl">Tools</h1>
          <span className="text-sm text-ink-2">Everything runs on this Mac. Results are saved as new documents; originals stay.</span>
        </div>
        {!onMac && <p className="m-0 text-sm text-ink-2">Tools work in the Mac app.</p>}
        <h2 className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-widest text-ink-2">Write</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {WRITE.map((t) => (
            <Card key={t.id} tool={{ ...t, ready: t.ready && onMac }} chosen={chosen === t.id} onPick={() => pick(t)} />
          ))}
        </div>
        <h2 className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-widest text-ink-2">PDF</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {PDF.map((t) => (
            <Card key={t.id} tool={{ ...t, ready: t.ready && onMac }} chosen={chosen === t.id} onPick={() => pick(t)} />
          ))}
        </div>
      </section>

      {chosen && (
        <aside aria-label="Tool" className="flex w-[340px] max-w-full flex-[1_1_300px] flex-col gap-3 rounded-xl border border-line bg-card p-4">
          {chosen === "sign" && <PickToSign />}
          {chosen === "note" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-[15px] font-bold">New document</h2>
                <span className="text-[12.5px] text-ink-2">It opens in a tab, ready to type in, and saves as you go.</span>
              </div>
              {(
                [
                  ["md", "Markdown", "Headings, lists, bold, tables"],
                  ["txt", "Plain text", "Just the words, as typed"],
                ] as const
              ).map(([kind, name, note]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => newNote(kind).catch((e) => setError(`The document could not be made: ${e instanceof Error ? e.message : String(e)}`))}
                  className="flex items-center gap-2.5 rounded-lg border border-line-strong px-3 py-2.5 text-left hover:border-ink-2"
                >
                  <FilePen aria-hidden className="size-4 shrink-0" />
                  <span className="flex flex-col">
                    <span className="text-[13.5px] font-semibold">{name}</span>
                    <span className="text-[12px] text-ink-2">{note}</span>
                  </span>
                </button>
              ))}
              {error && <p className="m-0 text-[12.5px] text-danger">{error}</p>}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
