import {
  CalendarDays,
  Contact,
  FileImage,
  FileText,
  Inbox,
  Library,
  Lightbulb,
  Link2,
  type LucideIcon,
  MessageSquarePlus,
  MessageSquareText,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router";
import { type Tab, useTabs } from "../lib/tabs";
import { Private } from "../lib/veil";

const SCREENS: Record<string, [string, LucideIcon]> = {
  "/": ["Library", Library],
  "/me": ["Me", UserRound],
  "/contacts": ["Contacts", Contact],
  "/calendar": ["Calendar", CalendarDays],
  "/opportunities": ["Opportunities", Lightbulb],
  "/inbox": ["Facts to approve", Inbox],
  "/connections": ["Connected AIs", Link2],
  "/settings": ["Settings", Settings],
};

/** The row of tabs above the screen, like an editor's: one per screen, chat and document. */
export function DocumentTabs() {
  const { tabs, active, documents, chats, close } = useTabs();
  const navigate = useNavigate();

  const describe = (t: Tab): { title: string; Icon: LucideIcon; personal: boolean; hint?: string } => {
    if (t.key.startsWith("/doc/")) {
      const doc = documents.get(decodeURIComponent(t.key.slice(5)));
      return { title: doc?.title ?? "Document", Icon: doc?.mime?.startsWith("image/") ? FileImage : FileText, personal: true, hint: doc?.fileName };
    }
    if (t.key === "/ask") {
      // One Ask tab, titled after the chat it shows.
      const chat = chats.get(new URLSearchParams(t.url.split("?")[1] ?? "").get("chat") ?? "");
      return chat ? { title: chat.title, Icon: MessageSquareText, personal: true } : { title: "Ask", Icon: MessageSquarePlus, personal: false };
    }
    const [title, Icon] = SCREENS[t.key] ?? ["Voidcat", Library];
    return { title, Icon, personal: false };
  };

  return (
    <div role="tablist" aria-label="Open tabs" className="flex shrink-0 overflow-x-auto border-b border-line px-8">
      {tabs.map((t) => {
        const { title, Icon, personal, hint } = describe(t);
        const on = t.key === active;
        return (
          <div
            key={t.key}
            role="tab"
            aria-selected={on}
            tabIndex={0}
            onClick={() => navigate(t.url)}
            onKeyDown={(e) => e.key === "Enter" && navigate(t.url)}
            // Middle click closes, as in an editor.
            onAuxClick={(e) => e.button === 1 && close(t.key)}
            title={hint ?? title}
            className={`group relative -mb-px flex max-w-52 shrink-0 cursor-default items-center gap-2 border-x border-t py-2 pl-3 pr-1.5 text-[13px] ${
              on ? "rounded-t-lg border-line bg-card text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {on && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 rounded-t-lg bg-accent" />}
            <Icon aria-hidden className="size-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">{personal ? <Private>{title}</Private> : title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close(t.key);
              }}
              aria-label={`Close ${personal ? "tab" : title}`}
              title="Close (⌘W)"
              className={`grid size-5 shrink-0 place-items-center rounded hover:bg-ground ${on ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
