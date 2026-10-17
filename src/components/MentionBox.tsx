import { ArrowUp, AtSign, FileText, Folder as FolderIcon, Library, LoaderCircle, X } from "lucide-react";
import { type RefObject, useRef, useState } from "react";
import type { Mention } from "../lib/ask";
import type { Document, Folder } from "../lib/library";
import { Private } from "../lib/veil";

const MAX_OPTIONS = 9;
const ALL: Mention = { kind: "all", id: "all", label: "All documents" };

/** The "@word" being typed just before the caret, if any. */
function atToken(text: string, caret: number) {
  const m = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return m ? { query: m[2], start: caret - m[2].length - 1 } : null;
}

/** What "@query" can stand for: everything, then documents, folders and areas whose names match. */
export function mentionOptions(query: string, docs: Document[], folders: Folder[]): Mention[] {
  const q = query.toLowerCase();
  const hit = (s: string) => s.toLowerCase().includes(q);
  const areas = [...new Set(folders.map((f) => f.area))];
  return [
    ...("all".startsWith(q) || hit("everything") ? [ALL] : []),
    ...docs.filter((d) => hit(d.title)).map((d): Mention => ({ kind: "document", id: d.id, label: d.title })),
    ...folders.filter((f) => hit(`${f.area} ${f.name}`)).map((f): Mention => ({ kind: "folder", id: f.id, label: `${f.area} › ${f.name}` })),
    ...areas.filter(hit).map((a): Mention => ({ kind: "area", id: a, label: a })),
  ].slice(0, MAX_OPTIONS);
}

const icon = { all: Library, document: FileText, folder: FolderIcon, area: FolderIcon };

/**
 * The message box in Ask. Typing @ lists documents, folders and areas to narrow the question to; picks become chips.
 * @all (or no chips) means the whole library.
 */
export function MentionBox({
  value,
  onChange,
  mentions,
  onMentions,
  onSubmit,
  docs,
  folders,
  busy,
  disabled,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (text: string) => void;
  mentions: Mention[];
  onMentions: (m: Mention[]) => void;
  onSubmit: () => void;
  docs: Document[];
  folders: Folder[];
  busy: boolean;
  disabled: boolean;
  placeholder: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [token, setToken] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const caret = useRef(0);
  const options = token ? mentionOptions(token.query, docs, folders) : [];
  const open = options.length > 0;

  const look = (el: HTMLTextAreaElement) => {
    caret.current = el.selectionStart ?? el.value.length;
    setToken(atToken(el.value, caret.current));
    setActive(0);
  };

  const pick = (m: Mention) => {
    if (!token) return;
    // Take "@query" out of the text and keep the rest as typed.
    onChange((value.slice(0, token.start) + value.slice(caret.current)).replace(/\s{2,}/g, " "));
    // @all clears the narrower choices; a narrower choice replaces @all.
    onMentions(m.kind === "all" ? [ALL] : [...mentions.filter((x) => x.kind !== "all" && !(x.kind === m.kind && x.id === m.id)), m]);
    setToken(null);
    inputRef.current?.focus();
  };

  const narrowed = mentions.filter((m) => m.kind !== "all");
  return (
    <div className="relative flex flex-col gap-1.5">
      {open && (
        <ul
          id="mention-options"
          role="listbox"
          aria-label="Choose what to ask about"
          className="absolute bottom-full left-2 z-20 m-0 mb-2 flex w-96 max-w-[calc(100%-1rem)] list-none flex-col gap-0.5 rounded-xl border border-line bg-card p-1.5 shadow-lg"
        >
          {options.map((o, i) => {
            const Icon = icon[o.kind];
            return (
              <li key={`${o.kind}:${o.id}`} id={`mention-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // Keep the caret in the box: choose on mouse down, before the textarea loses focus.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] ${i === active ? "bg-accent-soft" : ""}`}
                >
                  <Icon aria-hidden className="size-3.5 shrink-0 text-ink-2" />
                  <span className="min-w-0 flex-1 truncate">{o.kind === "document" ? <Private>{o.label}</Private> : o.label}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-2">{{ all: "whole library", document: "document", folder: "folder", area: "area" }[o.kind]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-1.5 rounded-2xl border border-line-strong bg-card p-2 shadow-sm focus-within:border-ink-2"
      >
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
            {mentions.map((m) => (
              <span key={`${m.kind}:${m.id}`} className="inline-flex items-center gap-1 rounded-lg bg-accent-soft py-0.5 pl-2 pr-1 text-[13px]">
                <AtSign aria-hidden className="size-3 text-ink-2" />
                {m.kind === "document" ? <Private>{m.label}</Private> : m.label}
                <button
                  type="button"
                  onClick={() => onMentions(mentions.filter((x) => x !== m))}
                  aria-label={`Stop asking only about ${m.label}`}
                  className="grid size-5 place-items-center rounded text-ink-2 hover:bg-card hover:text-ink"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="ask-question" className="sr-only">
            Your question
          </label>
          <textarea
            id="ask-question"
            ref={inputRef}
            rows={1}
            value={value}
            role="combobox"
            aria-expanded={open}
            aria-controls="mention-options"
            aria-activedescendant={open ? `mention-${active}` : undefined}
            onChange={(ev) => {
              onChange(ev.currentTarget.value);
              look(ev.currentTarget);
            }}
            onClick={(ev) => look(ev.currentTarget)}
            onKeyDown={(ev) => {
              if (open) {
                if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
                  ev.preventDefault();
                  setActive((a) => (a + (ev.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
                  return;
                }
                if (ev.key === "Enter" || ev.key === "Tab") {
                  ev.preventDefault();
                  pick(options[active]);
                  return;
                }
                if (ev.key === "Escape") {
                  ev.preventDefault();
                  setToken(null);
                  return;
                }
              }
              // Backspace in an empty box takes off the last chip.
              if (ev.key === "Backspace" && !value && mentions.length) onMentions(mentions.slice(0, -1));
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                onSubmit();
              }
            }}
            placeholder={placeholder}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] outline-none [field-sizing:content]"
          />
          <button
            type="submit"
            disabled={!value.trim() || busy || disabled}
            aria-label="Ask"
            className="grid size-10 place-items-center rounded-xl bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-30"
          >
            {busy ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : <ArrowUp aria-hidden className="size-5" />}
          </button>
        </div>
      </form>
      <p className="m-0 px-1 text-[12px] text-ink-2">
        {narrowed.length
          ? `Answers only from ${narrowed.length === 1 ? "this" : `these ${narrowed.length}`}. Remove the chips to ask the whole library.`
          : "Type @ to ask about one document or folder, or @all for the whole library. Answers can be wrong; check the sources."}
      </p>
    </div>
  );
}
