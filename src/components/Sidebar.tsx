import { CalendarDays, Check, ChevronRight, Cloud, CloudCheck, Pencil, Eye, EyeOff, FileText, Folder as FolderIcon, FolderOpen, Inbox, Library, Lightbulb, Link2, LockKeyhole, MessageSquareText, Settings, UserRound, Contact } from "lucide-react";
import { type DragEvent, type MouseEvent, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { AREAS } from "../lib/extract";
import {
  DRAG_DOCUMENT,
  DRAG_FOLDER,
  type Document,
  type Folder,
  LIBRARY_CHANGED,
  announceChange,
  dragDocument,
  fileInFolder,
  listDocuments,
  listFolders,
  moveFolder,
  openDocument,
  renameDocument,
  renameFolder,
} from "../lib/library";
import { Private, useVeil } from "../lib/veil";
import { keepInCloud } from "../cloud/mac";
import { Logo } from "./Logo";
import { CloudRowMark, CloudStatusButton, useCloudMark } from "./CloudMark";
import { RenameInput } from "./RenameInput";

const link = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-2.5 whitespace-nowrap rounded-lg py-1.5 pl-2 pr-3 text-[13.5px] no-underline ${isActive ? "bg-rail-2 font-semibold text-white" : "text-rail-mute hover:text-white"}`;

const TREE_KEY = "voidcat.tree";

function loadOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(TREE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

/** Folders grouped by area, as a tree like Finder's: areas and folders open and close, an open folder lists its documents.
 * Drop a document on a folder to move it there; drag a folder onto an area to move it (and its documents) to that area. */
function Folders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  // Keys "area:<name>" (closed areas) and "folder:<id>" (open folders).
  const [open, setOpen] = useState(loadOpen);
  /** The folder being dragged: every area shows as a place to drop it, empty ones too. */
  const [draggedFolder, setDraggedFolder] = useState<string | null>(null);
  /** The drop target under the pointer ("folder:<id>" or "area:<name>"). */
  const [over, setOver] = useState<string | null>(null);
  /** The name being edited in place ("folder:<id>" or "doc:<id>"). */
  const [renaming, setRenaming] = useState<string | null>(null);
  /** The right-click menu: where it opened and for what. */
  const [menu, setMenu] = useState<{ x: number; y: number; key: string } | null>(null);

  // A right-click menu closes on a click elsewhere, Escape, or scrolling.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);
  const openMenu = (e: MouseEvent, key: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, key });
  };
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = pathname === "/" ? params.get("folder") : null;

  // Reload on any change in the app, on every screen change, and when the window comes back to the front.
  useEffect(() => {
    const refresh = () => {
      listFolders().then(setFolders);
      listDocuments().then(setDocuments);
    };
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(LIBRARY_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [pathname, params]);

  const toggle = (key: string, on?: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (on ?? !next.has(key)) next.add(key);
      else next.delete(key);
      try {
        localStorage.setItem(TREE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  /** Props that make an element a drop target for one kind of thing. */
  const target = (key: string, kind: string, drop: (id: string) => Promise<void>) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(kind)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(key);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === key ? null : o));
    },
    onDrop: async (e: DragEvent) => {
      const id = e.dataTransfer.getData(kind);
      setOver(null);
      setDraggedFolder(null);
      if (!id) return;
      e.preventDefault();
      await drop(id);
      announceChange();
    },
  });

  if (!folders.length) return null;
  const used = [...new Set(folders.map((f) => f.area))];
  // While a folder is dragged, every area is a place to put it.
  const areas = draggedFolder ? [...used, ...AREAS.filter((a) => !used.some((u) => u.toLowerCase() === a.toLowerCase()))] : used;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto border-t border-white/5 pt-3">
      <span className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-rail-faint">Folders</span>
      {areas.map((area) => {
        const areaOpen = !open.has(`area:${area}`);
        const inArea = folders.filter((f) => f.area === area);
        return (
          <div key={area} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggle(`area:${area}`)}
              aria-expanded={areaOpen}
              {...target(`area:${area}`, DRAG_FOLDER, async (id) => {
                const into = await moveFolder(id, area);
                if (current === id && into !== id) navigate(`/?folder=${into}`, { replace: true });
              })}
              className={`flex items-center gap-1 rounded-md px-1.5 pb-0.5 pt-1.5 text-left text-[12px] font-semibold hover:text-white ${
                over === `area:${area}` ? "bg-void/30 text-white ring-1 ring-void" : draggedFolder && !inArea.length ? "border border-dashed border-rail-faint text-rail-faint" : "text-rail-mute"
              }`}
            >
              <ChevronRight aria-hidden className={`size-3.5 shrink-0 transition-transform ${areaOpen ? "rotate-90" : ""}`} />
              {area}
            </button>
            {areaOpen &&
              inArea.map((f) => {
                const folderOpen = open.has(`folder:${f.id}`);
                const docs = documents.filter((d) => d.folderId === f.id);
                return (
                  <div key={f.id} className="flex flex-col">
                    <div
                      {...target(`folder:${f.id}`, DRAG_DOCUMENT, async (id) => {
                        if (documents.find((d) => d.id === id)?.folderId === f.id) return;
                        await fileInFolder(id, f.area, f.name);
                        toggle(`folder:${f.id}`, true);
                      })}
                      className={`group flex items-center rounded-md pl-3 pr-2 text-[13.5px] ${
                        over === `folder:${f.id}` ? "bg-void/30 text-white ring-1 ring-void" : current === f.id ? "bg-rail-2 text-white" : "text-rail-text hover:text-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(`folder:${f.id}`)}
                        aria-expanded={folderOpen}
                        aria-label={folderOpen ? "Close folder" : "Open folder"}
                        className="grid size-5 shrink-0 place-items-center rounded text-rail-faint hover:text-white"
                      >
                        <ChevronRight aria-hidden className={`size-3.5 transition-transform ${folderOpen ? "rotate-90" : ""}`} />
                      </button>
                      {renaming === `folder:${f.id}` ? (
                        <span className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-0.5">
                          <FolderIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
                          <RenameInput
                            id={`rename-folder-${f.id}`}
                            value={f.name}
                            label="Folder name"
                            className="text-[13.5px] text-white"
                            onSave={async (name) => {
                              await renameFolder(f.id, name);
                              announceChange();
                            }}
                            onDone={() => setRenaming(null)}
                          />
                        </span>
                      ) : (
                      <Link
                        to={`/?folder=${f.id}`}
                        onClick={() => toggle(`folder:${f.id}`, true)}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          setRenaming(`folder:${f.id}`);
                        }}
                        onContextMenu={(e) => openMenu(e, `folder:${f.id}`)}
                        title="Double-click to rename"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DRAG_FOLDER, f.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedFolder(f.id);
                        }}
                        onDragEnd={() => {
                          setDraggedFolder(null);
                          setOver(null);
                        }}
                        aria-current={current === f.id ? "page" : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-0.5 text-inherit no-underline"
                      >
                        {folderOpen ? <FolderOpen aria-hidden className="size-3.5 shrink-0 opacity-70" /> : <FolderIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />}
                        <span className="min-w-0 flex-1 truncate">
                          <Private>{f.name}</Private>
                        </span>
                        <span className="text-xs tabular-nums text-rail-faint group-hover:hidden group-focus-within:hidden">{f.documents}</span>
                      </Link>
                      )}
                      {renaming !== `folder:${f.id}` && (
                        <RenamePencil label={`Rename ${f.name}`} onClick={() => setRenaming(`folder:${f.id}`)} />
                      )}
                    </div>
                    {folderOpen &&
                      docs.map((d) =>
                        renaming === `doc:${d.id}` ? (
                          <span key={d.id} className="flex items-center gap-2 py-1 pl-11 pr-2">
                            <FileText aria-hidden className="size-3.5 shrink-0 text-rail-mute opacity-70" />
                            <RenameInput
                              id={`rename-doc-${d.id}`}
                              value={d.title}
                              label="Document name"
                              className="text-[12.5px] text-white"
                              onSave={async (title) => {
                                await renameDocument(d.id, title);
                                announceChange();
                              }}
                              onDone={() => setRenaming(null)}
                            />
                          </span>
                        ) : (
                          <div key={d.id} className="group flex items-center rounded-md pr-2 text-rail-mute hover:bg-rail-2 hover:text-white">
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => dragDocument(e, d.id)}
                              onClick={() => openDocument(d.id)}
                              onContextMenu={(e) => openMenu(e, `doc:${d.id}`)}
                              title={`Open ${d.fileName}`}
                              className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-11 text-left text-[12.5px] text-inherit"
                            >
                              <FileText aria-hidden className="size-3.5 shrink-0 opacity-70" />
                              <span className="min-w-0 flex-1 truncate">
                                <Private>{d.title}</Private>
                              </span>
                              <CloudRowMark id={d.id} />
                            </button>
                            <RenamePencil label={`Rename ${d.title}`} onClick={() => setRenaming(`doc:${d.id}`)} />
                          </div>
                        ),
                      )}
                    {folderOpen && !docs.length && <span className="py-1 pl-11 text-[12px] text-rail-faint">Empty</span>}
                  </div>
                );
              })}
          </div>
        );
      })}
      {menu && <TreeMenu menu={menu} folders={folders} documents={documents} onRename={setRenaming} onClose={() => setMenu(null)} />}
    </div>
  );
}

const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-rail-text hover:bg-rail-2 hover:text-white";

/** The pencil on a tree row: shows on hover or keyboard focus, and turns the name into a field in place. */
function RenamePencil({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Rename"
      className="grid size-5 shrink-0 place-items-center rounded text-rail-faint opacity-0 hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Pencil aria-hidden className="size-3" />
    </button>
  );
}

/** "Keep in the cloud" with a tick, once this Mac syncs; off keeps the document only on this Mac. */
function KeepInCloudItem({ id, onDone }: { id: string; onDone: () => void }) {
  const mark = useCloudMark(id);
  if (!mark) return null;
  const on = mark !== "local";
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={() => {
        onDone();
        keepInCloud(id, !on);
      }}
      className={item}
    >
      {on ? <CloudCheck aria-hidden className="size-3.5" /> : <Cloud aria-hidden className="size-3.5" />}
      <span className="flex-1">Keep in the cloud</span>
      {on && <Check aria-hidden className="size-3.5" />}
    </button>
  );
}

/** What you can do to a folder or a document in the tree, opened with a right-click. */
function TreeMenu({
  menu,
  folders,
  documents,
  onRename,
  onClose,
}: {
  menu: { x: number; y: number; key: string };
  folders: Folder[];
  documents: Document[];
  onRename: (key: string) => void;
  onClose: () => void;
}) {
  const [kind, id] = menu.key.split(/:(.*)/s);
  const doc = kind === "doc" ? documents.find((d) => d.id === id) : undefined;
  const run = (action: () => unknown) => () => {
    onClose();
    action();
  };
  return (
    <div
      role="menu"
      aria-label={doc ? "Document" : "Folder"}
      // Clicks inside the menu must not count as "clicked elsewhere".
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: Math.min(menu.x, window.innerWidth - 248), top: Math.min(menu.y, window.innerHeight - 320) }}
      className="fixed z-50 flex w-60 flex-col rounded-lg border border-white/10 bg-rail-3 p-1 shadow-xl"
    >
      {doc ? (
        <>
          <button type="button" role="menuitem" onClick={run(() => openDocument(doc.id))} className={item}>
            <FileText aria-hidden className="size-3.5" /> Open
          </button>
          <button type="button" role="menuitem" onClick={run(() => onRename(menu.key))} className={item}>
            <Pencil aria-hidden className="size-3.5" /> Rename
          </button>
          <KeepInCloudItem id={doc.id} onDone={onClose} />
          <span className="mt-1 border-t border-white/10 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-rail-faint">Move to</span>
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {folders
              .filter((f) => f.id !== doc.folderId)
              .map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="menuitem"
                  onClick={run(async () => {
                    await fileInFolder(doc.id, f.area, f.name);
                    announceChange();
                  })}
                  className={item}
                >
                  <FolderIcon aria-hidden className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    {f.area} › <Private>{f.name}</Private>
                  </span>
                </button>
              ))}
          </div>
        </>
      ) : (
        <>
          <button type="button" role="menuitem" onClick={run(() => onRename(menu.key))} className={item}>
            <Pencil aria-hidden className="size-3.5" /> Rename
          </button>
          <span className="px-2.5 py-1 text-[11.5px] text-rail-faint">Drag the folder onto an area to move it.</span>
        </>
      )}
    </div>
  );
}

export function Sidebar({ pending, toFile, soon }: { pending: number; toFile: number; soon: number }) {
  const veil = useVeil();
  return (
    <nav aria-label="Voidcat" className="flex w-62 shrink-0 flex-col gap-3.5 border-r border-white/5 bg-rail px-3 pb-3 pt-11 text-rail-ink">
      <div data-tauri-drag-region className="flex items-center gap-2.5 px-2">
        <Logo />
        <span className="font-display text-[21px] font-light tracking-tight">Voidcat</span>
      </div>

      <div className="flex flex-col gap-px">
        <NavLink to="/" end className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-eye group-aria-[current=page]:shadow-[0_0_8px_rgb(245_184_61/0.8)]" />
          <Library aria-hidden className="size-4" /> Library
          {toFile > 0 && (
            <span title={`${toFile} to file`} className="ml-auto rounded-full bg-void/25 px-2 text-xs font-bold text-rail-ink">
              {toFile}
            </span>
          )}
        </NavLink>
        <NavLink to="/me" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-eye group-aria-[current=page]:shadow-[0_0_8px_rgb(245_184_61/0.8)]" />
          <UserRound aria-hidden className="size-4" /> Me
        </NavLink>
        <NavLink to="/contacts" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-eye group-aria-[current=page]:shadow-[0_0_8px_rgb(245_184_61/0.8)]" />
          <Contact aria-hidden className="size-4" /> Contacts
        </NavLink>
        <NavLink to="/ask" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-eye group-aria-[current=page]:shadow-[0_0_8px_rgb(245_184_61/0.8)]" />
          <MessageSquareText aria-hidden className="size-4" /> Ask
        </NavLink>
        <NavLink to="/calendar" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-eye group-aria-[current=page]:shadow-[0_0_8px_rgb(245_184_61/0.8)]" />
          <CalendarDays aria-hidden className="size-4" /> Calendar
          {soon > 0 && (
            <span title={`${soon} in the next 2 weeks`} className="ml-auto rounded-full bg-danger px-2 text-xs font-bold text-white">
              {soon}
            </span>
          )}
        </NavLink>
        <NavLink to="/opportunities" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-eye group-aria-[current=page]:shadow-[0_0_8px_rgb(245_184_61/0.8)]" />
          <Lightbulb aria-hidden className="size-4" /> Opportunities
        </NavLink>
        <NavLink to="/inbox" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-eye group-aria-[current=page]:shadow-[0_0_8px_rgb(245_184_61/0.8)]" />
          <Inbox aria-hidden className="size-4" /> Facts to approve
          {pending > 0 && <span className="ml-auto rounded-full bg-private px-2 text-xs font-bold text-[#0b0b0f]">{pending}</span>}
        </NavLink>
        <NavLink to="/connections" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-eye group-aria-[current=page]:shadow-[0_0_8px_rgb(245_184_61/0.8)]" />
          <Link2 aria-hidden className="size-4" /> Connected AIs
        </NavLink>
      </div>

      {/* The folders take whatever room is left, and scroll. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Folders />
      </div>

      <CloudStatusButton />
      <div className="flex items-center gap-1 border-t border-white/5 pt-2.5">
        <span title="Your documents and everything Voidcat learned from them are encrypted, with the key in this Mac's Keychain." className="flex min-w-0 flex-1 items-center gap-1.5 pl-2 text-[12px] text-rail-faint">
          <LockKeyhole aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">Encrypted</span>
        </span>
        <button
          type="button"
          onClick={veil.toggle}
          aria-pressed={veil.on}
          aria-label={veil.on ? "Show private details" : "Hide private details"}
          title={`${veil.on ? "Show" : "Hide"} private details (⌘⇧H)`}
          className={`grid size-8.5 shrink-0 place-items-center rounded-lg ${veil.on ? "bg-private text-[#0b0b0f]" : "text-rail-mute hover:bg-rail-2 hover:text-white"}`}
        >
          {veil.on ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
        </button>
        <NavLink
          to="/settings"
          aria-label="Settings"
          title="Settings"
          className={({ isActive }) => `grid size-8.5 shrink-0 place-items-center rounded-lg ${isActive ? "bg-rail-2 text-white" : "text-rail-mute hover:bg-rail-2 hover:text-white"}`}
        >
          <Settings aria-hidden className="size-4.5" />
        </NavLink>
      </div>
    </nav>
  );
}
