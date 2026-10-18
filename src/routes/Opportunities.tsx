import { openUrl } from "@tauri-apps/plugin-opener";
import { CalendarPlus, Check, ChevronRight, ExternalLink, FileText, Globe, LoaderCircle, RotateCcw, ScanSearch, ShieldCheck, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { addEvent } from "../lib/calendar";
import { listModels, savedModel } from "../lib/cloud";
import { LIBRARY_CHANGED, announceChange, getSecret, onMac as hasLibrary, listDocuments, listFacts, openDocument } from "../lib/library";
import {
  AREA_NAMES,
  OPP_AREAS,
  type OppArea,
  type Opportunity,
  buildScan,
  listOpportunities,
  restore,
  saveOpportunities,
  scanCloud,
  setOpportunityStatus,
} from "../lib/opportunities";
import { detector } from "../lib/nameCheck";
import { contactFacts, listContacts } from "../lib/people";
import { Masker } from "../lib/privacy";
import { Placeholders, Private } from "../lib/veil";

const WEB_KEY = "voidcat.scanWeb";
const FIT: Record<Opportunity["fit"], [string, string]> = {
  yes: ["For you", "bg-ok-soft text-ok"],
  maybe: ["Check", "bg-private-soft text-private-ink"],
  no: ["Not for you", "bg-ground text-ink-2"],
};
const button = "inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 text-[12.5px] hover:border-ink-2 disabled:opacity-40";

type Review = { sent: string; number: Map<string, string>; masker: Masker; hidden: number; cost: string | null };

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function readWeb() {
  try {
    return localStorage.getItem(WEB_KEY) === "1";
  } catch {
    return false;
  }
}

/** Roughly what a scan costs with the chosen model, from its public price. */
async function estimate(model: string, sent: string, web: boolean) {
  try {
    const m = (await listModels()).find((x) => x.id === model);
    if (!m) return null;
    const usd = ((sent.length / 3.5 + 900) * m.promptPrice + 3500 * m.completionPrice) / 1_000_000 + (web ? 0.02 : 0);
    return usd < 0.01 ? "< $0.01" : `≈ $${usd.toFixed(2)}`;
  } catch {
    return null;
  }
}

function Card({ o, onStatus }: { o: Opportunity; onStatus: (status: Opportunity["status"]) => void }) {
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(o.deadlineDate ?? "");
  const [added, setAdded] = useState(false);
  const [fit, fitCls] = FIT[o.fit];
  const docSource = o.sources.find((s) => s.url.startsWith("doc:"));

  const toCalendar = async () => {
    if (!date) return setPicking(true);
    await addEvent({ title: o.title, date, time: null, place: null, kind: "deadline", documentId: docSource?.url.slice(4) ?? null, notes: o.nextStep });
    announceChange();
    setAdded(true);
    setPicking(false);
    if (o.status === "new") onStatus("kept");
  };

  return (
    <article className={`flex flex-col gap-2.5 rounded-xl border bg-card p-4.5 ${o.status === "kept" ? "border-ok/50" : "border-line"}`}>
      <div className="flex items-start gap-3">
        <h3 className="m-0 flex-1 text-[16px] font-bold leading-snug">
          <Private>{o.title}</Private>
        </h3>
        {o.status === "kept" && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[12px] font-semibold text-on-accent">Kept</span>}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${fitCls}`}>{fit}</span>
      </div>
      <p data-selectable className="m-0 text-[14px] leading-relaxed text-ink">
        <Private>{o.why}</Private>
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        {o.value && (
          <span className="font-semibold text-ok">
            <Private>{o.value}</Private>
          </span>
        )}
        <span className="text-ink-2">Effort: {o.effort}</span>
        {o.deadline && (
          <span className="text-ink-2">
            <Private>{o.deadline}</Private>
          </span>
        )}
      </div>
      <p className="m-0 rounded-lg bg-ground px-3 py-2 text-[13.5px]">
        <b>Next:</b> <Private>{o.nextStep}</Private>
      </p>
      {o.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.sources.map((s) =>
            s.url.startsWith("doc:") ? (
              <button type="button" key={s.url + s.title} onClick={() => openDocument(s.url.slice(4))} className="inline-flex items-center gap-1 rounded-md bg-ground px-2 py-1 text-[12.5px] text-link hover:underline">
                <FileText aria-hidden className="size-3.5" /> <Private>{s.title}</Private>
              </button>
            ) : (
              <button type="button" key={s.url + s.title} onClick={() => openUrl(s.url)} title={s.url} className="inline-flex max-w-72 items-center gap-1 rounded-md bg-ground px-2 py-1 text-[12.5px] text-link hover:underline">
                <ExternalLink aria-hidden className="size-3.5 shrink-0" /> <span className="truncate">{host(s.url)} · <Private>{s.title}</Private></span>
              </button>
            ),
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {o.status === "done" || o.status === "dismissed" ? (
          <button type="button" onClick={() => onStatus("new")} className={button}>
            <RotateCcw aria-hidden className="size-3.5" /> Bring back
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onStatus(o.status === "kept" ? "new" : "kept")} aria-pressed={o.status === "kept"} className={`${button} ${o.status === "kept" ? "border-ink bg-accent text-on-accent hover:bg-accent-strong" : ""}`}>
              <Sparkles aria-hidden className="size-3.5" /> {o.status === "kept" ? "Kept" : "Keep"}
            </button>
            {added ? (
              <Link to="/calendar" className={`${button} text-ok no-underline`}>
                <Check aria-hidden className="size-3.5" /> On your calendar
              </Link>
            ) : picking ? (
              <span className="inline-flex items-center gap-1.5">
                <label htmlFor={`d-${o.key}`} className="sr-only">
                  Date
                </label>
                <input id={`d-${o.key}`} type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} className="h-8 rounded-md border border-line-strong bg-card px-2 text-[12.5px]" />
                <button type="button" disabled={!date} onClick={toCalendar} className={button}>
                  Add
                </button>
              </span>
            ) : (
              <button type="button" onClick={toCalendar} className={button}>
                <CalendarPlus aria-hidden className="size-3.5" /> Add to calendar{o.deadlineDate ? ` · ${day(o.deadlineDate)}` : ""}
              </button>
            )}
            <button type="button" onClick={() => onStatus("done")} className={button}>
              <Check aria-hidden className="size-3.5" /> Done
            </button>
            <button type="button" onClick={() => onStatus("dismissed")} className={`${button} ml-auto border-transparent text-ink-2 hover:border-line-strong`}>
              <X aria-hidden className="size-3.5" /> Dismiss
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function Folded({ title, items, onStatus }: { title: string; items: Opportunity[]; onStatus: (key: string, status: Opportunity["status"]) => void }) {
  if (!items.length) return null;
  return (
    <details className="group rounded-xl border border-line bg-card/60">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-[13.5px] text-ink-2 hover:text-ink">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        <b className="font-semibold">
          {title} ({items.length})
        </b>
        <span className="truncate group-open:hidden">
          : <Private>{items.map((o) => o.title).slice(0, 3).join(" · ")}</Private>
          {items.length > 3 ? "…" : ""}
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        {items.map((o) => (
          <Card key={o.key} o={o} onStatus={(s) => onStatus(o.key, s)} />
        ))}
      </div>
    </details>
  );
}

export function Opportunities() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [area, setArea] = useState<OppArea | "all">("all");
  const [review, setReview] = useState<Review | null>(null);
  const [state, setState] = useState<"idle" | "building" | "scanning">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [web, setWeb] = useState(readWeb);
  const model = savedModel();
  const top = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    if (hasLibrary) listOpportunities().then(setItems);
  }, []);
  useEffect(() => {
    refresh();
    if (hasLibrary) getSecret("openrouter").then((k) => setHasKey(!!k));
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, [refresh]);

  const toggleWeb = (on: boolean) => {
    setWeb(on);
    try {
      localStorage.setItem(WEB_KEY, on ? "1" : "0");
    } catch {
      /* not remembered */
    }
  };

  /** Builds the masked scan and shows it before anything leaves the Mac. */
  const prepare = async () => {
    setError(null);
    setState("building");
    try {
      const [facts, docs] = await Promise.all([listFacts("approved"), listDocuments()]);
      const masker = new Masker(contactFacts(await listContacts()));
      // With the name check on, the privacy-filter model reads the titles and facts first; its finds are masked too.
      const detect = detector();
      if (detect) masker.learnFound(await detect([...docs.map((d) => d.title), ...facts.map((f) => `${f.label}: ${f.value}`)].join("\n")));
      const { sent, number } = buildScan(facts, docs, items, masker);
      const hidden = new Set(sent.match(/\[(?:PERSON|ID|DATE|ADDRESS|EMAIL|PHONE|IBAN|PRIVATE)_\d+\]/g)).size;
      setReview({ sent, number, masker, hidden, cost: await estimate(model, sent, web) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setState("idle");
    }
  };

  const scan = async () => {
    if (!review) return;
    const apiKey = await getSecret("openrouter");
    if (!apiKey) return setError("Add your OpenRouter key in Connected AIs first.");
    setError(null);
    setState("scanning");
    try {
      const found = await scanCloud({ apiKey, model, sent: review.sent, web });
      await saveOpportunities(restore(found, review.masker, review.number));
      setReview(null);
      refresh();
      top.current?.scrollIntoView({ block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setState("idle");
    }
  };

  const setStatus = async (key: string, status: Opportunity["status"]) => {
    await setOpportunityStatus(key, status);
    refresh();
  };

  const inArea = items.filter((o) => area === "all" || o.area === area);
  const open = inArea.filter((o) => o.fit !== "no" && (o.status === "new" || o.status === "kept"));
  const forYou = items.filter((o) => o.fit === "yes" && (o.status === "new" || o.status === "kept")).length;
  const toCheck = items.filter((o) => o.fit === "maybe" && (o.status === "new" || o.status === "kept")).length;
  const scannedAt = items.reduce((max, o) => (o.scannedAt > max ? o.scannedAt : max), "");
  const areas = OPP_AREAS.filter((a) => items.some((o) => o.area === a && o.status !== "dismissed"));

  return (
    <div ref={top} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[30px] font-light tracking-tight">Opportunities</h1>
          <span className="text-sm text-ink-2">
            {items.length
              ? `${forYou} for you · ${toCheck} to check${scannedAt ? ` · scanned ${day(scannedAt)}` : ""}`
              : "Advantages you can use, found from your approved facts."}
          </span>
        </div>
        <button
          type="button"
          onClick={prepare}
          disabled={state !== "idle" || !hasLibrary || hasKey === false}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40"
        >
          {state === "building" ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ScanSearch aria-hidden className="size-4" />}
          {items.length ? "Scan again" : "Find opportunities"}
        </button>
      </header>

      {hasKey === false && (
        <Link to="/connections" className="self-start rounded-lg bg-private-soft px-4 py-2.5 text-sm font-semibold text-private-ink hover:underline">
          Add your OpenRouter key to scan
        </Link>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}

      {review && (
        <section aria-label="Review the scan" className="flex flex-col gap-3 rounded-xl border border-private/60 bg-card p-4">
          <p className="m-0 text-sm">
            <b>
              {review.hidden} private {review.hidden === 1 ? "detail is" : "details are"} hidden.
            </b>{" "}
            The scan sends your approved facts and the names of your documents, never their pages. Check it, then scan.
          </p>
          <details className="group rounded-lg border border-line bg-ground/60">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12.5px] text-ink-2 hover:text-ink">
              <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
              <ShieldCheck aria-hidden className="size-3.5 text-private-ink" />
              Will be sent to <span className="font-mono">{model}</span> · zero data retention
            </summary>
            <pre data-selectable className="m-0 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-b-lg bg-code p-3.5 font-mono text-[12px] leading-relaxed text-rail-ink">
              <Placeholders text={review.sent} />
            </pre>
          </details>
          <label className="flex items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={web} onChange={(e) => toggleWeb(e.currentTarget.checked)} className="mt-0.5 size-4 accent-accent" />
            <span className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Globe aria-hidden className="size-3.5" /> Check current rules on the web
              </span>
              <span className="text-[12.5px] text-ink-2">More accurate, but the web search runs outside zero data retention: the searches (written from the masked text) are sent to a search provider.</span>
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={scan} disabled={state === "scanning"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60">
              {state === "scanning" && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
              {state === "scanning" ? "Scanning… (up to a minute)" : "Scan"}
            </button>
            <button type="button" onClick={() => setReview(null)} disabled={state === "scanning"} className="h-10 px-3 text-sm text-ink-2 hover:text-ink">
              Cancel
            </button>
            {review.cost && <span className="ml-auto text-[12.5px] text-ink-2">{review.cost} with this model</span>}
          </div>
        </section>
      )}

      {items.length === 0 && !review && hasLibrary && (
        <div className="rounded-xl border border-line bg-card px-5 py-8 text-sm text-ink-2">
          No scan yet. Voidcat sends your approved facts, with private details hidden, to the AI you chose, and lists tax reliefs, residency milestones and other
          advantages that fit your situation. You see exactly what is sent first.
        </div>
      )}

      {areas.length > 1 && (
        <div role="tablist" aria-label="Areas" className="flex flex-wrap gap-1.5">
          {(["all", ...areas] as const).map((a) => (
            <button
              type="button"
              role="tab"
              key={a}
              aria-selected={area === a}
              onClick={() => setArea(a)}
              className={`rounded-full px-3 py-1.5 text-[13px] ${area === a ? "bg-accent font-semibold text-on-accent" : "bg-card text-ink hover:bg-white/70"}`}
            >
              {a === "all" ? "All" : AREA_NAMES[a]}
            </button>
          ))}
        </div>
      )}

      {open.map((o) => (
        <Card key={o.key} o={o} onStatus={(s) => setStatus(o.key, s)} />
      ))}
      {items.length > 0 && open.length === 0 && <p className="m-0 text-sm text-ink-2">Nothing open here.</p>}

      <Folded title="Checked, not for you" items={inArea.filter((o) => o.fit === "no" && (o.status === "new" || o.status === "kept"))} onStatus={setStatus} />
      <Folded title="Done" items={inArea.filter((o) => o.status === "done")} onStatus={setStatus} />
      <Folded title="Dismissed" items={inArea.filter((o) => o.status === "dismissed")} onStatus={setStatus} />
    </div>
  );
}
