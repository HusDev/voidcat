import { FolderInput, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AREAS } from "../lib/extract";
import { type Document, type Folder, announceChange, fileInFolder, openDocument, removeDocument } from "../lib/library";
import { process } from "../lib/pipeline";
import { Private } from "../lib/veil";
import { FolderPicker } from "./FolderPicker";

/** A heading and its rows, as the Library's "Needs you" view lays out each kind of task. */
export function TaskSection({ id, title, action, children }: { id: string; title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center gap-3">
        <h2 id={id} className="m-0 text-[14px] font-bold">
          {title}
        </h2>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-line bg-card p-0 text-[13px]">{children}</ul>
    </section>
  );
}

export const taskRow = "flex flex-wrap items-center gap-2.5 border-b border-line px-3.5 py-2 last:border-b-0";
export const smallButton = "h-7 shrink-0 rounded-md border border-line-strong bg-card px-2.5 text-[12.5px] hover:border-ink-2 disabled:opacity-40";

/** Documents waiting for a folder, one row each: Voidcat's suggestion, and File here, Rename, Other folder or remove. */
export function ToFile({ docs, unsorted, folders }: { docs: Document[]; unsorted: Document[]; folders: Folder[] }) {
  const [picking, setPicking] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; area: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /** The document whose removal is being confirmed. */
  const [removing, setRemoving] = useState<string | null>(null);
  if (!docs.length && !unsorted.length) return null;

  const file = async (d: Document, area: string, name: string) => {
    await fileInFolder(d.id, area, name);
    setPicking(null);
    setRenaming(null);
    announceChange();
  };
  const fileAll = async () => {
    setBusy(true);
    for (const d of docs) if (d.suggestedArea && d.suggestedFolder) await fileInFolder(d.id, d.suggestedArea, d.suggestedFolder);
    setBusy(false);
    announceChange();
  };

  return (
    <TaskSection
      id="to-file"
      title={`To file · ${docs.length + unsorted.length}`}
      action={
        docs.length > 1 && (
          <button type="button" onClick={fileAll} disabled={busy} className="h-7 rounded-md bg-accent px-2.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50">
            File all {docs.length}
          </button>
        )
      }
    >
      {docs.map((d) => (
        <li key={d.id} className={`${taskRow} flex-col items-stretch`}>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => openDocument(d.id)} title={d.suggestionReason ?? undefined} className="min-w-0 flex-[1_1_200px] truncate text-left font-semibold hover:underline">
              <Private>{d.title}</Private>
            </button>
            <span className={`font-mono text-[12px] ${d.suggestedNew ? "text-private-ink" : "text-ok"}`} title={d.suggestionReason ?? undefined}>
              → {d.suggestedArea} › <Private>{d.suggestedFolder ?? ""}</Private>
              {d.suggestedNew ? " (new)" : ""}
            </span>
            <button type="button" onClick={() => d.suggestedArea && d.suggestedFolder && file(d, d.suggestedArea, d.suggestedFolder)} className={smallButton}>
              {d.suggestedNew ? "Create and file" : "File here"}
            </button>
            {d.suggestedNew && (
              <button
                type="button"
                onClick={() => setRenaming({ id: d.id, area: d.suggestedArea ?? "Other", name: d.suggestedFolder ?? "" })}
                aria-label="Rename the new folder"
                title="Rename the new folder"
                className={`${smallButton} grid w-7 place-items-center px-0`}
              >
                <Pencil aria-hidden className="size-3.5" />
              </button>
            )}
            <button type="button" onClick={() => setPicking(picking === d.id ? null : d.id)} className={smallButton}>
              Other…
            </button>
            <button
              type="button"
              onClick={() => setRemoving(d.id)}
              aria-label={`Remove ${d.title}`}
              title="Remove this document"
              className={`${smallButton} grid w-7 place-items-center px-0 text-ink-2 hover:border-danger hover:text-danger`}
            >
              <Trash2 aria-hidden className="size-3.5" />
            </button>
          </div>
          {renaming?.id === d.id && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (renaming.name.trim()) file(d, renaming.area, renaming.name);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <label htmlFor={`area-${d.id}`} className="sr-only">
                Area
              </label>
              <select
                id={`area-${d.id}`}
                value={renaming.area}
                onChange={(e) => setRenaming({ ...renaming, area: e.currentTarget.value })}
                className="h-8 rounded-md border border-line-strong bg-card px-1.5 text-[13px]"
              >
                {AREAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <label htmlFor={`name-${d.id}`} className="sr-only">
                Folder name
              </label>
              <input
                id={`name-${d.id}`}
                autoFocus
                value={renaming.name}
                onChange={(e) => setRenaming({ ...renaming, name: e.currentTarget.value })}
                onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                className="h-8 min-w-40 flex-1 rounded-md border border-line-strong bg-card px-2.5 text-[13px] outline-none focus:border-ink-2"
              />
              <button type="submit" disabled={!renaming.name.trim()} className="h-8 rounded-md bg-accent px-3 text-[12.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40">
                {folders.some((f) => f.area === renaming.area && f.name.toLowerCase() === renaming.name.trim().toLowerCase()) ? "File here" : "Create and file"}
              </button>
              <button type="button" onClick={() => setRenaming(null)} className="h-8 px-2 text-[12.5px] text-ink-2 hover:text-ink">
                Cancel
              </button>
            </form>
          )}
          {picking === d.id && (
            <div className="max-w-md">
              <FolderPicker folders={folders} area={d.suggestedArea ?? d.area ?? "Other"} onPick={(area, name) => file(d, area, name)} onCancel={() => setPicking(null)} />
            </div>
          )}
          {removing === d.id && (
            <div role="group" aria-label="Remove this document?" className="flex flex-wrap items-center gap-2">
              <span className="text-ink-2">Remove it from Voidcat?</span>
              <button type="button" autoFocus onClick={() => setRemoving(null)} className={smallButton}>
                Keep
              </button>
              <button
                type="button"
                onClick={async () => {
                  await removeDocument(d.id);
                  setRemoving(null);
                  announceChange();
                }}
                className="h-7 rounded-md bg-danger px-2.5 text-[12.5px] font-semibold text-white"
              >
                Remove for good
              </button>
            </div>
          )}
        </li>
      ))}
      {unsorted.length > 0 && (
        <li className={taskRow}>
          <FolderInput aria-hidden className="size-4 shrink-0 text-ink-2" />
          <span className="flex-1">
            {unsorted.length} {unsorted.length === 1 ? "document was" : "documents were"} read before folders existed and {unsorted.length === 1 ? "has" : "have"} none yet.
          </span>
          <button type="button" onClick={() => process(unsorted)} className={smallButton}>
            Suggest folders
          </button>
        </li>
      )}
    </TaskSection>
  );
}
