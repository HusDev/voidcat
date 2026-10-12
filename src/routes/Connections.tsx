import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { Check, ChevronDown, Cpu, KeyRound, Plug, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { type CloudModel, defaultModel, listModels, saveModel, savedModel } from "../lib/cloud";
import { LOCAL_MODEL, OLLAMA } from "../lib/extract";
import { getSecret, hasLibrary, removeSecret, setSecret } from "../lib/library";

const card = "flex flex-col gap-3 rounded-xl border border-line bg-card p-4.5";
const price = (m: CloudModel) => (m.promptPrice ? `$${m.promptPrice.toFixed(2)} / $${m.completionPrice.toFixed(2)} per million tokens` : "Free");

function CloudCard() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<CloudModel[]>([]);
  const [model, setModel] = useState<string | null>(savedModel());

  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasLibrary) getSecret("openrouter").then((k) => setHasKey(!!k));
    listModels()
      .then((list) => {
        setModels(list);
        // A remembered model that no longer exists falls back to the default.
        if (!list.some((m) => m.id === savedModel())) {
          const id = defaultModel(list);
          if (id) {
            setModel(id);
            saveModel(id);
          }
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  const shown = query ? models.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(query.toLowerCase())).slice(0, 50) : models.slice(0, 50);

  return (
    <article className={card}>
      <div className="flex items-center gap-2">
        <Plug aria-hidden className="size-4.5 text-ink-2" />
        <span className="font-semibold">Cloud models · OpenRouter</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${hasKey ? "bg-ok-soft text-ok" : "bg-ground text-ink-2"}`}>{hasKey ? "Connected" : "Not connected"}</span>
      </div>
      <p className="m-0 text-[13px] text-ink-2">
        One key for Claude, GPT, Gemini and more. Every request goes only to providers that keep nothing (zero data retention), and only after private details are masked on this Mac.
      </p>

      {hasKey ? (
        <div className="flex items-center gap-2 text-sm">
          <KeyRound aria-hidden className="size-4 text-ink-2" /> Key saved in your macOS Keychain
          <button
            type="button"
            onClick={async () => {
              await removeSecret("openrouter");
              setHasKey(false);
            }}
            className="ml-auto h-8 rounded-md border border-[#d3d8dd] px-2.5 text-[13px] hover:border-ink-2"
          >
            Remove key
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.trim().startsWith("sk-or-")) return setError("That doesn't look like an OpenRouter key (it starts with sk-or-).");
            await setSecret("openrouter", draft);
            setDraft("");
            setError(null);
            setHasKey(true);
          }}
          className="flex gap-2"
        >
          <label htmlFor="openrouter-key" className="sr-only">
            OpenRouter key
          </label>
          <input
            id="openrouter-key"
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            placeholder="sk-or-…"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-lg border border-[#d3d8dd] px-3 font-mono text-sm"
          />
          <button type="submit" disabled={!hasLibrary} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2 disabled:opacity-40">
            Save in Keychain
          </button>
        </form>
      )}

      <Combobox
        value={model}
        onChange={(id: string | null) => {
          if (!id) return;
          setModel(id);
          saveModel(id);
        }}
        onClose={() => setQuery("")}
      >
        <div className="relative">
          <span className="mb-1 block text-xs font-semibold text-ink-2">Model</span>
          <div className="flex h-10 items-center rounded-lg border border-[#d3d8dd] bg-card focus-within:border-ink-2">
            <ComboboxInput
              id="cloud-model"
              aria-label="Model"
              displayValue={(id: string | null) => id ?? ""}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={models.length ? "Search models…" : "Loading models…"}
              className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] outline-none"
            />
            <ComboboxButton aria-label="Show models" className="grid h-full w-9 place-items-center text-ink-2">
              <ChevronDown aria-hidden className="size-4" />
            </ComboboxButton>
          </div>
          <ComboboxOptions anchor="bottom start" className="z-10 max-h-72 w-(--input-width) overflow-y-auto rounded-lg border border-line bg-card p-1 shadow-lg [--anchor-gap:4px] empty:invisible">
            {shown.map((m) => (
              <ComboboxOption key={m.id} value={m.id} className="group flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 data-focus:bg-ground">
                <Check aria-hidden className="invisible mt-0.5 size-4 shrink-0 group-data-selected:visible" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px]">{m.name}</span>
                  <span className="truncate font-mono text-[11.5px] text-ink-2">
                    {m.id} · {price(m)}
                  </span>
                </span>
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </div>
      </Combobox>
      {error && <p className="m-0 text-[13px] text-[#b42318]">{error}</p>}
    </article>
  );
}

function LocalCard() {
  const [running, setRunning] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`${OLLAMA}/api/tags`)
      .then((r) => setRunning(r.ok))
      .catch(() => setRunning(false));
  }, []);
  return (
    <article className={card}>
      <div className="flex items-center gap-2">
        <Cpu aria-hidden className="size-4.5 text-ink-2" />
        <span className="font-semibold">Local model · Ollama</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${running ? "bg-ok-soft text-ok" : "bg-private-soft text-private-ink"}`}>
          {running === null ? "Checking…" : running ? "Running" : "Not running"}
        </span>
      </div>
      <p className="m-0 text-[13px] text-ink-2">
        Files documents and finds facts on this Mac with <span className="font-mono">{LOCAL_MODEL}</span>. Sees everything, unmasked, because nothing leaves the computer.
      </p>
    </article>
  );
}

export function Connections() {
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-bold tracking-tight">Connected AIs</h1>
        <span className="text-sm text-ink-2">Which AIs can use your library, and what each one sees.</span>
      </header>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <CloudCard />
        <LocalCard />
      </div>
      <p className="m-0 flex items-center gap-2 text-[13px] text-ink-2">
        <ShieldCheck aria-hidden className="size-4 text-private-ink" /> Coming next: connect Claude Desktop, ChatGPT and other apps to your library through MCP.
      </p>
    </div>
  );
}
