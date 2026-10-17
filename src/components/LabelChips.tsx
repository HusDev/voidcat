import { Plus, X } from "lucide-react";
import { useState } from "react";
import { announceChange, openDocument } from "../lib/library";
import { LABELS, type Label, MANUAL, removeLabel, setLabel } from "../lib/labels";

/** A document's labels as chips; × takes one off (an automatic one stays dismissed). With `canAdd`, you can add your own. */
export function LabelChips({ documentId, labels, canAdd = false }: { documentId: string; labels: Label[]; canAdd?: boolean }) {
  const [adding, setAdding] = useState(false);
  const mine = labels.filter((l) => l.documentId === documentId);
  if (!mine.length && !canAdd) return null;
  const free = MANUAL.filter((k) => !mine.some((l) => l.kind === k));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mine.map((l) => (
        <span key={l.kind} title={l.note ?? undefined} className={`inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[12px] font-semibold ${LABELS[l.kind].tone}`}>
          {l.kind === "duplicate" && l.relatedId ? (
            <button type="button" onClick={() => openDocument(l.relatedId!)} className="truncate hover:underline">
              {LABELS[l.kind].name}
            </button>
          ) : (
            <span className="truncate">{LABELS[l.kind].name}</span>
          )}
          <button
            type="button"
            onClick={async () => {
              await removeLabel(documentId, l.kind);
              announceChange();
            }}
            aria-label={`Remove the label ${LABELS[l.kind].name}`}
            title={l.source === "auto" ? "Not right? Remove it; it won't come back." : "Remove"}
            className="grid size-4.5 shrink-0 place-items-center rounded-full opacity-70 hover:bg-black/10 hover:opacity-100"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}
      {canAdd &&
        (adding ? (
          <span className="inline-flex flex-wrap gap-1">
            {free.map((k) => (
              <button
                key={k}
                type="button"
                onClick={async () => {
                  setAdding(false);
                  await setLabel(documentId, k);
                  announceChange();
                }}
                className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[12px] hover:border-ink-2"
              >
                {LABELS[k].name}
              </button>
            ))}
            <button type="button" onClick={() => setAdding(false)} className="px-1.5 text-[12px] text-ink-2 hover:text-ink">
              Cancel
            </button>
          </span>
        ) : (
          free.length > 0 && (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] text-ink-2 hover:bg-card hover:text-ink">
              <Plus aria-hidden className="size-3" /> Label
            </button>
          )
        ))}
    </div>
  );
}
