import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Chat } from "../lib/library";
import { Private } from "../lib/veil";

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Earlier conversations in Ask: open one, start a new one, or delete one (with a second click to confirm). */
export function ChatHistory({ chats, current, onNew, onDelete }: { chats: Chat[]; current: string | null; onNew: () => void; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <aside aria-label="Chats" className="flex w-60 shrink-0 flex-col gap-3 border-r border-line pr-4">
      <button
        type="button"
        onClick={onNew}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-card text-[13.5px] font-semibold hover:border-ink-2"
      >
        <Plus aria-hidden className="size-4" /> New chat
      </button>
      <span className="px-1 text-[11px] font-semibold uppercase tracking-widest text-ink-2">History</span>
      {chats.length === 0 ? (
        <p className="m-0 px-1 text-[12.5px] text-ink-2">Your chats appear here after the first answer.</p>
      ) : (
        <ul className="m-0 flex min-h-0 list-none flex-col gap-0.5 overflow-y-auto p-0">
          {chats.map((c) => (
            <li key={c.id} className="group relative">
              {confirming === c.id ? (
                <div className="flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-2 text-[12.5px]">
                  <span className="flex-1 text-danger">Delete this chat?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      onDelete(c.id);
                    }}
                    className="rounded-md bg-danger px-2 py-0.5 font-semibold text-white"
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="px-1 text-ink-2 hover:text-ink">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <Link
                    to={`/ask?chat=${encodeURIComponent(c.id)}`}
                    aria-current={current === c.id ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-9 text-[13px] no-underline ${current === c.id ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-card hover:text-ink"}`}
                  >
                    <MessageSquareText aria-hidden className="size-3.5 shrink-0 opacity-70" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">
                        <Private>{c.title}</Private>
                      </span>
                      <span className="text-[11px] text-ink-2">{when(c.updatedAt)}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirming(c.id)}
                    aria-label="Delete chat"
                    title="Delete chat"
                    className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-2 opacity-0 hover:bg-danger-soft hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
