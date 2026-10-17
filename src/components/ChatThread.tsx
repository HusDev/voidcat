import { AtSign, Check, ChevronRight, Copy, Cpu, FileArchive, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type Exchange, PLACEHOLDER } from "../lib/ask";
import { downloadZip, openDocument } from "../lib/library";
import type { Bundle } from "../lib/tools";
import { Private, useVeil } from "../lib/veil";

/** A conversation in Ask (or a document's own chat): questions, the review step, answers, sources and zips. */

function MaskedText({ text }: { text: string }) {
  return (
    <>
      {text.split(PLACEHOLDER).map((part, i) =>
        i % 2 ? (
          <span key={i} className="rounded bg-chip px-1 text-private">
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
  const veil = useVeil();
  if (e.model.provider === "local")
    return (
      <details className="group rounded-lg border border-line bg-ground/60">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12.5px] text-ink-2 hover:text-ink">
          <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
          <Cpu aria-hidden className="size-3.5 text-private-ink" />
          Answered on this Mac · {e.model.id} · nothing left the computer
        </summary>
        <pre data-selectable className="m-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-b-lg bg-code p-3.5 font-mono text-[12px] leading-relaxed text-rail-ink">
          {veil.on ? <MaskedText text={e.masked} /> : e.plain}
        </pre>
      </details>
    );
  return (
    <details open={open} className="group rounded-lg border border-line bg-ground/60">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12.5px] text-ink-2 hover:text-ink">
        <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
        <ShieldCheck aria-hidden className="size-3.5 text-private-ink" />
        {e.state === "review" ? "Will be sent" : "What was sent"} · {e.hidden ? `${e.hidden} private ${e.hidden === 1 ? "detail" : "details"} hidden` : "nothing private"} · zero data retention
      </summary>
      <pre data-selectable className="m-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-b-lg bg-code p-3.5 font-mono text-[12px] leading-relaxed text-rail-ink">
        <MaskedText text={e.sent} />
      </pre>
    </details>
  );
}

/** Copies an answer (with the real values, as you see it) to paste into a CV, a form or an email. */
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-[12px] text-ink-2 hover:bg-card hover:text-ink"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-ok" /> : <Copy aria-hidden className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Documents the model put together: a zip you save with one click (nothing is saved before that). */
function BundleCard({ bundle }: { bundle: Bundle }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-link">
          <FileArchive aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">
            <Private>{bundle.name}</Private>.zip
          </span>
          <span className="text-[13px] text-ink-2">
            {bundle.ids.length} {bundle.ids.length === 1 ? "document" : "documents"} from your library
          </span>
        </div>
        <button
          type="button"
          disabled={state === "saving"}
          onClick={async () => {
            setState("saving");
            try {
              setState((await downloadZip(bundle.name, bundle.ids)) ? "saved" : "idle");
            } catch (err) {
              setState(err instanceof Error ? err.message : String(err));
            }
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
        >
          {state === "saved" ? <Check aria-hidden className="size-4" /> : null}
          {state === "saved" ? "Saved" : "Save zip…"}
        </button>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {bundle.ids.map((id, i) => (
          <li key={id}>
            <button type="button" onClick={() => openDocument(id)} className="inline-flex items-center gap-1 rounded-md bg-ground px-2 py-1 text-[12.5px] text-link hover:underline">
              <FileText aria-hidden className="size-3.5" /> <Private>{bundle.titles[i]}</Private>
            </button>
          </li>
        ))}
      </ul>
      {!["idle", "saving", "saved"].includes(state) && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          The zip could not be saved: {state}
        </p>
      )}
    </div>
  );
}

export function ChatThread({
  thread,
  onSend,
  onEdit,
  compact = false,
}: {
  thread: Exchange[];
  /** Send an exchange waiting for review, with the ones before it as context. */
  onSend: (e: Exchange, earlier: Exchange[]) => void;
  /** Take a question waiting for review back into the message box. */
  onEdit: (e: Exchange) => void;
  /** Narrower text, for a document's side panel. */
  compact?: boolean;
}) {
  const veil = useVeil();
  const text = compact ? "text-[14px]" : "text-[15px]";
  return (
    <>
      {thread.map((e, i) => (
        <article key={e.id} className="flex flex-col gap-3">
          <div className="flex max-w-[85%] flex-col items-end gap-1 self-end">
            {e.scope && !compact && (
              <span className="flex flex-wrap justify-end gap-1">
                {e.scope.map((m) => (
                  <span key={`${m.kind}:${m.id}`} className="inline-flex items-center gap-0.5 rounded-md bg-card px-1.5 py-0.5 text-[12px] text-ink-2">
                    <AtSign aria-hidden className="size-3" />
                    <Private>{m.label}</Private>
                  </span>
                ))}
              </span>
            )}
            <p data-selectable className={`m-0 rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-ink ${text}`}>
              <Private>{e.question}</Private>
            </p>
          </div>

          {e.state === "review" ? (
            <div className="flex flex-col gap-3 rounded-xl border border-private/60 bg-card p-4">
              <p className="m-0 text-sm">
                <b>
                  {e.hidden} private {e.hidden === 1 ? "detail is" : "details are"} hidden.
                </b>{" "}
                Check what will leave this Mac, then send.
              </p>
              <Sent e={e} open />
              <div className="flex gap-2">
                <button type="button" onClick={() => onSend(e, thread.slice(0, i))} className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong">
                  Send
                </button>
                <button type="button" onClick={() => onEdit(e)} className="h-10 px-3 text-sm text-ink-2 hover:text-ink">
                  Edit question
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {e.answer ? (
                <div data-selectable className={`md-page leading-relaxed text-ink ${text}`}>
                  <Markdown remarkPlugins={[remarkGfm]}>{veil.on ? e.raw : e.answer}</Markdown>
                </div>
              ) : null}
              {e.answer && e.state === "done" && !veil.on ? (
                <CopyAnswer text={e.answer} />
              ) : e.state === "sending" && !e.answer ? (
                <span className="flex items-center gap-2 text-sm text-ink-2">
                  <LoaderCircle aria-hidden className="size-4 animate-spin" /> Thinking…
                </span>
              ) : null}
              {e.error && (
                <p role="alert" className="m-0 text-sm text-danger">
                  {e.error}
                </p>
              )}
              {e.sources.length > 0 && !compact && (
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
              {e.bundle && <BundleCard bundle={e.bundle} />}
              <Sent e={e} />
            </div>
          )}
        </article>
      ))}
    </>
  );
}
