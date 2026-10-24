import { CalendarDays, Check, GripVertical, LoaderCircle, PenLine, Sparkles, TextCursorInput, X } from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { getDocumentProxy } from "unpdf";
import { type Document, announceChange, documentPages, getSignature, listFacts, openDocument, saveMadePdf, saveSignature, saveSigned } from "../lib/library";
import { useLabels } from "../lib/labels";
import { asPdf } from "../lib/asPdf";
import { saveReading } from "../lib/reader";
import { askLocal } from "../lib/extract";
import { FILL_SYSTEM, Fills, type Known, type Suggestion, fieldBlanks, fillPrompt, findBlanks, resolveFills } from "../lib/formFill";
import { aboutYou, loadProfile, profileChoices } from "../lib/people";
import { type FieldValues, type FormField, type Placed, type Run, SIGNATURE_H, SIGNATURE_W, findSpot, formFields, stampPdf, todayText, unsignedHint } from "../lib/signing";
import { Blurred, Private } from "../lib/veil";
import { SignatureMaker } from "./SignatureMaker";

type PDFDocumentProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

/** A page as shown: its size in points (after its own rotation) and its words with their boxes. */
type Shown = { width: number; height: number; runs: Run[] };

const TEXT_SIZE = 11;
const newId = () => crypto.randomUUID();

/** One page drawn with pdf.js, with what's placed on it on top; dragging moves things, a click places the chosen tool. */
function SignPage({
  pdf,
  n,
  shown,
  items,
  signatureUrl,
  aspect,
  placing,
  suggestions,
  onPlace,
  onChange,
  onRemove,
}: {
  pdf: PDFDocumentProxy;
  n: number;
  shown: Shown;
  items: Placed[];
  signatureUrl: string | null;
  aspect: number;
  placing: Placing | null;
  suggestions: string;
  onPlace: (page: number, x: number, y: number) => void;
  onChange: (item: Placed) => void;
  onRemove: (id: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const drag = useRef<{ id: string; mode: "move" | "size"; x: number; y: number; start: Placed } | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      const page = await pdf.getPage(n);
      const el = canvas.current;
      if (!el || stop) return;
      const dpr = window.devicePixelRatio || 1;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (Math.min(el.parentElement!.clientWidth, 920) * dpr) / base.width });
      [el.width, el.height] = [viewport.width, viewport.height];
      await page.render({ canvasContext: el.getContext("2d")!, viewport, canvas: el }).promise;
    })().catch(() => {});
    return () => {
      stop = true;
    };
  }, [pdf, n]);

  // Text is drawn at its size in points, scaled like the page.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / shown.width);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [shown.width]);

  const fraction = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const start = (e: PointerEvent, item: Placed, mode: "move" | "size") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = fraction(e);
    drag.current = { id: item.id, mode, x: p.x, y: p.y, start: item };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = fraction(e);
    const [dx, dy] = [p.x - d.x, p.y - d.y];
    const s = d.start;
    if (d.mode === "size" && s.kind === "signature") {
      const w = Math.min(Math.max(s.w + dx, 0.06), 0.9 - s.x + 0.08);
      onChange({ ...s, w, h: (w * shown.width * aspect) / shown.height });
    } else {
      const h = s.kind === "signature" ? s.h : (s.size * 1.3) / shown.height;
      onChange({ ...s, x: Math.min(Math.max(s.x + dx, 0), 0.97), y: Math.min(Math.max(s.y + dy, 0), 1 - h) });
    }
  };
  const end = () => (drag.current = null);

  return (
    <div className="relative overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-line">
      <canvas ref={canvas} aria-label={`Page ${n}`} className="block w-full" />
      <div
        ref={box}
        onClick={(e) => {
          if (!placing) return;
          const p = fraction(e);
          onPlace(n, p.x, p.y);
        }}
        onPointerMove={move}
        onPointerUp={end}
        className={`absolute inset-0 ${placing ? "cursor-crosshair" : ""}`}
      >
        {items.map((item) =>
          item.kind === "signature" ? (
            <div
              key={item.id}
              onPointerDown={(e) => start(e, item, "move")}
              style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.w * 100}%`, height: `${item.h * 100}%` }}
              className="group absolute cursor-move touch-none rounded-sm outline-dashed outline-[1.5px] outline-private-line hover:bg-private/10"
            >
              {signatureUrl ? <img src={signatureUrl} alt="Your signature" draggable={false} className="size-full object-contain" /> : <span className="grid size-full place-items-center text-[11px] text-private-ink">Your signature</span>}
              <button
                type="button"
                aria-label="Remove the signature"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(item.id)}
                className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-ink text-card opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <X aria-hidden className="size-3" />
              </button>
              <span
                aria-hidden
                onPointerDown={(e) => start(e, item, "size")}
                className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-private-line bg-card"
              />
            </div>
          ) : (
            <div
              key={item.id}
              style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
              className="group absolute flex items-center rounded-sm outline-dashed outline-[1.5px] outline-private-line"
              onClick={(e) => e.stopPropagation()}
            >
              <span aria-hidden onPointerDown={(e) => start(e, item, "move")} className="grid h-full cursor-move touch-none place-items-center self-stretch bg-private-soft px-0.5 text-private-ink">
                <GripVertical className="size-3" />
              </span>
              {/* The input sits over a hidden copy of its text, so it is always exactly as wide as what's typed. */}
              <span className="inline-grid" style={{ fontSize: `${item.size * scale}px`, lineHeight: 1.15, fontFamily: "Helvetica, Arial, sans-serif" }}>
                <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre px-0.5">
                  {item.text || "Type here"}
                </span>
                <input
                  value={item.text}
                  autoFocus={!item.text}
                  list={suggestions}
                  aria-label="Text on the page"
                  placeholder="Type here"
                  onChange={(e) => onChange({ ...item, text: e.currentTarget.value })}
                  size={1}
                  className="col-start-1 row-start-1 w-full min-w-0 bg-transparent px-0.5 text-[#1a1f4d] outline-none placeholder:text-[#1a1f4d]/40"
                />
              </span>
              <button
                type="button"
                aria-label="Remove this text"
                onClick={() => onRemove(item.id)}
                className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-ink text-card opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <X aria-hidden className="size-3" />
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

type Placing = "signature" | "date" | "text";

/** A form field's name as people read it: "topmostSubform[0].Page1[0].Apellidos[0]" → "Apellidos". */
const fieldLabel = (name: string) => name.split(".").pop()!.replace(/\[\d+\]$/, "").replace(/[_-]+/g, " ").trim() || name;

/**
 * Your facts as the model sees them: the Me profile's rows when it has been built (your values, conflicts settled),
 * else every approved fact.
 */
async function knownValues(): Promise<Known[]> {
  const [facts, saved, choices] = await Promise.all([listFacts("approved"), loadProfile().catch(() => null), profileChoices().catch(() => new Map<string, string>())]);
  const you = aboutYou(saved?.profile, facts, choices);
  const rows = you.rows.length
    ? [...(you.name ? [{ label: "Full name", value: you.name }] : []), ...you.rows.map((r) => ({ label: `${r.group} · ${r.label}`, value: r.fact.value }))]
    : facts.map((f) => ({ label: f.label, value: f.value }));
  const seen = new Set<string>();
  return rows
    .filter((r) => r.value.length <= 120 && !seen.has(`${r.label}|${r.value}`.toLowerCase()) && seen.add(`${r.label}|${r.value}`.toLowerCase()))
    .slice(0, 250)
    .map((r, i) => ({ id: `F${i + 1}`, ...r }));
}

/** Suggestions from the local model: which of your facts goes in which empty place; each one added with a click. */
function Suggestions({ pages, fields, onAdd }: { pages: Shown[]; fields: FormField[]; onAdd: (s: Suggestion) => void }) {
  const [state, setState] = useState<"idle" | "asking" | "done">("idle");
  const [found, setFound] = useState<Suggestion[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const suggest = async () => {
    setState("asking");
    setError(null);
    try {
      const onPages = findBlanks(pages.map((p) => p.runs));
      const blanks = [...onPages, ...fieldBlanks(fields.filter((f) => f.kind !== "check").map((f) => ({ name: f.name, label: fieldLabel(f.name) })), onPages.length)];
      if (!blanks.length) {
        setError("No empty places found on this document. Click a page to write where you want.");
        setState("idle");
        return;
      }
      const known = await knownValues();
      if (!known.length) {
        setError("There are no approved facts to suggest from yet. Approve some in Facts to check first.");
        setState("idle");
        return;
      }
      const answer = await askLocal(Fills, FILL_SYSTEM, fillPrompt(blanks, known));
      setFound(resolveFills(answer, blanks, known, todayText()));
      setAdded(new Set());
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  };
  const add = (s: Suggestion) => {
    onAdd(s);
    setAdded((all) => new Set(all).add(s.blank.id));
  };
  const left = found.filter((s) => !added.has(s.blank.id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">Suggestions</span>
        {state === "done" && left.length > 1 && (
          <button type="button" onClick={() => left.forEach(add)} className="ml-auto text-[12.5px] text-link hover:underline">
            Add all {left.length}
          </button>
        )}
      </div>
      {state !== "done" ? (
        <button
          type="button"
          disabled={state === "asking"}
          onClick={suggest}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line-strong text-[13px] hover:border-ink-2 disabled:opacity-60"
        >
          {state === "asking" ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
          {state === "asking" ? "Reading the form on this Mac…" : "Suggest what to fill"}
        </button>
      ) : found.length === 0 ? (
        <span className="text-[12.5px] text-ink-2">
          Nothing in your facts fits this form's places.{" "}
          <button type="button" onClick={suggest} className="text-link hover:underline">
            Try again
          </button>
        </span>
      ) : (
        <ul className="m-0 flex max-h-[40vh] list-none flex-col gap-1.5 overflow-y-auto p-0 pr-1">
          {found.map((s) => {
            const done = added.has(s.blank.id);
            return (
              <li key={s.blank.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[11.5px] text-ink-2">
                    {s.blank.kind === "page" ? `Page ${s.blank.page}` : "Form box"} · {s.blank.label}
                  </span>
                  <span className="truncate text-[13px]">
                    <Private>{s.value}</Private>
                  </span>
                </span>
                {done ? (
                  <Check aria-label="Added" className="size-4 shrink-0 text-ink-2" />
                ) : (
                  <button type="button" onClick={() => add(s)} className="h-7 shrink-0 rounded-md border border-line-strong px-2 text-[12.5px] hover:border-ink-2">
                    Add
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <span className="text-[12.5px] text-danger">{error}</span>}
      <span className="text-[11.5px] leading-snug text-ink-2">Your local model matches the empty places to your approved facts. Nothing leaves this Mac. Check each one; added text can be moved and edited on the page.</span>
    </div>
  );
}

/** The PDF's own boxes for filling in, typed into beside the pages; they are drawn into the saved copy. */
function FormFields({ fields, values, suggestions, onChange }: { fields: FormField[]; values: FieldValues; suggestions: string; onChange: (name: string, value: string | boolean) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">This form's boxes · {fields.length}</span>
      <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto pr-1">
        {fields.map((f) => {
          const value = values[f.name] ?? f.value;
          return f.kind === "check" ? (
            <label key={f.name} title={f.name} className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={value === true} onChange={(e) => onChange(f.name, e.currentTarget.checked)} />
              <span className="truncate">{fieldLabel(f.name)}</span>
            </label>
          ) : (
            <label key={f.name} title={f.name} className="flex flex-col gap-0.5 text-[12px] text-ink-2">
              <span className="truncate">{fieldLabel(f.name)}</span>
              {f.kind === "choice" ? (
                <select value={String(value)} onChange={(e) => onChange(f.name, e.currentTarget.value)} className="h-8 rounded-md border border-line-strong bg-card px-2 text-[13px] text-ink">
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.multiline ? (
                <textarea value={String(value)} rows={3} onChange={(e) => onChange(f.name, e.currentTarget.value)} className="rounded-md border border-line-strong bg-card px-2 py-1 text-[13px] text-ink" />
              ) : (
                <input value={String(value)} list={suggestions} onChange={(e) => onChange(f.name, e.currentTarget.value)} className="h-8 rounded-md border border-line-strong bg-card px-2 text-[13px] text-ink" />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Signing a document in its tab: the pages with your signature placed where the document asks for it (drag to adjust,
 * or place more), and beside them your signature and the tools. Saving makes a signed PDF next to the original.
 * `fill` is writing on it instead: click to type anywhere, fill the form's own boxes, no signature needed; saving
 * makes "<title> (filled)" next to the original.
 */
export function Signer({ doc, mode = "sign", onClose }: { doc: Document; mode?: "sign" | "fill"; onClose: () => void }) {
  const filling = mode === "fill";
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; proxy: PDFDocumentProxy } | null>(null);
  const [pages, setPages] = useState<Shown[] | null>(null);
  const [signature, setSignature] = useState<{ png: Uint8Array; url: string; aspect: number } | null | undefined>(undefined);
  const [making, setMaking] = useState(false);
  const [items, setItems] = useState<Placed[]>([]);
  const [placing, setPlacing] = useState<Placing | null>(filling ? "text" : null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [placed, setPlaced] = useState<"auto" | "none" | null>(null);
  const [addDate, setAddDate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<string[]>([]);
  const { labels } = useLabels();
  const suggestions = `sign-values-${doc.id}`;

  // The document as a PDF, and each page's size and words (to find where it asks for a signature).
  useEffect(() => {
    let stop = false;
    (async () => {
      const bytes = await asPdf(doc);
      // pdf.js takes the buffer it is given; keep our own copy for saving.
      const proxy = await getDocumentProxy(bytes.slice());
      const shown: Shown[] = [];
      for (let n = 1; n <= proxy.numPages; n++) {
        const page = await proxy.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const runs = (await page.getTextContent()).items.flatMap((it) => {
          if (!("str" in it) || !it.str.trim()) return [];
          const [x, y] = base.convertToViewportPoint(it.transform[4], it.transform[5]);
          const h = Math.hypot(it.transform[2], it.transform[3]) || it.height;
          return [{ str: it.str, x: x / base.width, y: (y - h) / base.height, w: it.width / base.width, h: h / base.height }];
        });
        shown.push({ width: base.width, height: base.height, runs });
      }
      const boxes = await formFields(bytes).catch(() => []);
      if (stop) return;
      setFields(boxes);
      setPdf({ bytes, proxy });
      setPages(shown);
    })().catch((e) => setError(`This document could not be opened for signing: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      stop = true;
    };
  }, [doc]);

  // Your saved signature, if there is one.
  const show = async (png: Uint8Array) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: "image/png" }));
    const img = new Image();
    img.src = url;
    await img.decode();
    setSignature({ png, url, aspect: img.naturalHeight / img.naturalWidth });
  };
  useEffect(() => {
    getSignature()
      .then((png) => (png ? show(png) : setSignature(null)))
      .catch(() => setSignature(null));
    listFacts("approved").then((facts) => setValues([...new Set(facts.map((f) => f.value).filter((v) => v.length <= 60))]));
  }, []);
  useEffect(() => {
    const url = signature?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [signature?.url]);

  const sigBox = (page: number, x: number, y: number): Extract<Placed, { kind: "signature" }> => {
    const p = pages![page - 1];
    const h = signature ? (SIGNATURE_W * p.width * signature.aspect) / p.height : SIGNATURE_H;
    return { id: newId(), page, kind: "signature", x, y, w: SIGNATURE_W, h: Math.min(h, 0.2) };
  };
  const dateBelow = (s: Extract<Placed, { kind: "signature" }>): Placed => ({ id: newId(), page: s.page, kind: "text", x: s.x, y: Math.min(s.y + s.h + 0.004, 0.97), text: todayText(), size: TEXT_SIZE });

  // Once the pages and your signature are known: put it where the document asks, with today's date under it.
  useEffect(() => {
    if (filling || !pages || !signature || placed) return;
    const hint = unsignedHint(labels.find((l) => l.documentId === doc.id && l.kind === "unsigned" && !l.dismissed)?.note);
    const spot = findSpot(
      pages.map((p) => p.runs),
      hint,
    );
    if (!spot) {
      setPlaced("none");
      setPlacing("signature");
      return;
    }
    const sig = sigBox(spot.page, spot.x, spot.y);
    setItems(addDate ? [sig, dateBelow(sig)] : [sig]);
    setPlaced("auto");
  }, [filling, pages, signature, placed, labels, doc.id]);

  const place = (page: number, x: number, y: number) => {
    if (!placing || !pages) return;
    if (placing === "signature") {
      const s = sigBox(page, x, y);
      const centred = { ...s, x: Math.max(0, x - s.w / 2), y: Math.max(0, y - s.h / 2) };
      setItems((all) => [...all, centred, ...(addDate && !all.some((i) => i.kind === "signature") ? [dateBelow(centred)] : [])]);
    } else setItems((all) => [...all, { id: newId(), page, kind: "text", x, y: Math.max(0, y - 0.01), text: placing === "date" ? todayText() : "", size: textSize }]);
    // Filling in: the text tool stays on, so each click starts another line.
    if (!(filling && placing === "text")) setPlacing(null);
  };

  const [textSize, setTextSize] = useState(TEXT_SIZE);
  const typed = items.flatMap((i) => (i.kind === "text" && i.text.trim() ? [i] : []));
  const changedFields = Object.entries(fieldValues).filter(([name, v]) => v !== fields.find((f) => f.name === name)?.value);

  /** The filled-in copy: a new PDF next to the original, its read text = the original's plus what you wrote. */
  const saveFilled = async () => {
    if (!pdf) return;
    setSaving(true);
    setError(null);
    try {
      const out = await stampPdf(pdf.bytes, items, signature?.png ?? null, fields.length ? fieldValues : undefined);
      const copy = await saveMadePdf(`${doc.title} (filled)`, out, { like: doc.id });
      const before = await documentPages(doc.id).catch(() => []);
      const written = (page: number) => [
        ...typed.filter((i) => i.page === page).map((i) => i.text.trim()),
        ...(page === 1 ? changedFields.flatMap(([name, v]) => (typeof v === "string" && v.trim() ? [`${fieldLabel(name)}: ${v.trim()}`] : [])) : []),
      ];
      const text = pages!.map((_, i) => [before.find((p) => p.page === i + 1)?.text ?? "", ...written(i + 1)].filter(Boolean).join("\n"));
      await saveReading(copy.id, { pages: text, method: "pdf-text" });
      announceChange();
      onClose();
      openDocument(copy.id);
    } catch (e) {
      setError(`The filled-in copy could not be saved: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  };

  const save = async () => {
    if (!pdf || !signature) return;
    setSaving(true);
    setError(null);
    try {
      const signed = await stampPdf(pdf.bytes, items, signature.png);
      const copy = await saveSigned(doc.id, signed);
      announceChange();
      onClose();
      openDocument(copy.id);
    } catch (e) {
      setError(`The signed copy could not be saved: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  };

  const tools = useMemo(
    () => [
      { id: "signature" as const, label: "Signature", Icon: PenLine },
      { id: "date" as const, label: "Date", Icon: CalendarDays },
      { id: "text" as const, label: "Text", Icon: TextCursorInput },
    ],
    [],
  );
  const hasSignature = items.some((i) => i.kind === "signature");
  const canSave = filling ? typed.length > 0 || hasSignature || changedFields.length > 0 : hasSignature && !!signature;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="min-w-0 flex-[999_1_520px]">
        {error && !pages ? (
          <p className="text-sm text-danger">{error}</p>
        ) : !pdf || !pages ? (
          <div className="grid place-items-center py-20 text-ink-2">
            <LoaderCircle aria-hidden className="size-5 animate-spin" />
          </div>
        ) : (
          <Blurred>
            <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4">
              {pages.map((shown, i) => (
                <SignPage
                  key={i}
                  pdf={pdf.proxy}
                  n={i + 1}
                  shown={shown}
                  items={items.filter((it) => it.page === i + 1)}
                  signatureUrl={signature?.url ?? null}
                  aspect={signature?.aspect ?? 0.3}
                  placing={placing}
                  suggestions={suggestions}
                  onPlace={place}
                  onChange={(item) => setItems((all) => all.map((x) => (x.id === item.id ? item : x)))}
                  onRemove={(id) => setItems((all) => all.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          </Blurred>
        )}
        <datalist id={suggestions}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>

      <aside aria-label={filling ? "Fill in" : "Sign"} className="sticky top-4 flex w-[340px] max-w-full flex-[1_1_300px] flex-col gap-4 rounded-xl border border-line bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-[15px] font-bold">{filling ? "Fill in this document" : "Sign this document"}</h2>
          <span className="text-[12.5px] text-ink-2">
            {filling
              ? fields.length
                ? "Type into the form's boxes below, or click anywhere on a page to write there."
                : "Click anywhere on a page to write there. Drag the handle to move it."
              : placed === "auto" ? "Placed where it asks for your signature. Drag to adjust." : placed === "none" ? "Click the page where your signature goes." : signature === null ? "First, make your signature. It's kept on this Mac, locked." : " "}
          </span>
        </div>

        {filling && pages && (
          <Suggestions
            pages={pages}
            fields={fields}
            onAdd={({ blank, value }) => {
              if (blank.kind === "field") setFieldValues((all) => ({ ...all, [blank.field]: value }));
              else setItems((all) => [...all, { id: newId(), page: blank.page, kind: "text", x: blank.x, y: blank.y, text: value, size: textSize }]);
            }}
          />
        )}

        {filling && fields.length > 0 && <FormFields fields={fields} values={fieldValues} suggestions={suggestions} onChange={(name, value) => setFieldValues((all) => ({ ...all, [name]: value }))} />}

        {signature === undefined || (filling && !making) ? null : signature && !making ? (
          <div className="flex flex-col gap-1.5">
            <Blurred className="grid h-20 place-items-center rounded-lg border border-line-strong bg-white px-3">
              <img src={signature.url} alt="Your signature" className="max-h-16 max-w-full" />
            </Blurred>
            <button type="button" onClick={() => setMaking(true)} className="self-start text-[12.5px] text-link hover:underline">
              Make a new signature
            </button>
          </div>
        ) : (
          <SignatureMaker
            name=""
            onCancel={signature ? () => setMaking(false) : undefined}
            onMake={async (png) => {
              await saveSignature(png);
              await show(png);
              setMaking(false);
            }}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">Add to the page</span>
          <div className="flex gap-1.5">
            {tools.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={placing === id}
                disabled={!pages || (id === "signature" && !signature)}
                onClick={() => setPlacing(placing === id ? null : id)}
                className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] disabled:opacity-40 ${placing === id ? "bg-accent font-semibold text-on-accent" : "border border-line-strong hover:border-ink-2"}`}
              >
                <Icon aria-hidden className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          {placing && <span className="text-[12px] text-ink-2">{filling && placing === "text" ? "Click the page where each line goes." : "Click the page where it goes."}</span>}
          {filling ? (
            <label className="mt-1 flex items-center gap-2 text-[13px]">
              Text size
              <select value={textSize} onChange={(e) => setTextSize(Number(e.currentTarget.value))} className="h-7 rounded-md border border-line-strong bg-card px-1.5 text-[13px]">
                {[8, 9, 10, 11, 12, 14, 16].map((n) => (
                  <option key={n} value={n}>
                    {n} pt
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="mt-1 flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={addDate} onChange={(e) => setAddDate(e.currentTarget.checked)} />
              Add today's date under my signature
            </label>
          )}
        </div>

        {error && pages && <p className="m-0 text-[12.5px] text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={filling ? saveFilled : save}
            className="h-10 flex-1 rounded-lg bg-accent text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40"
          >
            {saving ? "Saving…" : filling ? "Save filled-in copy" : "Save signed copy"}
          </button>
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-3 text-sm text-ink-2 hover:text-ink">
            Cancel
          </button>
        </div>
        <span className="text-[12px] leading-snug text-ink-2">
          The original stays as it is. The {filling ? "filled-in" : "signed"} copy is a new PDF next to it
          {doc.folderName ? (
            <>
              {" in "}
              <Private>{doc.folderName}</Private>
            </>
          ) : (
            ""
          )}
          .
        </span>
      </aside>
    </div>
  );
}
