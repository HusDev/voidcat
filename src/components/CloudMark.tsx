import { Cloud, CloudAlert, CloudCheck, CloudOff, CloudUpload, Monitor, Pause } from "lucide-react";
import { Link } from "react-router";
import { keepInCloud, macCloud, type MarkState, syncNow, useCloudStatus } from "../cloud/mac";

/**
 * Where a document is, once this Mac syncs to Voidcat Cloud (nothing shows before). Quiet on purpose: grey for "in the
 * cloud", ink while uploading, red only when an upload failed. Gold stays for the cat.
 */
export function useCloudMark(id: string): MarkState | null {
  const status = useCloudStatus();
  return macCloud && status.account ? (status.marks.get(id) ?? "pending") : null;
}

const NAMES: Record<MarkState, string> = { cloud: "In the cloud", pending: "Uploading", failed: "Couldn't upload", local: "Only on this Mac" };

/** The icon alone, for sidebar rows. Documents kept only on this Mac get none, so the tree stays quiet. */
export function CloudRowMark({ id }: { id: string }) {
  const mark = useCloudMark(id);
  if (!mark || mark === "local") return null;
  const Icon = mark === "cloud" ? CloudCheck : mark === "failed" ? CloudAlert : CloudUpload;
  return (
    <Icon
      role="img"
      aria-label={NAMES[mark]}
      className={`size-3.5 shrink-0 ${mark === "cloud" ? "text-rail-faint" : mark === "failed" ? "text-[#f0645a]" : "text-rail-ink"}`}
    />
  );
}

/** Icon and words, for Library cards; a failed upload offers to try again. */
export function CloudCardMark({ id }: { id: string }) {
  const mark = useCloudMark(id);
  if (!mark) return null;
  const Icon = mark === "cloud" ? CloudCheck : mark === "failed" ? CloudAlert : mark === "local" ? Monitor : CloudUpload;
  return (
    <span className={`flex items-center gap-1.5 text-[12px] ${mark === "failed" ? "text-danger" : mark === "pending" ? "text-ink" : "text-ink-2"}`}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {mark === "pending" ? "Locking and uploading…" : NAMES[mark]}
      {mark === "failed" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            keepInCloud(id, true);
          }}
          className="ml-1 font-semibold underline"
        >
          Try again
        </button>
      )}
    </span>
  );
}

/** The switch on a document: keep it in the cloud, or only on this Mac. */
export function KeepInCloud({ id, compact = false }: { id: string; compact?: boolean }) {
  const mark = useCloudMark(id);
  if (!mark) return null;
  const on = mark !== "local";
  const note = { cloud: "Locked copy in the cloud", pending: "Locking and uploading…", failed: "Couldn't upload, trying again", local: "Only on this Mac" }[mark];
  return (
    <span className={`flex items-center gap-2.5 ${compact ? "" : "rounded-lg border border-line-strong bg-card py-1 pr-1.5 pl-2.5"}`}>
      {on ? <CloudCheck aria-hidden className="size-4 shrink-0 text-ink-2" /> : <Monitor aria-hidden className="size-4 shrink-0 text-ink-2" />}
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] font-semibold">In the cloud</span>
        <span className={`text-[11.5px] ${mark === "failed" ? "text-danger" : "text-ink-2"}`}>{note}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Keep this document in the cloud"
        title={on ? "Turn off to keep it only on this Mac; its cloud copy is deleted." : "Turn on to put a locked copy in the cloud."}
        onClick={(e) => {
          e.stopPropagation();
          keepInCloud(id, !on);
        }}
        className={`relative ml-1 h-5 w-8.5 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line-strong"}`}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-card shadow transition-[left] ${on ? "left-[15px]" : "left-0.5"}`} />
      </button>
    </span>
  );
}

/** An icon button among a card's quieter actions: in the cloud (filled) or only on this Mac. */
export function CloudToggle({ id }: { id: string }) {
  const mark = useCloudMark(id);
  if (!mark) return null;
  const on = mark !== "local";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Keep in the cloud"
      title={on ? "In the cloud. Click to keep it only on this Mac (its cloud copy is deleted)." : "Only on this Mac. Click to put a locked copy in the cloud."}
      onClick={(e) => {
        e.stopPropagation();
        keepInCloud(id, !on);
      }}
      className={`grid size-8 place-items-center rounded-md hover:bg-ground hover:text-ink ${on ? "text-ink-2" : "text-ink-2/60"}`}
    >
      {on ? <Cloud aria-hidden className="size-4" /> : <CloudOff aria-hidden className="size-4" />}
    </button>
  );
}

/** Above the sidebar's bottom row: this Mac's link to Voidcat Cloud. Opens Settings. */
export function CloudStatusButton() {
  const s = useCloudStatus();
  if (!macCloud) return null;
  const since = s.account?.syncedAt ? ago(s.account.syncedAt) : null;
  const [Icon, title, note, tone] = !s.account
    ? [CloudOff, "Not in the cloud", "Connect in Settings", "text-rail-mute"]
    : s.phase === "syncing"
      ? [CloudUpload, "Syncing", `${s.left} left`, "text-rail-ink"]
      : s.phase === "offline"
        ? [Pause, "Waiting", "No internet", "text-rail-mute"]
        : s.phase === "error"
          ? [CloudAlert, "Voidcat Cloud", s.failed ? `${s.failed} couldn't upload` : "Needs attention", "text-[#f0645a]"]
          : [CloudCheck, "Voidcat Cloud", since ? `Synced ${since}` : "Connected", "text-rail-ink"];
  return (
    <Link
      to="/settings#cloud"
      onClick={() => s.account && syncNow()}
      className="mx-1 mb-1.5 flex items-center gap-2.5 rounded-lg bg-rail-2 px-2.5 py-2 text-rail-ink hover:bg-white/10"
    >
      <Icon aria-hidden className={`size-4 shrink-0 ${tone}`} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[12.5px] font-medium">{title}</span>
        <span className="truncate text-[11.5px] text-rail-mute">{note}</span>
      </span>
    </Link>
  );
}

/** "just now", "4 min ago", "2 h ago", or the date. */
export function ago(iso: string, now = Date.now()) {
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
