import { Check, Cpu, Download, ExternalLink, LoaderCircle, Play } from "lucide-react";
import { Link } from "react-router";
import type { ReactNode } from "react";
import { LOCAL_MODEL } from "../lib/extract";
import { type OllamaState, downloadOllama, openOllama, useOllamaSetup } from "../lib/ollamaSetup";

const ORDER: OllamaState[] = ["missing", "installed", "no-model", "ready"];

/** One step of the setup: done, the current one (with its button), or still to come. */
function Step({ n, done, current, title, children }: { n: number; done: boolean; current: boolean; title: string; children?: ReactNode }) {
  return (
    <li className={`flex gap-3 ${!done && !current ? "opacity-50" : ""}`}>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${done ? "bg-ok-soft text-ok" : current ? "bg-accent text-on-accent" : "bg-ground text-ink-2"}`}>
        {done ? <Check aria-hidden className="size-3.5" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[14px] font-semibold">{title}</span>
        {current && children}
      </div>
    </li>
  );
}

const button = "inline-flex w-fit items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40";

/**
 * Sets up the local model without Terminal: install Ollama (its download page), open it, then download the model
 * here with a progress bar. Checks again every few seconds, so installing in another window moves it on by itself.
 */
export function LocalModelSetup() {
  const { state, share, error, pull } = useOllamaSetup();
  const at = ORDER.indexOf(state);
  if (state === "checking") return <p className="m-0 text-[13px] text-ink-2">Checking this Mac…</p>;
  if (state === "ready")
    return (
      <p className="m-0 flex items-center gap-1.5 text-[13px] text-ok">
        <Check aria-hidden className="size-4" /> Ready. <span className="font-mono">{LOCAL_MODEL}</span> runs on this Mac.
      </p>
    );
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      <Step n={1} done={at > 0} current={state === "missing"} title="Install Ollama, the free app that runs the model">
        <p className="m-0 text-[13px] text-ink-2">Download it, open the file and drag Ollama to Applications. Voidcat notices when it's there.</p>
        <button type="button" onClick={downloadOllama} className={button}>
          <ExternalLink aria-hidden className="size-3.5" /> Download Ollama
        </button>
      </Step>
      <Step n={2} done={at > 1} current={state === "installed"} title="Open Ollama">
        <p className="m-0 text-[13px] text-ink-2">It runs quietly in the menu bar, like Voidcat.</p>
        <button type="button" onClick={openOllama} className={button}>
          <Play aria-hidden className="size-3.5" /> Open Ollama
        </button>
      </Step>
      <Step n={3} done={false} current={state === "no-model"} title="Download the local model">
        <p className="m-0 text-[13px] text-ink-2">
          About 7 GB, once. It reads and files your documents on this Mac; nothing is uploaded. Keep Voidcat open while it downloads.
        </p>
        {share === null ? (
          <button type="button" onClick={pull} className={button}>
            <Download aria-hidden className="size-3.5" /> Download the model
          </button>
        ) : (
          <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
            <span className="h-1.5 w-48 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
            Downloading… {Math.round(share * 100)}%
          </span>
        )}
        {error && <p className="m-0 text-[12.5px] text-danger">{error}</p>}
      </Step>
    </ol>
  );
}

/** On the Library while the local model isn't set up: without it nothing gets read or filed. */
export function LocalModelBanner() {
  const { state } = useOllamaSetup();
  if (state === "checking" || state === "ready") return null;
  return (
    <Link to="/connections" className="flex items-center gap-3 rounded-xl border border-line-strong bg-card px-4 py-3 text-[13.5px] hover:border-ink-2">
      <Cpu aria-hidden className="size-4.5 shrink-0 text-ink-2" />
      <span className="flex-1">
        <span className="font-semibold">Set up the local model</span> <span className="text-ink-2">to read and file your documents on this Mac. Three steps, no Terminal.</span>
      </span>
      <span className="shrink-0 font-semibold text-link">Set up</span>
    </Link>
  );
}
