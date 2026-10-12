import { Folder as FolderIcon, FolderPlus, Pencil } from "lucide-react";
import { useState } from "react";
import { AREAS } from "../lib/extract";
import { type Document, type Folder, announceChange, fileInFolder } from "../lib/library";
import { Private } from "../lib/veil";
import { FolderPicker } from "./FolderPicker";

const ext = (name: string) => name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "";

/** Documents waiting for a folder: Voidcat's suggestion, and the choice to accept it or pick another. */
export function ToFile({ docs, folders }: { docs: Document[]; folders: Folder[] }) {
  const [picking, setPicking] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; area: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!docs.length) return null;

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
    <section aria-labelledby="to-file-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="to-file-h" className="m-0 text-[17px] font-bold">
            {docs.length} to file
          </h2>
          <span className="text-[13px] text-ink-2">Voidcat filed the documents it was sure about. Check where these go; nothing moves until you confirm.</span>
        </div>
        {docs.length > 1 && (
          <button type="button" onClick={fileAll} disabled={busy} className="ml-auto h-9 rounded-lg bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            File all {docs.length}
          </button>
        )}
      </div>

      {docs.map((d) => {
        const isNew = d.suggestedNew;
        return (
          <article key={d.id} className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-xl border border-line bg-card p-4 lg:grid-cols-[40px_minmax(0,1fr)_340px]">
            <span className="grid h-12 w-10 place-items-center rounded-md bg-accent-soft text-[10.5px] font-bold text-link">{ext(d.fileName)}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[15px] font-semibold">
                <Private>{d.title}</Private>
              </span>
              <span className="truncate text-[12.5px] text-ink-2">
                <Private>{d.fileName}</Private>
              </span>
              {d.suggestionReason && <span className="text-[13px] leading-snug">{d.suggestionReason}</span>}
            </div>
            <div className="col-span-2 flex flex-col gap-2 lg:col-span-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">{isNew ? "New folder" : "Existing folder"}</span>
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${isNew ? "border border-dashed border-private-line bg-private-soft text-private-ink" : "bg-ok-soft text-ok"}`}>
                {isNew ? <FolderPlus aria-hidden className="size-4" /> : <FolderIcon aria-hidden className="size-4" />}
                <span className="flex-1 text-sm font-semibold">
                  {d.suggestedArea} › <Private>{d.suggestedFolder ?? ""}</Private>
                </span>
                <span className="text-xs">{isNew ? "will be created" : ""}</span>
              </div>
              {renaming?.id === d.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renaming.name.trim()) file(d, renaming.area, renaming.name);
                  }}
                  className="flex flex-col gap-2 rounded-lg border border-line bg-ground/60 p-2.5"
                >
                  <div className="flex gap-2">
                    <label htmlFor={`area-${d.id}`} className="sr-only">
                      Area
                    </label>
                    <select
                      id={`area-${d.id}`}
                      value={renaming.area}
                      onChange={(e) => setRenaming({ ...renaming, area: e.currentTarget.value })}
                      className="h-9 rounded-md border border-line-strong bg-card px-1.5 text-[13px]"
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
                      className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2.5 text-[13.5px] outline-none focus:border-ink-2"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={!renaming.name.trim()} className="h-8 rounded-md bg-accent px-3 text-[13px] font-semibold text-white hover:bg-accent-strong disabled:opacity-40">
                      {folders.some((f) => f.area === renaming.area && f.name.toLowerCase() === renaming.name.trim().toLowerCase()) ? "File here" : "Create and file"}
                    </button>
                    <button type="button" onClick={() => setRenaming(null)} className="h-8 px-2 text-[13px] text-ink-2 hover:text-ink">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : picking === d.id ? (
                <FolderPicker folders={folders} area={d.suggestedArea ?? d.area ?? "Other"} onPick={(area, name) => file(d, area, name)} onCancel={() => setPicking(null)} />
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => d.suggestedArea && d.suggestedFolder && file(d, d.suggestedArea, d.suggestedFolder)}
                    className="h-8 rounded-md bg-accent px-3 text-[13px] font-semibold text-white hover:bg-accent-strong"
                  >
                    {isNew ? "Create and file" : "File here"}
                  </button>
                  {isNew && (
                    <button
                      type="button"
                      onClick={() => setRenaming({ id: d.id, area: d.suggestedArea ?? "Other", name: d.suggestedFolder ?? "" })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-[13px] hover:border-ink-2"
                    >
                      <Pencil aria-hidden className="size-3.5" /> Rename
                    </button>
                  )}
                  <button type="button" onClick={() => setPicking(d.id)} className="h-8 rounded-md border border-line-strong bg-card px-3 text-[13px] hover:border-ink-2">
                    Other folder…
                  </button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
