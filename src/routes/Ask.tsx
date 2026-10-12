import { ArrowUp, ChevronRight, FileText, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";
import { type Turn, askCloud, savedModel } from "../lib/cloud";
import { type Fact, type Hit, documentPages, getSecret, hasLibrary, listFacts, openDocument, searchLibrary } from "../lib/library";
import { Masker } from "../lib/privacy";
import { Private, useVeil } from "../lib/veil";

const PAGE_CHARS = 1800;
const MAX_PAGES = 5;
const PLACEHOLDER = /(\[(?:PERSON|ID|DATE|ADDRESS|EMAIL|PHONE|IBAN|PRIVATE)_\d+\])/;

const SUGGESTIONS = ["When does my residence card expire?", "What do I pay in rent, and when?", "Which of my documents expire this year?", "Summarise my rental contract"];

type Exchange = {
  id: number;
  question: string;
  /** Exactly what was (or will be) sent for this question, already masked. */
  sent: string;
  hidden: number;
  sources: Hit[];
  answer: string;
  /** The answer as the model wrote it, with placeholders (shown while private details are hidden). */
  raw: string;
  state: "review" | "sending" | "done" | "failed";
  error?: string;
};

/** The user's approved facts and the pages that best match the question, as one masked message. */
async function build(question: string, masker: Masker) {
  const [facts, hits] = await Promise.all([listFacts("approved"), searchLibrary(question, true)]);
  masker.learn(facts);
  const top = hits.slice(0, MAX_PAGES);
  const pages = await Promise.all(
    top.map(async (h) => `### ${h.title}, page ${h.page}\n${((await documentPages(h.documentId)).find((p) => p.page === h.page)?.text ?? "").slice(0, PAGE_CHARS)}`),
  );
  const factLines = facts.map((f: Fact) => `- ${f.label}: ${f.value} (${f.documentTitle}${f.page ? `, p. ${f.page}` : ""})`);
  const body = [
    `Question: ${question}`,
    factLines.length ? `Facts the user approved:\n${factLines.join("\n")}` : "",
    pages.length ? `Matching pages from the user's documents:\n\n${pages.join("\n\n")}` : "No document pages matched the question.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const masked = masker.mask(body);
  const notes = masker.notes();
  return { sent: notes.length ? `${masked}\n\nNotes on dates:\n${notes.join("\n")}` : masked, sources: top };
}

function MaskedText({ text }: { text: string }) {
  return (
    <>
      {text.split(PLACEHOLDER).map((part, i) =>
        i % 2 ? (
          <span key={i} className="rounded bg-[#3a3220] px-1 text-private">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Sent({ e, open }: { e: Exchange; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-line bg-ground/60">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12.5px] text-ink-2 hover:text-ink">
        <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
        <ShieldCheck aria-hidden className="size-3.5 text-private-ink" />
        {e.state === "review" ? "Will be sent" : "What was sent"} · {e.hidden ? `${e.hidden} private ${e.hidden === 1 ? "detail" : "details"} hidden` : "nothing private"} · zero data retention
      </summary>
      <pre data-selectable className="m-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-b-lg bg-ink p-3.5 font-mono text-[12px] leading-relaxed text-rail-ink">
        <MaskedText text={e.sent} />
      </pre>
    </details>
  );
}

export function Ask() {
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const masker = useRef(new Masker([]));
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const model = savedModel();
  const veil = useVeil();

  useEffect(() => {
    if (hasLibrary) getSecret("openrouter").then((k) => setHasKey(!!k));
    input.current?.focus();
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  const update = (id: number, patch: Partial<Exchange>) => setThread((t) => t.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  /** Sends one exchange with the earlier ones as context, and streams the answer in, unmasked on this Mac. */
  const send = async (e: Exchange, earlier: Exchange[]) => {
    const apiKey = await getSecret("openrouter");
    if (!apiKey) return update(e.id, { state: "failed", error: "Add your OpenRouter key in Connected AIs first." });
    update(e.id, { state: "sending" });
    const messages: Turn[] = [
      ...earlier.filter((x) => x.state === "done").flatMap((x): Turn[] => [{ role: "user", content: x.sent }, { role: "assistant", content: masker.current.mask(x.answer) }]),
      { role: "user", content: e.sent },
    ];
    try {
      let raw = "";
      for await (const chunk of askCloud({ apiKey, model, messages }).textStream) {
        raw += chunk;
        update(e.id, { answer: masker.current.unmask(raw), raw });
      }
      update(e.id, { state: "done" });
    } catch (err) {
      update(e.id, { state: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    setBusy(true);
    try {
      const built = await build(q, masker.current);
      const e: Exchange = { id: Date.now(), question: q, sent: built.sent, hidden: hiddenIn(built.sent), sources: built.sources, answer: "", raw: "", state: "review" };
      const earlier = thread;
      setThread((t) => [...t, e]);
      // Nothing private in it: no reason to make you confirm.
      if (!PLACEHOLDER.test(e.sent)) await send(e, earlier);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setThread([]);
    masker.current = new Masker([]);
    input.current?.focus();
  };

  const needsSetup = hasKey === false;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 pb-4">
        <h1 className="m-0 text-[26px] font-bold tracking-tight">Ask</h1>
        <span className="rounded-full bg-card px-2.5 py-1 font-mono text-[12px] text-ink-2">{model}</span>
        {thread.length > 0 && (
          <button type="button" onClick={restart} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-ink-2 hover:bg-card hover:text-ink">
            <RotateCcw aria-hidden className="size-3.5" /> New conversation
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-6">
        {thread.length === 0 ? (
          <div className="m-auto flex max-w-lg flex-col items-center gap-4 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-ink">
              <ShieldCheck aria-hidden className="size-6 text-private" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="m-0 text-lg font-semibold">Ask about your documents</p>
              <p className="m-0 text-sm text-ink-2">Names, IDs, addresses and dates are hidden on this Mac before anything is sent. If a question would send something private, you see it first.</p>
            </div>
            {needsSetup ? (
              <Link to="/connections" className="rounded-lg bg-private-soft px-4 py-2.5 text-sm font-semibold text-private-ink hover:underline">
                Add your OpenRouter key to start
              </Link>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button type="button" key={s} onClick={() => ask(s)} className="rounded-full border border-line bg-card px-3.5 py-2 text-[13.5px] hover:border-ink-2">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          thread.map((e, i) => (
            <article key={e.id} className="flex flex-col gap-3">
              <p data-selectable className="m-0 max-w-[85%] self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-white">
                <Private>{e.question}</Private>
              </p>

              {e.state === "review" ? (
                <div className="flex flex-col gap-3 rounded-xl border border-private/60 bg-card p-4">
                  <p className="m-0 text-sm">
                    <b>{e.hidden} private {e.hidden === 1 ? "detail is" : "details are"} hidden.</b> Check what will leave this Mac, then send.
                  </p>
                  <Sent e={e} open />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => send(e, thread.slice(0, i))} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2">
                      Send
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setThread((t) => t.filter((x) => x.id !== e.id));
                        setDraft(e.question);
                        input.current?.focus();
                      }}
                      className="h-10 px-3 text-sm text-ink-2 hover:text-ink"
                    >
                      Edit question
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {e.answer ? (
                    <div data-selectable className="md-page text-[15px] leading-relaxed text-ink">
                      <Markdown remarkPlugins={[remarkGfm]}>{veil.on ? e.raw : e.answer}</Markdown>
                    </div>
                  ) : e.state === "sending" ? (
                    <span className="flex items-center gap-2 text-sm text-ink-2">
                      <LoaderCircle aria-hidden className="size-4 animate-spin" /> Thinking…
                    </span>
                  ) : null}
                  {e.error && (
                    <p role="alert" className="m-0 text-sm text-[#b42318]">
                      {e.error}
                    </p>
                  )}
                  {e.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {e.sources.map((s) => (
                        <button
                          type="button"
                          key={`${s.documentId}-${s.page}`}
                          onClick={() => openDocument(s.documentId)}
                          className="inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 text-[12.5px] text-link hover:underline"
                        >
                          <FileText aria-hidden className="size-3.5" /> <Private>{s.title}</Private>, p. {s.page}
                        </button>
                      ))}
                    </div>
                  )}
                  <Sent e={e} />
                </div>
              )}
            </article>
          ))
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          ask(draft);
        }}
        className="flex items-end gap-2 rounded-2xl border border-[#d3d8dd] bg-card p-2 shadow-sm focus-within:border-ink-2"
      >
        <label htmlFor="ask-question" className="sr-only">
          Your question
        </label>
        <textarea
          id="ask-question"
          ref={input}
          rows={1}
          value={draft}
          onChange={(ev) => setDraft(ev.currentTarget.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
              ev.preventDefault();
              ask(draft);
            }
          }}
          placeholder={thread.length ? "Ask a follow-up…" : "Ask about your documents…"}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] outline-none [field-sizing:content]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          aria-label="Ask"
          className="grid size-10 place-items-center rounded-xl bg-ink text-white hover:bg-rail-2 disabled:opacity-30"
        >
          {busy ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : <ArrowUp aria-hidden className="size-5" />}
        </button>
      </form>
      <p className="m-0 pt-2 text-center text-[12px] text-ink-2">Answers can be wrong. Check them against the source pages.</p>
    </div>
  );
}

/** How many different private details a message hides. */
const hiddenIn = (sent: string) => new Set(sent.match(new RegExp(PLACEHOLDER, "g"))).size;
