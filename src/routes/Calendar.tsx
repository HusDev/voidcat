import { save } from "@tauri-apps/plugin-dialog";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Download, FileText, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type CalEvent,
  type Kind,
  type Paper,
  REMINDERS,
  addEvent,
  eventPapers,
  fromIso,
  matchPaper,
  monthCells,
  removeEvent,
  saveCalendarFile,
  setEventDone,
  setEventPapers,
  toIcs,
} from "../lib/calendar";
import { papersToBring } from "../lib/extract";
import { type Document, announceChange, documentPages, openDocument } from "../lib/library";
import { useCalendar } from "../lib/useCalendar";
import { Private } from "../lib/veil";

const TAG: Record<Kind, [string, string]> = {
  appointment: ["Appointment", "bg-accent-soft text-link"],
  deadline: ["Deadline", "bg-danger-soft text-danger"],
  expires: ["Expires", "bg-danger-soft text-danger"],
  payment: ["Payment", "bg-private-soft text-private-ink"],
  contract: ["Contract", "bg-ground text-ink-2"],
  work: ["Work", "bg-ground text-ink-2"],
  other: ["Date", "bg-ground text-ink-2"],
};
const DOT: Partial<Record<Kind, string>> = { appointment: "bg-accent", deadline: "bg-danger", expires: "bg-danger", payment: "bg-private-line" };

const day = (iso: string, opts: Intl.DateTimeFormatOptions) => fromIso(iso).toLocaleDateString("en-GB", opts);
const daysUntil = (iso: string) => Math.round((fromIso(iso).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
const inWords = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : n < 14 ? `in ${n} days` : n < 60 ? `in ${Math.round(n / 7)} weeks` : `in ${Math.round(n / 30.4)} months`);

function Papers({ event, docs }: { event: CalEvent; docs: Document[] }) {
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    eventPapers(event.key).then(setPapers);
  }, [event.key]);

  const find = async () => {
    if (!event.documentId) return;
    setFinding(true);
    setError(null);
    try {
      const names = await papersToBring((await documentPages(event.documentId)).map((p) => p.text));
      const list = names.map((name) => ({ name, documentId: matchPaper(name, docs)?.id ?? null }));
      await setEventPapers(event.key, list);
      setPapers(list);
      if (!names.length) setError("The appointment doesn't list any papers to bring.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setFinding(false);
  };

  if (papers === null) return null;
  const ready = papers.filter((p) => p.documentId).length;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-ground px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{papers.length ? `Papers to bring · ${ready} of ${papers.length} in your library` : "Papers to bring"}</span>
        {event.documentId && (
          <button type="button" onClick={find} disabled={finding} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-link hover:underline disabled:opacity-50">
            {finding && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
            {papers.length ? "Read again" : "Find them in the appointment"}
          </button>
        )}
      </div>
      {papers.map((p) => {
        const doc = docs.find((d) => d.id === p.documentId);
        return (
          <div key={p.name} className="flex items-center gap-2 text-[13.5px]">
            {doc ? (
              <span className="grid size-4.5 place-items-center rounded-full bg-ok text-white">
                <Check aria-hidden className="size-3" strokeWidth={3} />
              </span>
            ) : (
              <span className="grid size-4.5 place-items-center rounded-full border-2 border-private-line text-[10px] font-bold text-private-ink">!</span>
            )}
            <span className="flex-1">{p.name}</span>
            {doc ? (
              <button type="button" onClick={() => openDocument(doc.id)} className="max-w-[45%] truncate text-[12.5px] text-link hover:underline">
                <Private>{doc.folderName ?? doc.title}</Private>
              </button>
            ) : (
              <span className="text-[12.5px] text-private-ink">Not in your library yet</span>
            )}
          </div>
        );
      })}
      {error && <span className="text-[12.5px] text-ink-2">{error}</span>}
    </div>
  );
}

function AddEvent({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ title: "", date: "", time: "", place: "", kind: "appointment" as Kind });
  const [error, setError] = useState<string | null>(null);
  const field = "h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13.5px] outline-none focus:border-ink-2";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await addEvent({ title: form.title, date: form.date, time: form.time || null, place: form.place || null, kind: form.kind, documentId: null, notes: null });
          announceChange();
          onDone();
        } catch (err) {
          setError(String(err));
        }
      }}
      className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-card p-4 lg:grid-cols-[2fr_1fr_1fr_1.5fr_1fr_auto]"
    >
      <label className="sr-only" htmlFor="ev-title">Title</label>
      <input id="ev-title" required placeholder="What, e.g. Empadronamiento at the OAC" value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} className={`${field} col-span-2 lg:col-span-1`} />
      <label className="sr-only" htmlFor="ev-date">Date</label>
      <input id="ev-date" required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.currentTarget.value })} className={field} />
      <label className="sr-only" htmlFor="ev-time">Time</label>
      <input id="ev-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.currentTarget.value })} className={field} />
      <label className="sr-only" htmlFor="ev-place">Place</label>
      <input id="ev-place" placeholder="Where (optional)" value={form.place} onChange={(e) => setForm({ ...form, place: e.currentTarget.value })} className={field} />
      <label className="sr-only" htmlFor="ev-kind">Kind</label>
      <select id="ev-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.currentTarget.value as Kind })} className={field}>
        {(Object.keys(TAG) as Kind[]).map((k) => (
          <option key={k} value={k}>
            {TAG[k][0]}
          </option>
        ))}
      </select>
      <button type="submit" className="h-9 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-white hover:bg-accent-strong">
        Add
      </button>
      {error && <span className="col-span-full text-[12.5px] text-danger">{error}</span>}
    </form>
  );
}

export function Calendar() {
  const { events, done, docs, refresh } = useCalendar();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = new Date().toDateString();
  const upcoming = events.filter((e) => !done.has(e.key) && fromIso(e.date) >= new Date(today));
  const next = upcoming.find((e) => e.kind === "appointment");
  const rest = upcoming.filter((e) => e !== next);
  const needs = upcoming.filter((e) => (e.kind === "deadline" || e.kind === "expires" || e.kind === "appointment") && daysUntil(e.date) <= 30);
  const finished = events.filter((e) => done.has(e.key));

  const markDone = async (e: CalEvent, value: boolean) => {
    await setEventDone(e.key, value);
    refresh();
    announceChange();
  };

  const exportIcs = async () => {
    const path = await save({ defaultPath: "Voidcat.ics", filters: [{ name: "Calendar", extensions: ["ics"] }] });
    if (!path) return;
    await saveCalendarFile(path, toIcs(upcoming));
    setNotice(`Saved ${upcoming.length} events. Open the file to add them to Apple Calendar, or import it in Google Calendar.`);
  };

  const cells = monthCells(month.getFullYear(), month.getMonth());
  const onDay = (n: number) => upcoming.filter((e) => fromIso(e.date).getFullYear() === month.getFullYear() && fromIso(e.date).getMonth() === month.getMonth() && fromIso(e.date).getDate() === n);

  return (
    <div className="flex gap-6">
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[30px] font-light tracking-tight">Calendar</h1>
            <span className="text-sm text-ink-2">Every date in your approved facts, with a reminder before it.</span>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setAdding(!adding)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[13.5px] hover:border-ink-2">
              <Plus aria-hidden className="size-4" /> Add event
            </button>
            <button type="button" onClick={exportIcs} disabled={!upcoming.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[13.5px] hover:border-ink-2 disabled:opacity-40">
              <Download aria-hidden className="size-4" /> Add to Apple or Google Calendar
            </button>
          </div>
        </header>
        {notice && <p role="status" className="m-0 text-sm text-ink-2">{notice}</p>}
        {adding && <AddEvent onDone={() => setAdding(false)} />}

        {events.length === 0 && (
          <div className="rounded-xl border border-line bg-card px-5 py-8 text-sm text-ink-2">
            No dates yet. Approve facts with dates (valid to, start dates, appointments) in Facts to approve, or add an event.
          </div>
        )}

        {next && (
          <article className="flex flex-col gap-3 rounded-xl border-2 border-accent bg-card p-4.5">
            <div className="flex items-start gap-3.5">
              <div className="flex w-15 shrink-0 flex-col items-center rounded-lg bg-accent py-1.5 text-white">
                <span className="text-[11px] font-semibold uppercase tracking-wider">{day(next.date, { weekday: "short" })}</span>
                <span className="text-2xl font-bold leading-tight">{fromIso(next.date).getDate()}</span>
                <span className="text-[11px]">{day(next.date, { month: "short" })}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-link">Next appointment · {inWords(daysUntil(next.date))}</span>
                <span className="text-[17px] font-bold">
                  <Private>{next.title}</Private>
                </span>
                <span className="text-[13.5px] text-ink-2">
                  {[next.time, next.place].filter(Boolean).length ? (
                    <>
                      {next.time}
                      {next.time && next.place ? " · " : ""}
                      {next.place && <Private>{next.place}</Private>}
                      {" · "}
                    </>
                  ) : null}
                  reminders the day before and 1 hour before
                </span>
                {next.documentId && (
                  <button type="button" onClick={() => openDocument(next.documentId!)} className="self-start text-[12.5px] text-link hover:underline">
                    From: <Private>{next.documentTitle ?? "document"}</Private>
                  </button>
                )}
              </div>
              <button type="button" onClick={() => markDone(next, true)} className="h-8 rounded-md border border-line-strong px-2.5 text-[12.5px] hover:border-ink-2">
                Done
              </button>
            </div>
            <Papers event={next} docs={docs} />
          </article>
        )}

        {rest.length > 0 && <h2 className="m-0 mt-2 text-sm font-semibold text-ink-2">Coming up</h2>}
        {rest.map((e) => {
          const [tag, cls] = TAG[e.kind];
          return (
            <article key={e.key} className="flex items-center gap-3.5 rounded-xl border border-line bg-card px-4 py-2.5">
              <span className="w-24 shrink-0 text-[13px] font-semibold tabular-nums">
                {day(e.date, { weekday: "short", day: "numeric", month: "short" })}
                {fromIso(e.date).getFullYear() !== new Date().getFullYear() && <span className="block text-[11.5px] font-normal text-ink-2">{fromIso(e.date).getFullYear()}</span>}
              </span>
              <span className={`w-24 shrink-0 rounded-full py-0.5 text-center text-[11.5px] font-semibold ${cls}`}>{tag}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14.5px] font-semibold">
                  <Private>{e.title}</Private>
                </span>
                <span className="truncate text-[12.5px] text-ink-2">
                  {e.time && `${e.time} · `}
                  {e.detail && <Private>{e.detail}</Private>}
                  {e.origin === "worked-out" && " · worked out by Voidcat"}
                </span>
              </div>
              {e.documentId && (
                <button type="button" onClick={() => openDocument(e.documentId!)} aria-label="Open the source document" className="grid size-8 place-items-center rounded-md text-link hover:bg-ground">
                  <FileText aria-hidden className="size-4" />
                </button>
              )}
              <button type="button" onClick={() => markDone(e, true)} className="h-8 rounded-md border border-line-strong px-2.5 text-[12.5px] hover:border-ink-2">
                Done
              </button>
              {e.manualId && (
                <button
                  type="button"
                  onClick={async () => {
                    await removeEvent(e.manualId!);
                    refresh();
                    announceChange();
                  }}
                  aria-label={`Remove ${e.title}`}
                  className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              )}
            </article>
          );
        })}

        {finished.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">Done ({finished.length})</summary>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
              {finished.map((e) => (
                <li key={e.key} className="flex items-center gap-3 text-[13.5px] text-ink-2">
                  <span className="w-24 tabular-nums">{day(e.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="flex-1 line-through">
                    <Private>{e.title}</Private>
                  </span>
                  <button type="button" onClick={() => markDone(e, false)} className="text-[12.5px] text-link hover:underline">
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <aside className="sticky top-0 hidden w-75 shrink-0 flex-col gap-3.5 self-start xl:flex">
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
          <div className="flex items-center">
            <span className="flex-1 text-[15px] font-bold">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid size-7 place-items-center rounded-md hover:bg-ground">
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid size-7 place-items-center rounded-md hover:bg-ground">
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-ink-2">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {cells.map((n, i) => {
              if (!n) return <span key={i} />;
              const evs = onDay(n);
              const isToday = new Date(month.getFullYear(), month.getMonth(), n).toDateString() === today;
              const dot = evs.map((e) => DOT[e.kind]).find(Boolean);
              return (
                <span
                  key={i}
                  title={evs.map((e) => e.title).join("\n") || undefined}
                  className={`grid h-8 place-items-center rounded-md text-[13px] tabular-nums ${dot ? `${dot} font-bold text-white` : evs.length ? "bg-ground font-semibold" : ""} ${isToday ? "ring-2 ring-ink ring-offset-1" : ""}`}
                >
                  {n}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-[11.5px] text-ink-2">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-accent" /> Appointment</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-danger" /> Deadline</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-private-line" /> Payment</span>
          </div>
        </div>

        {needs.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-private-soft px-4 py-3.5 text-private-ink">
            <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
              <CircleAlert aria-hidden className="size-4" /> {needs.length} {needs.length === 1 ? "date needs" : "dates need"} you this month
            </span>
            {needs.slice(0, 4).map((e) => (
              <span key={e.key} className="text-[13px] leading-snug">
                {day(e.date, { day: "numeric", month: "short" })} · <Private>{e.title}</Private>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-4 text-[13px] leading-relaxed text-ink-2">
          <span className="text-sm font-bold text-ink">Reminders</span>
          <span>Appointments: {REMINDERS.appointment.map((r) => r.label).join(" and ")}.</span>
          <span>Expiry dates: {REMINDERS.expires.map((r) => r.label.replace("in ", "")).join(", ")} before.</span>
          <span>Payments: 2 days before.</span>
          <span>Shown as Mac notifications while Voidcat is open. Nothing is sent to a server.</span>
        </div>
      </aside>
    </div>
  );
}
