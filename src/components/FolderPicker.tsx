import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { FolderPlus, Folder as FolderIcon } from "lucide-react";
import { useState } from "react";
import { AREAS } from "../lib/extract";
import type { Folder } from "../lib/library";

type Choice = { area: string; name: string; isNew: boolean };

/** Pick an existing folder, or type a new name and choose its area. */
export function FolderPicker({ folders, area, onPick, onCancel }: { folders: Folder[]; area: string; onPick: (area: string, name: string) => void; onCancel: () => void }) {
  const [query, setQuery] = useState("");
  const [newArea, setNewArea] = useState(AREAS.includes(area as (typeof AREAS)[number]) ? area : "Other");
  const q = query.trim().toLowerCase();
  const matches = q ? folders.filter((f) => `${f.area} ${f.name}`.toLowerCase().includes(q)) : folders;
  const exact = folders.some((f) => f.name.toLowerCase() === q && f.area === newArea);
  const choices: Choice[] = [...matches.map((f) => ({ area: f.area, name: f.name, isNew: false })), ...(q && !exact ? [{ area: newArea, name: query.trim(), isNew: true }] : [])];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-ground/60 p-2.5">
      <Combobox<Choice | null> value={null} onChange={(c) => c && onPick(c.area, c.name)} immediate>
        <ComboboxInput
          autoFocus
          aria-label="Folder"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          placeholder="Find a folder, or type a new name…"
          className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13.5px] outline-none focus:border-ink-2"
        />
        <ComboboxOptions anchor="bottom start" className="z-20 max-h-64 w-(--input-width) overflow-y-auto rounded-lg border border-line bg-card p-1 shadow-lg [--anchor-gap:4px] empty:invisible">
          {choices.map((c) => (
            <ComboboxOption key={`${c.area}›${c.name}›${c.isNew}`} value={c} className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] data-focus:bg-ground">
              {c.isNew ? <FolderPlus aria-hidden className="size-4 text-private-ink" /> : <FolderIcon aria-hidden className="size-4 text-ink-2" />}
              {c.isNew ? (
                <span>
                  New folder <b>{c.name}</b> in {c.area}
                </span>
              ) : (
                <span>
                  {c.area} › <b>{c.name}</b>
                </span>
              )}
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </Combobox>
      <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <label htmlFor="new-folder-area">New folders go in</label>
        <select id="new-folder-area" value={newArea} onChange={(e) => setNewArea(e.currentTarget.value)} className="h-7 rounded-md border border-line-strong bg-card px-1.5 text-[12.5px] text-ink">
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <button type="button" onClick={onCancel} className="ml-auto px-1 text-ink-2 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
