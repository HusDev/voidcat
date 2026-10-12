import { Eye, EyeOff, Folder as FolderIcon, Inbox, Library, Link2, MessageSquareText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useSearchParams } from "react-router";
import { type Folder, LIBRARY_CHANGED, listFolders } from "../lib/library";
import { Private, useVeil } from "../lib/veil";
import { Logo } from "./Logo";

const link = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm no-underline ${isActive ? "bg-rail-2 font-semibold text-white" : "text-rail-mute hover:text-white"}`;

/** Folders grouped by area, as a two-level tree. */
function Folders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const current = pathname === "/" ? params.get("folder") : null;

  // Reload on any change in the app, on every screen change, and when the window comes back to the front.
  useEffect(() => {
    const refresh = () => listFolders().then(setFolders);
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(LIBRARY_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [pathname, params]);

  if (!folders.length) return null;
  const areas = [...new Set(folders.map((f) => f.area))];
  return (
    <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
      <span className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#7d8792]">Folders</span>
      {areas.map((area) => (
        <div key={area} className="flex flex-col">
          <span className="px-3 pb-0.5 pt-1.5 text-[12px] font-semibold text-[#9aa3ad]">{area}</span>
          {folders
            .filter((f) => f.area === area)
            .map((f) => (
              <Link
                key={f.id}
                to={`/?folder=${f.id}`}
                aria-current={current === f.id ? "page" : undefined}
                className={`flex items-center gap-2 rounded-md py-1.5 pl-5 pr-2 text-[13.5px] no-underline ${current === f.id ? "bg-rail-2 text-white" : "text-[#d3d9df] hover:text-white"}`}
              >
                <FolderIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">
                  <Private>{f.name}</Private>
                </span>
                <span className="text-xs tabular-nums text-[#7d8792]">{f.documents}</span>
              </Link>
            ))}
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ pending, toFile }: { pending: number; toFile: number }) {
  const veil = useVeil();
  return (
    <nav aria-label="SafeBox" className="flex w-58 shrink-0 flex-col gap-6 bg-rail px-4 pb-5 pt-11 text-rail-ink">
      <div data-tauri-drag-region className="flex items-center gap-2.5 px-2">
        <Logo />
        <span className="text-lg font-bold tracking-tight">SafeBox</span>
      </div>

      <div className="flex flex-col gap-1">
        <NavLink to="/" end className={link}>
          <Library aria-hidden className="size-4.5" /> Library
          {toFile > 0 && (
            <span title={`${toFile} to file`} className="ml-auto rounded-full bg-[#e3eef2] px-2 text-xs font-bold text-link">
              {toFile}
            </span>
          )}
        </NavLink>
        <NavLink to="/ask" className={link}>
          <MessageSquareText aria-hidden className="size-4.5" /> Ask
        </NavLink>
        <NavLink to="/inbox" className={link}>
          <Inbox aria-hidden className="size-4.5" /> Facts to approve
          {pending > 0 && <span className="ml-auto rounded-full bg-private px-2 text-xs font-bold text-ink">{pending}</span>}
        </NavLink>
        <NavLink to="/connections" className={link}>
          <Link2 aria-hidden className="size-4.5" /> Connected AIs
        </NavLink>
      </div>

      <Folders />

      <button
        type="button"
        onClick={veil.toggle}
        aria-pressed={veil.on}
        title="Hide private details (⌘⇧H)"
        className={`mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm ${veil.on ? "bg-private font-semibold text-ink" : "text-rail-mute hover:bg-rail-2 hover:text-white"}`}
      >
        {veil.on ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
        <span className="flex-1">{veil.on ? "Private details hidden" : "Hide private details"}</span>
        <kbd className={`font-sans text-[11px] ${veil.on ? "text-ink/70" : "text-[#7d8792]"}`}>⌘⇧H</kbd>
      </button>

      <div className="flex items-center gap-2 rounded-lg bg-rail-3 p-3 text-[12.5px] text-rail-mute">
        <ShieldCheck aria-hidden className="size-4 text-private" />
        Stored only on this Mac
      </div>
    </nav>
  );
}
