import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { Check, ChevronDown, Copy, Cpu, KeyRound, Plug, Plus, Unplug, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { type CloudModel, defaultModel, listModels, saveModel, savedModel } from "../lib/cloud";
import { type AiApp, type McpSetup, LIBRARY_CHANGED, connectApp, getSecret, hasLibrary, listAiApps, mcpSetup, removeAiApp, removeSecret, setAiAppLevel, setSecret } from "../lib/library";
import { LocalModelSetup } from "../components/LocalModelSetup";
import { LEVELS, type Level, appName } from "../lib/mcp";

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
            className="ml-auto h-8 rounded-md border border-line-strong px-2.5 text-[13px] hover:border-ink-2"
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
            className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong px-3 font-mono text-sm"
          />
          <button type="submit" disabled={!hasLibrary} className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40">
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
          <div className="flex h-10 items-center rounded-lg border border-line-strong bg-card focus-within:border-ink-2">
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
      {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
    </article>
  );
}

function LocalCard() {
  return (
    <article className={card}>
      <div className="flex items-center gap-2">
        <Cpu aria-hidden className="size-4.5 text-ink-2" />
        <span className="font-semibold">Local model</span>
      </div>
      <p className="m-0 text-[13px] text-ink-2">
        Reads your documents, files them and finds facts on this Mac. It sees everything, unmasked, because nothing leaves the computer.
      </p>
      <LocalModelSetup />
    </article>
  );
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const SETUP: { id: "claude-desktop" | "cursor"; name: string; key: "claudeDesktop" | "cursor"; restart: string }[] = [
  { id: "claude-desktop", name: "Claude Desktop", key: "claudeDesktop", restart: "Quit and reopen Claude Desktop to use it." },
  { id: "cursor", name: "Cursor", key: "cursor", restart: "Reload Cursor to use it." },
];

function McpCard() {
  const [apps, setApps] = useState<AiApp[]>([]);
  const [setup, setSetup] = useState<McpSetup | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    listAiApps().then(setApps);
    mcpSetup().then(setSetup);
  };
  useEffect(() => {
    refresh();
    // Apps show up here the first time they call Voidcat, which happens outside the app.
    window.addEventListener("focus", refresh);
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(LIBRARY_CHANGED, refresh);
    };
  }, []);

  const toggle = async (s: (typeof SETUP)[number], on: boolean) => {
    try {
      await connectApp(s.id, on);
      setNotice(on ? `Added to ${s.name}. ${s.restart} It starts with masked facts and dates only.` : `Removed from ${s.name}.`);
      refresh();
    } catch (err) {
      setNotice(String(err));
    }
  };

  const command = setup?.server ? `claude mcp add --scope user voidcat -- "${setup.server}"` : "";

  return (
    <article className={`${card} lg:col-span-2`}>
      <div className="flex items-center gap-2">
        <Workflow aria-hidden className="size-4.5 text-ink-2" />
        <span className="font-semibold">Other apps · MCP</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${apps.some((a) => a.level !== "off") ? "bg-ok-soft text-ok" : "bg-ground text-ink-2"}`}>
          {apps.filter((a) => a.level !== "off").length} {apps.filter((a) => a.level !== "off").length === 1 ? "app" : "apps"} allowed
        </span>
      </div>
      <p className="m-0 text-[13px] text-ink-2">
        Let Claude Desktop, Cursor, Claude Code and other apps use your library, with the same masking: they see placeholders, never your names, IDs, addresses or dates.
        You choose what each app may see. Nothing is sent anywhere until you use Voidcat from that app.
      </p>

      <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {apps.length === 0 && <p className="m-0 px-3.5 py-3 text-[13px] text-ink-2">No app has used Voidcat yet. Add it to an app below, then ask that app about your documents.</p>}
        {apps.map((a) => (
          <div key={a.name} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14px] font-semibold">{appName(a.name)}</span>
              <span className="text-[12px] text-ink-2">
                {a.lastUsed ? `Last used ${ago(a.lastUsed)} · ${a.calls} ${a.calls === 1 ? "request" : "requests"}` : "Not used yet"}
              </span>
            </span>
            <label htmlFor={`lvl-${a.name}`} className="sr-only">
              What {appName(a.name)} may see
            </label>
            <select
              id={`lvl-${a.name}`}
              value={a.level}
              onChange={async (e) => {
                await setAiAppLevel(a.name, e.currentTarget.value as Level);
                refresh();
              }}
              className={`h-8 rounded-md border px-2 text-[13px] ${a.level === "off" ? "border-line-strong text-ink-2" : "border-ok/40 bg-ok-soft text-ok"}`}
            >
              {(Object.keys(LEVELS) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVELS[l]}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Forget ${appName(a.name)}`}
              title="Forget this app (it comes back, with the basic level, if it calls again)"
              onClick={async () => {
                await removeAiApp(a.name);
                refresh();
              }}
              className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink"
            >
              <Unplug aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-ink-2">Add Voidcat to</span>
        <div className="flex flex-wrap gap-2">
          {SETUP.map((s) =>
            setup?.[s.key] ? (
              <button key={s.id} type="button" onClick={() => toggle(s, false)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ok/40 bg-ok-soft px-3 text-[13.5px] text-ok">
                <Check aria-hidden className="size-4" /> In {s.name} · remove
              </button>
            ) : (
              <button
                key={s.id}
                type="button"
                disabled={!setup?.server}
                onClick={() => toggle(s, true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[13.5px] hover:border-ink-2 disabled:opacity-40"
              >
                <Plus aria-hidden className="size-4" /> {s.name}
              </button>
            ),
          )}
          {command && (
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(command);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              title={command}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[13.5px] hover:border-ink-2"
            >
              {copied ? <Check aria-hidden className="size-4 text-ok" /> : <Copy aria-hidden className="size-4" />} {copied ? "Copied, paste it in Terminal" : "Claude Code command"}
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="m-0 text-[13px] text-ink-2">
            {notice}
          </p>
        )}
        {setup && !setup.server && hasLibrary && <p className="m-0 text-[13px] text-danger">The MCP server isn't built into this copy of Voidcat yet.</p>}
        <p className="m-0 text-[12.5px] text-ink-2">ChatGPT only connects to servers on the internet, and your library stays on this Mac, so it isn't supported yet.</p>
      </div>
    </article>
  );
}

export function Connections() {
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[30px] font-light tracking-tight">Connected AIs</h1>
        <span className="text-sm text-ink-2">Which AIs can use your library, and what each one sees.</span>
      </header>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <CloudCard />
        <LocalCard />
        <McpCard />
      </div>
    </div>
  );
}
