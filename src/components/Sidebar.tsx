import { CalendarDays, Eye, EyeOff, Folder as FolderIcon, Inbox, Library, Lightbulb, Link2, MessageSquareText, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useSearchParams } from "react-router";
import { type Folder, LIBRARY_CHANGED, listFolders } from "../lib/library";
import { Private, useVeil } from "../lib/veil";
import { Logo } from "./Logo";

const link = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-2.5 whitespace-nowrap rounded-lg py-2.5 pl-2 pr-3 text-sm no-underline ${isActive ? "bg-rail-2 font-semibold text-white" : "text-rail-mute hover:text-white"}`;

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
      <span className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-rail-faint">Folders</span>
      {areas.map((area) => (
        <div key={area} className="flex flex-col">
          <span className="px-3 pb-0.5 pt-1.5 text-[12px] font-semibold text-rail-mute">{area}</span>
          {folders
            .filter((f) => f.area === area)
            .map((f) => (
              <Link
                key={f.id}
                to={`/?folder=${f.id}`}
                aria-current={current === f.id ? "page" : undefined}
                className={`flex items-center gap-2 rounded-md py-1.5 pl-5 pr-2 text-[13.5px] no-underline ${current === f.id ? "bg-rail-2 text-white" : "text-rail-text hover:text-white"}`}
              >
                <FolderIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">
                  <Private>{f.name}</Private>
                </span>
                <span className="text-xs tabular-nums text-rail-faint">{f.documents}</span>
              </Link>
            ))}
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ pending, toFile, soon }: { pending: number; toFile: number; soon: number }) {
  const veil = useVeil();
  return (
    <nav aria-label="Voidcat" className="flex w-62 shrink-0 flex-col gap-6 border-r border-white/5 bg-rail px-4 pb-5 pt-11 text-rail-ink">
      <div data-tauri-drag-region className="flex items-center gap-2.5 px-2">
        <Logo />
        <span className="font-display text-[21px] font-light tracking-tight">Voidcat</span>
      </div>

      <div className="flex flex-col gap-1">
        <NavLink to="/" end className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-void group-aria-[current=page]:shadow-[0_0_8px_rgb(139_92_246/0.9)]" />
          <Library aria-hidden className="size-4.5" /> Library
          {toFile > 0 && (
            <span title={`${toFile} to file`} className="ml-auto rounded-full bg-void/25 px-2 text-xs font-bold text-rail-ink">
              {toFile}
            </span>
          )}
        </NavLink>
        <NavLink to="/ask" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-void group-aria-[current=page]:shadow-[0_0_8px_rgb(139_92_246/0.9)]" />
          <MessageSquareText aria-hidden className="size-4.5" /> Ask
        </NavLink>
        <NavLink to="/calendar" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-void group-aria-[current=page]:shadow-[0_0_8px_rgb(139_92_246/0.9)]" />
          <CalendarDays aria-hidden className="size-4.5" /> Calendar
          {soon > 0 && (
            <span title={`${soon} in the next 2 weeks`} className="ml-auto rounded-full bg-danger px-2 text-xs font-bold text-white">
              {soon}
            </span>
          )}
        </NavLink>
        <NavLink to="/opportunities" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-void group-aria-[current=page]:shadow-[0_0_8px_rgb(139_92_246/0.9)]" />
          <Lightbulb aria-hidden className="size-4.5" /> Opportunities
        </NavLink>
        <NavLink to="/inbox" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-void group-aria-[current=page]:shadow-[0_0_8px_rgb(139_92_246/0.9)]" />
          <Inbox aria-hidden className="size-4.5" /> Facts to approve
          {pending > 0 && <span className="ml-auto rounded-full bg-private px-2 text-xs font-bold text-[#0b0b0f]">{pending}</span>}
        </NavLink>
        <NavLink to="/connections" className={link}>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-void group-aria-[current=page]:shadow-[0_0_8px_rgb(139_92_246/0.9)]" />
          <Link2 aria-hidden className="size-4.5" /> Connected AIs
        </NavLink>
      </div>

      <Folders />

      <button
        type="button"
        onClick={veil.toggle}
        aria-pressed={veil.on}
        title="Hide private details (⌘⇧H)"
        className={`mt-auto flex items-center gap-2.5 rounded-lg py-2.5 pl-6 pr-3 text-left text-sm ${veil.on ? "bg-private font-semibold text-[#0b0b0f]" : "text-rail-mute hover:bg-rail-2 hover:text-white"}`}
      >
        {veil.on ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
        <span className="flex-1 truncate whitespace-nowrap">{veil.on ? "Details hidden" : "Hide private details"}</span>
      </button>

      <NavLink to="/settings" className={link}>
        <span aria-hidden className="size-1.5 shrink-0 rounded-full group-aria-[current=page]:bg-void group-aria-[current=page]:shadow-[0_0_8px_rgb(139_92_246/0.9)]" />
        <Settings aria-hidden className="size-4.5" /> Settings
      </NavLink>

      <div className="flex items-center gap-2 rounded-lg bg-rail-3 p-3 text-[12.5px] text-rail-mute">
        <Logo size={14} glow={false} />
        Stored only on this Mac
      </div>
    </nav>
  );
}
