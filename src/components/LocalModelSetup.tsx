import { Check, Cpu, Download, ExternalLink, LoaderCircle, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ReactNode } from "react";
import { READING_MODELS, readingModel, setReadingModel } from "../lib/extract";
import { type OllamaState, downloadOllama, isInstalled, macMemory, openOllama, useOllamaSetup } from "../lib/ollamaSetup";

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

/** A download in progress: spinner, bar and percent. */
function Progress({ share }: { share: number }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
      <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      <span className="h-1.5 w-40 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      {Math.round(share * 100)}%
    </span>
  );
}

/**
 * The model that reads and files documents: three sizes of the same family, with which ones fit this Mac. Picking one
 * that isn't installed downloads it first. Other installed models are listed as chat-only (picked in Ask).
 */
function ModelChooser({ setup }: { setup: ReturnType<typeof useOllamaSetup> }) {
  const [chosen, setChosen] = useState(readingModel());
  const [memory, setMemory] = useState<number | null>(null);
  useEffect(() => {
    macMemory().then(setMemory);
  }, []);
  const use = async (id: string) => {
    if (setup.pulling) return;
    if (!isInstalled(setup.installed, id) && !(await setup.pull(id))) return;
    setReadingModel(id);
    setChosen(id);
    setup.check();
  };
  const reading = new Set<string>(READING_MODELS.map((m) => m.id));
  const chatOnly = setup.installed.filter((n) => !reading.has(n.replace(/:latest$/, "")));

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[13px] font-semibold">Reads and files your documents</legend>
        {READING_MODELS.map((m) => {
          const installed = isInstalled(setup.installed, m.id);
          const inUse = chosen === m.id && installed;
          const tooBig = memory !== null && memory < m.memory;
          return (
            <div key={m.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2.5 ${inUse ? "border-ink-2 bg-ground" : "border-line"}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-medium">{m.id}</span>
                  {inUse && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">In use</span>}
                  {tooBig && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">Too big for this Mac</span>}
                </span>
                <span className="text-[12.5px] text-ink-2">{m.note}</span>
              </span>
              {setup.pulling === m.id ? (
                <Progress share={setup.share ?? 0} />
              ) : inUse ? null : (
                <button
                  type="button"
                  disabled={!!setup.pulling}
                  onClick={() => use(m.id)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold hover:border-ink-2 disabled:opacity-40"
                >
                  {installed ? (
                    "Use"
                  ) : (
                    <>
                      <Download aria-hidden className="size-3.5" /> Download {m.size}
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
        {memory !== null && <p className="m-0 text-[12px] text-ink-2">This Mac has {memory} GB of memory. Documents already read stay as they are; a new model reads the next ones.</p>}
        {setup.error && <p className="m-0 text-[12.5px] text-danger">{setup.error}</p>}
      </fieldset>
      {chatOnly.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Also on this Mac, for chat</span>
          <span className="flex flex-wrap gap-1.5">
            {chatOnly.map((n) => (
              <span key={n} className="rounded-md bg-ground px-2 py-0.5 font-mono text-[12px]">
                {n}
              </span>
            ))}
          </span>
          <span className="text-[12px] text-ink-2">
            Pick any of these, or the reading models above, from the model menu in <Link to="/ask" className="text-link">Ask</Link>.
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Sets up the local model without Terminal: install Ollama (its download page), open it, then choose and download
 * the reading model here with a progress bar. Checks again every few seconds, so installing in another window moves
 * it on by itself.
 */
export function LocalModelSetup() {
  const setup = useOllamaSetup();
  const { state } = setup;
  const at = ORDER.indexOf(state);
  if (state === "checking") return <p className="m-0 text-[13px] text-ink-2">Checking this Mac…</p>;
  if (state === "ready" || state === "no-model")
    return (
      <>
        {state === "no-model" && <p className="m-0 text-[13px] text-ink-2">Ollama is running. Download a model to read your documents: the recommended one is marked.</p>}
        <ModelChooser setup={setup} />
      </>
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
      <Step n={3} done={false} current={false} title="Choose and download the model" />
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
