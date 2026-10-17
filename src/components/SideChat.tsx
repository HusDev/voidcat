import { ArrowUp, FileText, LoaderCircle } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { type Exchange, type Mention, needsReview, prepare, run } from "../lib/ask";
import { type Document, announceChats, saveChat } from "../lib/library";
import { Masker } from "../lib/privacy";
import { useAskModel } from "../lib/useAskModel";
import { Private } from "../lib/veil";
import { ChatThread } from "./ChatThread";
import { ModelPicker, ThinkFirst } from "./ModelPicker";

/**
 * The height that fits the panel between where it sits and the bottom of the window. The page header pushes it down
 * at the top of the page and it rises when stuck while scrolling, so it is measured again on scroll and resize.
 */
function useFitHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState(480);
  useEffect(() => {
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = ref.current?.getBoundingClientRect().top;
        if (top !== undefined) setHeight(Math.max(320, Math.round(window.innerHeight - top - 24)));
      });
    };
    fit();
    window.addEventListener("resize", fit);
    document.addEventListener("scroll", fit, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
      document.removeEventListener("scroll", fit, true);
    };
  }, [ref]);
  return height;
}

/**
 * A chat in a side panel, beside a document or your profile. It works like Ask (same models, review step, tools) but
 * with its own context: a scope (only this document) and/or extra text sent with every question (your profile). The
 * conversation is saved like any other chat, so "Continue in Ask" picks it up there.
 */
export function SideChat({
  resetKey,
  title,
  reads,
  scope,
  extra,
  suggestions,
  placeholder,
}: {
  /** A new conversation starts when this changes (another document). */
  resetKey: string;
  title: string;
  /** What the model reads, shown under the title. */
  reads: ReactNode;
  scope?: Mention[];
  /** Built for each question, e.g. the profile as text. */
  extra?: () => string;
  suggestions: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const masker = useRef(new Masker([]));
  const list = useRef<HTMLDivElement>(null);
  // Follow new text only while you're at the bottom, so you can scroll up mid-answer.
  const following = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { model, choose, local, cloudModel, needsSetup } = useAskModel();
  const panel = useRef<HTMLElement>(null);
  const height = useFitHeight(panel);

  useEffect(() => {
    setThread([]);
    setChatId(null);
    following.current = true;
    masker.current = new Masker([]);
  }, [resetKey]);
  // Scrolls the list itself: scrollIntoView would also scroll the page around the panel (the document beside it).
  useEffect(() => {
    const el = list.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [thread]);

  // Saved as a chat once something is answered.
  useEffect(() => {
    const finished = thread.filter((e) => e.state === "done" || e.state === "failed");
    if (!finished.length || thread.some((e) => e.state === "sending")) return;
    const id = chatId ?? crypto.randomUUID();
    if (!chatId) setChatId(id);
    saveChat(id, finished[0].question.slice(0, 120), JSON.stringify(finished)).then(announceChats);
  }, [thread]);

  const send = (e: Exchange, earlier: Exchange[]) => run(e, earlier, masker.current, (patch) => setThread((t) => t.map((x) => (x.id === e.id ? { ...x, ...patch } : x))));

  const ask = async (question = draft) => {
    const q = question.trim();
    if (!q || busy || !model) return;
    setDraft("");
    setBusy(true);
    following.current = true;
    try {
      const e = await prepare(q, model, masker.current, scope, extra?.());
      const earlier = thread;
      setThread((t) => [...t, e]);
      if (!needsReview(e)) await send(e, earlier);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside ref={panel} style={{ height }} aria-label={title} className="sticky top-0 flex max-w-[440px] min-w-0 flex-[1_1_340px] flex-col self-start overflow-hidden rounded-xl border border-line bg-card">
      <header className="flex flex-col gap-1 border-b border-line px-4 py-3">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-private-ink">{reads}</span>
      </header>

      <div
        ref={list}
        onScroll={(ev) => {
          const el = ev.currentTarget;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {thread.length === 0 ? (
          needsSetup ? (
            <Link to="/connections" className="m-auto text-sm font-semibold text-link hover:underline">
              Add a model provider to start
            </Link>
          ) : (
            <div className="m-auto flex flex-col items-stretch gap-1.5">
              {suggestions.map((q) => (
                <button key={q} type="button" disabled={!model || busy} onClick={() => ask(q)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] hover:border-ink-2 disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
          )
        ) : (
          <ChatThread
            compact
            thread={thread}
            onSend={send}
            onEdit={(e) => {
              setThread((t) => t.filter((x) => x.id !== e.id));
              setDraft(e.question);
              input.current?.focus();
            }}
          />
        )}
      </div>

      <footer className="flex flex-col gap-1.5 border-t border-line p-3">
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            ask();
          }}
          className="flex flex-col gap-1 rounded-xl border border-line-strong bg-card p-1.5 focus-within:border-ink-2"
        >
          <label htmlFor={`side-question-${resetKey}`} className="sr-only">
            Your question
          </label>
          <textarea
            id={`side-question-${resetKey}`}
            ref={input}
            rows={1}
            value={draft}
            onChange={(ev) => setDraft(ev.currentTarget.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                ask();
              }
            }}
            placeholder={placeholder}
            className="max-h-32 min-h-9 w-full resize-none bg-transparent px-2 py-1.5 text-[14px] outline-none [field-sizing:content]"
          />
          <div className="flex items-center gap-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <ModelPicker value={model} onChange={choose} local={local} cloudModel={cloudModel} />
              <ThinkFirst model={model} />
            </div>
            <button type="submit" disabled={!draft.trim() || busy || !model} aria-label="Ask" className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-30">
            {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ArrowUp aria-hidden className="size-4" />}
            </button>
          </div>
        </form>
        {chatId && (
          <button type="button" onClick={() => navigate(`/ask?chat=${chatId}`)} className="ml-auto shrink-0 px-1 text-[11.5px] text-link hover:underline">
            Continue in Ask
          </button>
        )}
      </footer>
    </aside>
  );
}

/** Ask about the document that's open: the model reads only this file. */
export function DocChat({ doc }: { doc: Document }) {
  return (
    <SideChat
      resetKey={doc.id}
      title="Ask about this document"
      reads={
        <>
          <FileText aria-hidden className="size-3.5 shrink-0" />
          <span className="shrink-0">Reads only</span>
          <span className="min-w-0 truncate font-semibold" title={doc.title}>
            <Private>{doc.title}</Private>
          </span>
        </>
      }
      scope={[{ kind: "document", id: doc.id, label: doc.title }]}
      suggestions={["Summarise this document", "Which dates matter here?", "What amounts does it mention?"]}
      placeholder="Ask about this document…"
    />
  );
}
