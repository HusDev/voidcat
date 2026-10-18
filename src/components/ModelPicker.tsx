import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Brain, Check, ChevronDown, Cloud, Cpu, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type AskModel, type LocalModel, alwaysThinks, canThink, setThinkFirst, thinkFirst } from "../lib/models";

const same = (a: AskModel | null, b: AskModel) => a?.provider === b.provider && a.id === b.id;

const option = "flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] data-focus:bg-ground data-disabled:cursor-not-allowed data-disabled:opacity-50";
const heading = "px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-ink-2";

/** Chooses who answers: a model on this Mac or the cloud model. Providers that aren't set up show as disabled. */
export function ModelPicker({
  value,
  onChange,
  local,
  cloudModel,
}: {
  value: AskModel | null;
  onChange: (m: AskModel) => void;
  /** Installed Ollama models; null when Ollama isn't running. */
  local: LocalModel[] | null;
  /** The chosen OpenRouter model, or null without a key. */
  cloudModel: string | null;
}) {
  if (value?.provider === "voidcat")
    return (
      <span
        title="Voidcat Cloud answers with Gemini in Belgium. Names, IDs, addresses and dates are hidden in this browser first."
        className="inline-flex items-center gap-1.5 rounded-full bg-ground px-2.5 py-1 font-mono text-[12px] text-ink-2"
      >
        <Cloud aria-hidden className="size-3.5 shrink-0" />
        {value.id} <span className="font-sans text-private-ink">masked</span>
      </span>
    );
  const none = !local?.length && !cloudModel;
  if (none)
    return (
      <Link to="/connections" className="inline-flex items-center gap-1.5 rounded-full bg-private-soft px-3 py-1 text-[12.5px] font-semibold text-private-ink hover:underline">
        <Plus aria-hidden className="size-3.5" /> Set up a model
      </Link>
    );

  return (
    <Listbox value={value} onChange={(m) => m && onChange(m)} by={(a, b) => !!a && !!b && a.provider === b.provider && a.id === b.id}>
      <ListboxButton className="inline-flex min-w-0 max-w-64 items-center gap-1.5 rounded-full bg-ground px-2.5 py-1 font-mono text-[12px] text-ink-2 hover:text-ink">
        {value?.provider === "local" ? <Cpu aria-hidden className="size-3.5 shrink-0" /> : <Cloud aria-hidden className="size-3.5 shrink-0" />}
        <span className="truncate">{value?.id ?? "Choose a model"}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0" />
      </ListboxButton>
      <ListboxOptions anchor="top start" className="z-30 mb-1 w-72 rounded-xl border border-line bg-card p-1.5 shadow-lg outline-none">
        <div className={heading}>On this Mac · Ollama</div>
        {local?.length ? (
          local.map((m) => {
            const v: AskModel = { provider: "local", id: m.id };
            return (
              <ListboxOption key={m.id} value={v} className={option}>
                <Cpu aria-hidden className="size-3.5 shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1 truncate font-mono">{m.id}</span>
                <span className="text-[11px] text-ink-2">{m.size}</span>
                {same(value, v) && <Check aria-hidden className="size-3.5 text-accent" />}
              </ListboxOption>
            );
          })
        ) : (
          <ListboxOption value={null} disabled className={option}>
            <Cpu aria-hidden className="size-3.5 shrink-0 text-ink-2" />
            <span className="flex-1">{local ? "No models installed" : "Ollama isn't running"} · add model provider</span>
          </ListboxOption>
        )}

        <div className={heading}>Cloud · OpenRouter</div>
        {cloudModel ? (
          <ListboxOption value={{ provider: "cloud", id: cloudModel }} className={option}>
            <Cloud aria-hidden className="size-3.5 shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1 truncate font-mono">{cloudModel}</span>
            <span className="text-[11px] text-private-ink">masked</span>
            {same(value, { provider: "cloud", id: cloudModel }) && <Check aria-hidden className="size-3.5 text-accent" />}
          </ListboxOption>
        ) : (
          <ListboxOption value={null} disabled className={option}>
            <Cloud aria-hidden className="size-3.5 shrink-0 text-ink-2" />
            <span className="flex-1">No key · add model provider</span>
          </ListboxOption>
        )}

        <Link to="/connections" className="mt-1 flex items-center gap-1.5 border-t border-line px-2.5 pb-1 pt-2 text-[12.5px] text-link hover:underline">
          <Plus aria-hidden className="size-3.5" /> {local?.length && cloudModel ? "Change models in Connected AIs" : "Add a model provider"}
        </Link>
      </ListboxOptions>
    </Listbox>
  );
}

/** "Think first" for a model on this Mac that can reason before answering; hidden for every other model. */
export function ThinkFirst({ model }: { model: AskModel | null }) {
  const [on, setOn] = useState(thinkFirst);
  const [can, setCan] = useState(false);
  useEffect(() => {
    setCan(false);
    if (model?.provider === "local") canThink(model.id).then(setCan);
  }, [model?.provider, model?.id]);
  if (!can) return null;
  if (model && alwaysThinks(model.id))
    return (
      <span title="This model reasons before every answer and can't be told not to; its reasoning shows in the box above the answer." className="inline-flex items-center gap-1.5 rounded-full bg-ground px-2.5 py-1 text-[12px] text-ink-2">
        <Brain aria-hidden className="size-3.5" />
        Always thinks
      </span>
    );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        setThinkFirst(!on);
        setOn(!on);
      }}
      title={on ? "Reasons before answering: better answers, slower start" : "Answers straight away: faster, less careful"}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ${on ? "bg-accent-soft text-ink" : "bg-ground text-ink-2 hover:text-ink"}`}
    >
      <Brain aria-hidden className="size-3.5" />
      Think first
      <span aria-hidden className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? "bg-accent" : "bg-line-strong"}`}>
        <span className={`absolute top-0.5 size-2.5 rounded-full bg-card transition-[left] ${on ? "left-3" : "left-0.5"}`} />
      </span>
    </button>
  );
}
