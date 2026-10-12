import { Inbox, Library, Link2, MessageSquareText, ShieldCheck } from "lucide-react";
import { NavLink } from "react-router";
import { Logo } from "./Logo";

const link = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm no-underline ${isActive ? "bg-rail-2 font-semibold text-white" : "text-rail-mute hover:text-white"}`;

export function Sidebar({ pending }: { pending: number }) {
  return (
    <nav aria-label="SafeBox" className="flex w-58 shrink-0 flex-col gap-7 bg-rail px-4 pb-5 pt-11 text-rail-ink">
      <div data-tauri-drag-region className="flex items-center gap-2.5 px-2">
        <Logo />
        <span className="text-lg font-bold tracking-tight">SafeBox</span>
      </div>

      <div className="flex flex-col gap-1">
        <NavLink to="/" end className={link}>
          <Library aria-hidden className="size-4.5" /> Library
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

      <div className="mt-auto flex items-center gap-2 rounded-lg bg-rail-3 p-3 text-[12.5px] text-rail-mute">
        <ShieldCheck aria-hidden className="size-4 text-private" />
        Stored only on this Mac
      </div>
    </nav>
  );
}
