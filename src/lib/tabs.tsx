import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { CHATS_CHANGED, type Chat, type Document, LIBRARY_CHANGED, OPEN_DOCUMENT, listChats, listDocuments } from "./library";

/**
 * Every screen you open gets a tab, like an editor: each document, each chat, and screens such as Library or Calendar.
 * Going to a screen that already has a tab switches to it. The open tabs are remembered on this Mac.
 */

const KEY = "voidcat.tabs";

/** `key` names the tab; `url` is where it was last (a Library tab remembers its folder). */
export type Tab = { key: string; url: string };

type Tabs = {
  tabs: Tab[];
  active: string;
  documents: Map<string, Document>;
  chats: Map<string, Chat>;
  close: (key: string) => void;
};

const TabsContext = createContext<Tabs | null>(null);

/** One tab per document; one per screen otherwise (Ask is one tab, whichever chat it shows). */
export const tabKey = (pathname: string) => pathname;

/** The tabs after going to `tab` from the tab `from`: switch to it, rename `from` (replace), or open it next to `from`. */
export function visit(prev: Tab[], tab: Tab, from: string | null, replace: boolean): Tab[] {
  const at = prev.findIndex((t) => t.key === tab.key);
  if (at >= 0) return prev.map((t, i) => (i === at ? tab : t));
  const was = from ? prev.findIndex((t) => t.key === from) : -1;
  if (replace && was >= 0) return prev.map((t, i) => (i === was ? tab : t));
  return was >= 0 ? [...prev.slice(0, was + 1), tab, ...prev.slice(was + 1)] : [...prev, tab];
}

function load(): Tab[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    // Earlier versions kept only document ids, then gave each chat its own tab: keys are worked out again, one tab each.
    const tabs = saved.flatMap((t): Tab[] =>
      typeof t === "string" ? [{ key: `/doc/${t}`, url: `/doc/${encodeURIComponent(t)}` }] : t && typeof t.url === "string" ? [{ key: tabKey(t.url.split("?")[0]), url: t.url }] : [],
    );
    return tabs.filter((t, i) => tabs.findIndex((x) => x.key === t.key) === i);
  } catch {
    return [];
  }
}

function save(tabs: Tab[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {}
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState(load);
  const [documents, setDocuments] = useState(new Map<string, Document>());
  const [chats, setChats] = useState(new Map<string, Chat>());
  const navigate = useNavigate();
  const navigation = useNavigationType();
  const { pathname, search } = useLocation();
  const active = tabKey(pathname);
  const previous = useRef<string | null>(null);

  const update = useCallback((next: (prev: Tab[]) => Tab[]) => {
    setTabs((prev) => {
      const tabs = next(prev);
      save(tabs);
      return tabs;
    });
  }, []);

  // Every place you go has a tab: switch to it, or open one next to the tab you came from.
  // A replaced address (a new chat getting its id) renames the tab you were on instead.
  useEffect(() => {
    const tab = { key: active, url: pathname + search };
    const from = previous.current;
    previous.current = active;
    update((prev) => visit(prev, tab, from, navigation === "REPLACE"));
  }, [active, pathname, search, navigation, update]);

  // Titles come from the library; tabs of removed documents and deleted chats close.
  useEffect(() => {
    const refresh = async () => {
      const [docs, chatList] = await Promise.all([listDocuments(), listChats()]);
      const docMap = new Map(docs.map((d) => [d.id, d]));
      const chatMap = new Map(chatList.map((c) => [c.id, c]));
      setDocuments(docMap);
      setChats(chatMap);
      update((prev) =>
        prev.filter((t) => {
          if (t.key === active) return true;
          if (t.key.startsWith("/doc/")) return docMap.has(decodeURIComponent(t.key.slice(5)));
          return true;
        }),
      );
    };
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    window.addEventListener(CHATS_CHANGED, refresh);
    return () => {
      window.removeEventListener(LIBRARY_CHANGED, refresh);
      window.removeEventListener(CHATS_CHANGED, refresh);
    };
  }, [update, active]);

  useEffect(() => {
    const open = (e: Event) => navigate(`/doc/${encodeURIComponent((e as CustomEvent<string>).detail)}`);
    window.addEventListener(OPEN_DOCUMENT, open);
    return () => window.removeEventListener(OPEN_DOCUMENT, open);
  }, [navigate]);

  const close = useCallback(
    (key: string) => {
      const at = tabs.findIndex((t) => t.key === key);
      const rest = tabs.filter((t) => t.key !== key);
      update(() => rest);
      // Closing the tab on screen shows its neighbour, like an editor; with none left, the Library.
      if (key === active) navigate(rest[Math.min(at, rest.length - 1)]?.url ?? "/");
    },
    [tabs, active, navigate, update],
  );

  // ⌘W closes the tab on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        close(active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  return <TabsContext.Provider value={{ tabs, active, documents, chats, close }}>{children}</TabsContext.Provider>;
}

export function useTabs() {
  const tabs = useContext(TabsContext);
  if (!tabs) throw new Error("useTabs needs TabsProvider");
  return tabs;
}
