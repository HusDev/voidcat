import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDown, LoaderCircle, Repeat } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type Target, targets } from "../lib/convert";
import { type Document, announceChange, openDocument } from "../lib/library";
import { Private } from "../lib/veil";

/** Converts and keeps the results; the work (pdf-lib, pdf.js, docx) loads on first use. */
async function run(doc: Document, t: Target) {
  const { convertDocument } = await import("../lib/runConvert");
  const made = await convertDocument(doc, t);
  announceChange();
  return made;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "Convert ▾" in a document's tab: each type it can become; the result opens (or, for several, says how many). */
export function ConvertMenu({ doc }: { doc: Document }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const options = targets(doc.mime);
  if (!options.length) return null;
  const convert = async (t: Target) => {
    setBusy(true);
    setSaid(null);
    try {
      const made = await run(doc, t);
      if (made.length === 1) openDocument(made[0].id);
      else setSaid(`Made ${made.length} documents next to this one.`);
    } catch (e) {
      setSaid(`Couldn't convert: ${message(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Menu>
      <MenuButton
        disabled={busy}
        title={said ?? "Make a copy in another format, kept next to this one"}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] hover:border-ink-2 disabled:opacity-60 ${said?.startsWith("Couldn't") ? "border-danger text-danger" : "border-line-strong"}`}
      >
        {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Repeat aria-hidden className="size-4" />}
        {busy ? "Converting…" : "Convert"} <ChevronDown aria-hidden className="size-3.5" />
      </MenuButton>
      <MenuItems anchor="bottom end" className="z-50 mt-1 flex w-64 flex-col rounded-lg border border-line-strong bg-card p-1 text-[13px] shadow-xl focus:outline-none">
        <span className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">Convert to</span>
        {options.map((t) => (
          <MenuItem key={t.ext + t.label}>
            <button type="button" onClick={() => convert(t)} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left data-focus:bg-accent-soft">
              <span className="flex-1">{t.label}</span>
              {t.note && <span className="text-[12px] text-ink-2">{t.note}</span>}
            </button>
          </MenuItem>
        ))}
        <span className="border-t border-line px-2.5 pb-1 pt-2 text-[12px] leading-snug text-ink-2">The copy goes next to the original. Converted on this Mac.</span>
      </MenuItems>
    </Menu>
  );
}

/** Convert in Tools: pick a document, then what it should become. */
export function ConvertTool({ picker }: { picker: (onPick: (d: Document) => void) => ReactNode }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const convert = async (t: Target) => {
    if (!doc) return;
    setBusy(t.label);
    setSaid(null);
    try {
      const made = await run(doc, t);
      if (made.length === 1) openDocument(made[0].id);
      else setSaid(`Made ${made.length} documents next to the original.`);
    } catch (e) {
      setSaid(`Couldn't convert: ${message(e)}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] font-bold">Convert</h2>
        <span className="text-[12.5px] text-ink-2">Word, OpenDocument, rich text, Markdown, spreadsheets, CSV, pictures and PDF text. Done on this Mac; the copy goes next to the original.</span>
      </div>
      {doc ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[13.5px]">
            <span className="min-w-0 flex-1 truncate font-medium">
              <Private>{doc.title}</Private>
            </span>
            <button type="button" onClick={() => setDoc(null)} className="text-[12.5px] text-link hover:underline">
              Change
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {targets(doc.mime).map((t) => (
              <button
                key={t.ext + t.label}
                type="button"
                disabled={!!busy}
                onClick={() => convert(t)}
                className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-left text-[13.5px] hover:border-ink-2 disabled:opacity-50"
              >
                {busy === t.label && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                <span className="flex-1 font-medium">{t.label}</span>
                {t.note && <span className="text-[12px] text-ink-2">{t.note}</span>}
              </button>
            ))}
          </div>
          {said && <p className={`m-0 text-[12.5px] ${said.startsWith("Couldn't") ? "text-danger" : "text-ok"}`}>{said}</p>}
        </>
      ) : (
        picker((d) => {
          setSaid(null);
          setDoc(d);
        })
      )}
    </div>
  );
}
