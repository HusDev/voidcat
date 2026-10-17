import { Check, CheckCheck, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import type { Fact } from "../lib/library";
import { Private } from "../lib/veil";

const quiet = "h-9 rounded-lg border border-line-strong bg-card px-3 text-[13px] hover:border-ink-2";

/**
 * The facts found in one document, beside it: the ones to check first (approve, edit or reject), then the approved
 * ones. Choosing a fact marks it in the document.
 */
export function ReviewPanel({
  pending,
  approved,
  selected,
  onSelect,
  onSettle,
  onApproveAll,
}: {
  pending: Fact[];
  approved: Fact[];
  selected: string | null;
  onSelect: (id: string) => void;
  onSettle: (f: Fact, status: "approved" | "rejected", value?: string) => void;
  onApproveAll: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <aside aria-label="Facts found" className="sticky top-0 flex max-w-[400px] min-w-0 flex-[1_1_320px] flex-col gap-2.5 self-start">
      {pending.length ? (
        <div className="flex items-center gap-2">
          <span className="font-semibold">To check · {pending.length}</span>
          <button type="button" onClick={onApproveAll} className="ml-auto h-9 rounded-lg bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-strong">
            Approve all {pending.length}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <CheckCheck aria-hidden className="size-4.5 text-ok" /> Every fact in this document is checked.
        </div>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {pending.map((f) =>
          f.id === selected ? (
            <li key={f.id} className="flex flex-col gap-2.5 rounded-xl border-2 border-accent bg-card p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                {f.label}
                {f.page ? ` · page ${f.page}` : ""}
              </span>
              {editing === f.id ? (
                <input
                  id={`review-${f.id}`}
                  aria-label={`Correct ${f.label}`}
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setEditing(null);
                      onSettle(f, "approved", draft);
                    }
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="h-9 rounded-md border border-line-strong bg-card px-2 text-[15px] font-semibold"
                />
              ) : (
                <span data-selectable className="text-[15px] font-semibold">
                  <Private>{f.value}</Private>
                </span>
              )}
              <div className="flex gap-1.5">
                {editing === f.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        onSettle(f, "approved", draft);
                      }}
                      className="h-9 flex-1 rounded-lg bg-accent text-[13px] font-semibold text-on-accent hover:bg-accent-strong"
                    >
                      Save and approve
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className={quiet}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => onSettle(f, "approved")} className="h-9 flex-1 rounded-lg bg-accent text-[13px] font-semibold text-on-accent hover:bg-accent-strong">
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(f.id);
                        setDraft(f.value);
                      }}
                      className={quiet}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => onSettle(f, "rejected")} className={quiet}>
                      Reject
                    </button>
                  </>
                )}
              </div>
            </li>
          ) : (
            <li key={f.id} className="flex items-center gap-2 rounded-xl border border-line bg-card py-2 pl-3.5 pr-2 hover:border-line-strong">
              <button type="button" onClick={() => onSelect(f.id)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="text-[11.5px] text-ink-2">{f.label}</span>
                <span className="truncate font-semibold">
                  <Private>{f.value}</Private>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onSettle(f, "approved")}
                aria-label={`Approve ${f.label}`}
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-strong text-ok hover:border-ok"
              >
                <Check aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onSettle(f, "rejected")}
                aria-label={`Reject ${f.label}`}
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-strong text-danger hover:border-danger"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ),
        )}
      </ul>

      {approved.length > 0 && (
        <details open={!pending.length} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1 py-1 text-[13px] text-ok">
            <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
            {approved.length} approved
          </summary>
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
            {approved.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  aria-current={f.id === selected || undefined}
                  className={`flex w-full flex-col rounded-lg px-3 py-1.5 text-left ${f.id === selected ? "bg-ok-soft" : "hover:bg-card"}`}
                >
                  <span className="text-[11.5px] text-ink-2">{f.label}</span>
                  <span className="truncate text-[13.5px]">
                    <Private>{f.value}</Private>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
