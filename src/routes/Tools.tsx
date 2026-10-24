import { ArrowLeft, Combine, EyeOff, FilePen, FilePlus, FileScan, FileInput, type LucideIcon, PenLine, Repeat, Sheet, Split } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { useSearchParams } from "react-router";
import { canConvert } from "../lib/convert";
import { canSign, fillNext, newNote, onMac, openDocument, signNext } from "../lib/library";

// The PDF tools carry pdf-lib and pdf.js: loaded when one is opened.
const tools = () => import("../components/PdfTools");
const CombineTool = lazy(() => tools().then((m) => ({ default: m.CombineTool })));
const PagesTool = lazy(() => tools().then((m) => ({ default: m.PagesTool })));
const ScanTool = lazy(() => tools().then((m) => ({ default: m.ScanTool })));
const DocumentPicker = lazy(() => tools().then((m) => ({ default: m.DocumentPicker })));
const ConvertTool = lazy(() => import("../components/Convert").then((m) => ({ default: m.ConvertTool })));
const Waiting = () => <p className="m-0 text-[13px] text-ink-2">Opening…</p>;

type Tool = { id: string; name: string; note: string; Icon: LucideIcon; ready: boolean };

const WRITE: Tool[] = [
  { id: "note", name: "New document", note: "Markdown or plain text, written here", Icon: FilePlus, ready: true },
  { id: "sheet", name: "New sheet", note: "Rows and columns, saved as .xlsx", Icon: Sheet, ready: false },
  { id: "form", name: "Fill in a PDF", note: "Type on any page or into its form; your facts offered", Icon: FileInput, ready: true },
];
const PDF: Tool[] = [
  { id: "sign", name: "Sign", note: "Draw, type or upload your signature", Icon: PenLine, ready: true },
  { id: "combine", name: "Combine PDFs", note: "Several documents into one", Icon: Combine, ready: true },
  { id: "pages", name: "Split or reorder", note: "Pick, move, turn, remove pages", Icon: Split, ready: true },
  { id: "scan", name: "Scan to PDF", note: "Photos of a paper into one PDF", Icon: FileScan, ready: true },
  { id: "convert", name: "Convert", note: "Word, PDF, Markdown, pictures, sheets", Icon: Repeat, ready: true },
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

/** Picks the document to sign (or fill in), then opens it ready for that. */
function PickToSign({ fill = false }: { fill?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] font-bold">{fill ? "Fill in a PDF" : "Sign a document"}</h2>
        <span className="text-[12.5px] text-ink-2">
          {fill ? "Type on its pages or into its form. The filled-in copy goes next to the original." : "PDFs, photos and notes. The signed copy goes next to the original."}
        </span>
      </div>
      <DocumentPicker
        filter={canSign}
        onPick={(d) => {
          (fill ? fillNext : signNext).add(d.id);
          openDocument(d.id);
        }}
      />
    </div>
  );
}

/** Every tool in one place: writing, and working with PDFs. Results are new documents; originals stay. */
export function Tools() {
  // The chosen tool is in the address (?tool=…), so a document's tab can open one (?tool=pages&doc=…).
  const [params, setParams] = useSearchParams();
  const chosen = params.get("tool");
  const setChosen = (tool: string | null) => setParams(tool ? { tool } : {}, { replace: true });
  const [error, setError] = useState<string | null>(null);
  const pick = (t: Tool) => setChosen(chosen === t.id ? null : t.id);

  // Pages need the whole width.
  if (chosen === "pages" && onMac)
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => setChosen(null)} className="inline-flex items-center gap-1.5 self-start text-[13px] text-ink-2 hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" /> All tools
        </button>
        <Suspense fallback={<Waiting />}>
          <PagesTool start={params.get("doc")} />
        </Suspense>
      </div>
    );

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

      {chosen && onMac && (
        <aside aria-label="Tool" className="flex w-[340px] max-w-full flex-[1_1_300px] flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <Suspense fallback={<Waiting />}>
            {chosen === "sign" && <PickToSign />}
            {chosen === "form" && <PickToSign fill />}
            {chosen === "combine" && <CombineTool />}
            {chosen === "scan" && <ScanTool />}
            {chosen === "convert" && <ConvertTool picker={(onPick) => <DocumentPicker filter={canConvert} onPick={onPick} />} />}
          </Suspense>
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
