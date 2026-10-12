import { ArrowUp, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";
import { askCloud, savedModel } from "../lib/cloud";
import { type Fact, type Hit, documentPages, getSecret, hasLibrary, listFacts, openDocument, searchLibrary } from "../lib/library";
import { Masker } from "../lib/privacy";

type Prepared = { masker: Masker; prompt: string; sources: Hit[]; facts: number };

const PAGE_CHARS = 1800;
const MAX_PAGES = 5;

/** Builds what the model will see: the user's approved facts and the best-matching pages, all masked. */
async function prepare(question: string): Promise<Prepared> {
  const [facts, hits] = await Promise.all([listFacts("approved"), searchLibrary(question, true)]);
  const masker = new Masker(facts);
  const top = hits.slice(0, MAX_PAGES);
  const pages = await Promise.all(
    top.map(async (h) => {
      const text = (await documentPages(h.documentId)).find((p) => p.page === h.page)?.text ?? "";
      return `### ${h.title}, page ${h.page}\n${text.slice(0, PAGE_CHARS)}`;
    }),
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
  return { masker, prompt: notes.length ? `${masked}\n\nNotes on dates (today is the reference):\n${notes.join("\n")}` : masked, sources: top, facts: facts.length };
}

/** Shows masked text with each placeholder marked, so it's clear what was hidden. */
function MaskedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[(?:PERSON|ID|DATE|ADDRESS|EMAIL|PHONE|IBAN|PRIVATE)_\d+\])/).map((part, i) =>
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

export function Ask() {
  const [question, setQuestion] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [answer, setAnswer] = useState("");
  const [state, setState] = useState<"idle" | "preparing" | "review" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const model = savedModel();
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (hasLibrary) getSecret("openrouter").then((k) => setHasKey(!!k));
  }, []);

  const review = async () => {
    if (!question.trim()) return;
    setError(null);
    setAnswer("");
    setState("preparing");
    try {
      setPrepared(await prepare(question.trim()));
      setState("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  };

  const send = async () => {
    if (!prepared || !model) return;
    const apiKey = await getSecret("openrouter");
    if (!apiKey) return setError("Add your OpenRouter key in Connected AIs first.");
    setState("sending");
    setError(null);
    try {
      const result = askCloud({ apiKey, model, prompt: prepared.prompt });
      let raw = "";
      for await (const chunk of result.textStream) {
        raw += chunk;
        setAnswer(prepared.masker.unmask(raw));
      }
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("review");
    }
  };

  const hidden = prepared?.masker.entries().length ?? 0;
  const ready = hasKey && model;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-bold tracking-tight">Ask</h1>
        <span className="text-sm text-ink-2">Ask about your documents. You see exactly what leaves this Mac before it's sent.</span>
      </header>

      {hasKey === false || !model ? (
        <p className="m-0 rounded-xl border border-line bg-private-soft px-4 py-3 text-sm text-private-ink">
          To ask a cloud model, add your OpenRouter key and pick a model in{" "}
          <Link to="/connections" className="font-semibold text-private-ink underline">
            Connected AIs
          </Link>
          .
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
        className="flex items-end gap-2 rounded-xl border border-[#d3d8dd] bg-card p-2 focus-within:border-ink-2"
      >
        <label htmlFor="ask-question" className="sr-only">
          Your question
        </label>
        <textarea
          id="ask-question"
          ref={input}
          rows={2}
          value={question}
          onChange={(e) => {
            setQuestion(e.currentTarget.value);
            if (state !== "idle" && state !== "preparing") setState("idle");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              review();
            }
          }}
          placeholder="When does my residence card expire, and what do I need to renew it?"
          className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none"
        />
        <button
          type="submit"
          disabled={!question.trim() || state === "preparing" || state === "sending"}
          aria-label="Prepare the question"
          className="grid size-10 place-items-center rounded-lg bg-ink text-white hover:bg-rail-2 disabled:opacity-40"
        >
          {state === "preparing" ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : <ArrowUp aria-hidden className="size-5" />}
        </button>
      </form>

      {error && (
        <p role="alert" className="m-0 text-sm text-[#b42318]">
          {error}
        </p>
      )}

      {prepared && state !== "idle" && state !== "preparing" && (
        <section aria-label="What will be sent" className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4.5">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck aria-hidden className="size-4.5 text-private-ink" />
            <span className="text-sm font-semibold">
              What {model ?? "the model"} will receive
            </span>
            <span className="text-[13px] text-ink-2">
              · {hidden} private {hidden === 1 ? "detail" : "details"} hidden · {prepared.sources.length} {prepared.sources.length === 1 ? "page" : "pages"} · {prepared.facts} facts · zero data retention
            </span>
          </div>
          <pre data-selectable className="m-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink p-3.5 font-mono text-[12.5px] leading-relaxed text-rail-ink">
            <MaskedText text={prepared.prompt} />
          </pre>
          {state === "review" && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={send}
                disabled={!ready}
                className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2 disabled:opacity-40"
              >
                Send to {model?.split("/").pop() ?? "model"}
              </button>
              <button type="button" onClick={() => input.current?.focus()} className="h-10 px-2 text-sm text-ink-2 hover:text-ink">
                Edit question
              </button>
            </div>
          )}
        </section>
      )}

      {(answer || state === "sending") && (
        <section aria-label="Answer" className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">Answer · real details put back on this Mac</span>
          {answer ? (
            <div data-selectable className="md-page text-[14.5px] leading-relaxed text-ink">
              <Markdown remarkPlugins={[remarkGfm]}>{answer}</Markdown>
            </div>
          ) : (
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <LoaderCircle aria-hidden className="size-4 animate-spin" /> Waiting for the answer…
            </span>
          )}
          {prepared && prepared.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
              {prepared.sources.map((s) => (
                <button
                  type="button"
                  key={`${s.documentId}-${s.page}`}
                  onClick={() => openDocument(s.documentId)}
                  className="inline-flex items-center gap-1 rounded-md bg-ground px-2 py-1 text-[12.5px] text-link hover:underline"
                >
                  <FileText aria-hidden className="size-3.5" /> {s.title}, p. {s.page}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
