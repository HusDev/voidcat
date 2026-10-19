import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDown, FilePlus } from "lucide-react";
import { useState } from "react";
import { newNote } from "../lib/library";

/** "New document": a Markdown note at once, or plain text from the menu; in `folderId` when given. */
export function NewNoteButton({ folderId, onError }: { folderId?: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const make = async (kind: "md" | "txt") => {
    setBusy(true);
    try {
      await newNote(kind, folderId);
    } catch (e) {
      onError(`The document could not be made: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="inline-flex h-9 rounded-lg border border-line-strong bg-card text-[13px]">
      <button type="button" disabled={busy} onClick={() => make("md")} className="inline-flex items-center gap-1.5 rounded-l-lg px-3 hover:bg-accent-soft disabled:opacity-50">
        <FilePlus aria-hidden className="size-4" /> New document
      </button>
      <Menu>
        <MenuButton aria-label="Choose the kind of document" disabled={busy} className="grid w-8 place-items-center rounded-r-lg border-l border-line-strong hover:bg-accent-soft disabled:opacity-50">
          <ChevronDown aria-hidden className="size-4" />
        </MenuButton>
        <MenuItems anchor="bottom end" className="z-50 mt-1 flex w-52 flex-col rounded-lg border border-line-strong bg-card p-1 text-[13px] shadow-xl focus:outline-none">
          <MenuItem>
            <button type="button" onClick={() => make("md")} className="flex flex-col items-start rounded-md px-2.5 py-1.5 text-left data-focus:bg-accent-soft">
              Markdown <span className="text-[12px] text-ink-2">Headings, lists, bold, tables</span>
            </button>
          </MenuItem>
          <MenuItem>
            <button type="button" onClick={() => make("txt")} className="flex flex-col items-start rounded-md px-2.5 py-1.5 text-left data-focus:bg-accent-soft">
              Plain text <span className="text-[12px] text-ink-2">Just the words, as typed</span>
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>
    </div>
  );
}
