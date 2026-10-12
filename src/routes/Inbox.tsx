import { CheckCheck } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { SourcePage } from "../components/SourcePage";
import { type Fact, type Page, LIBRARY_CHANGED, announceChange, documentPages, listFacts, settleFact } from "../lib/library";

const quiet = "h-10 rounded-lg border border-[#d3d8dd] bg-card px-3.5 text-sm text-ink hover:border-ink-2";

export function Inbox() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pages, setPages] = useState<Page[]>([]);

  const refresh = useCallback(() => listFacts("pending").then(setFacts), []);
  useEffect(() => {
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, [refresh]);

  const current = facts.find((f) => f.id === selected) ?? facts[0];
  useEffect(() => {
    if (current) documentPages(current.documentId).then(setPages);
    else setPages([]);
  }, [current?.documentId]);

  const settle = async (f: Fact, status: "approved" | "rejected", value?: string) => {
    await settleFact(f.id, status, value);
    setEditing(null);
    announceChange();
  };

  const page = current?.page ? pages.find((p) => p.page === current.page) : pages[0];

  return (
    <div className="flex gap-6">
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="mb-1 flex flex-col gap-1">
          <h1 className="m-0 text-[26px] font-bold tracking-tight">Facts to approve</h1>
          <span className="text-sm text-ink-2">Nothing becomes a fact until you approve it. Each one shows where it came from.</span>
        </header>

        {facts.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-5 py-6 text-sm text-ink-2">
            <CheckCheck aria-hidden className="size-5 text-ok" /> All caught up. New facts appear here when you drop in a document.
          </div>
        )}

        {facts.map((f, i) => (
          <Fragment key={f.id}>
            {(i === 0 || facts[i - 1].documentId !== f.documentId) && <h2 className="m-0 mt-2 text-sm font-semibold text-ink-2">{f.documentTitle}</h2>}
            <article
              onFocus={() => setSelected(f.id)}
              onMouseEnter={() => setSelected(f.id)}
              className={`flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4.5 py-3.5 ${current?.id === f.id ? "border-ink-2" : "border-line"}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">{f.label}</span>
                {editing === f.id ? (
                  <input
                    id={`fact-${f.id}`}
                    aria-label={`Correct ${f.label}`}
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") settle(f, "approved", draft);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-9 rounded-md border border-[#d3d8dd] px-2 text-[16px] font-semibold"
                  />
                ) : (
                  <span data-selectable className="text-[17px] font-semibold">
                    {f.value}
                  </span>
                )}
                <span className="text-[13px] text-ink-2">{f.page ? `Page ${f.page} · ` : ""}read on this Mac</span>
              </div>
              {editing === f.id ? (
                <>
                  <button type="button" onClick={() => setEditing(null)} className={quiet}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => settle(f, "approved", draft)} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2">
                    Save and approve
                  </button>
                </>
              ) : (
                <>
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
                  <button type="button" onClick={() => settle(f, "rejected")} className={quiet}>
                    Reject
                  </button>
                  <button type="button" onClick={() => settle(f, "approved")} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2">
                    Approve
                  </button>
                </>
              )}
            </article>
          </Fragment>
        ))}
      </section>

      {current && (
        <aside aria-label="Source page" className="hidden w-90 shrink-0 flex-col gap-3 xl:flex">
          <span className="text-[13px] font-semibold text-ink-2">
            {current.documentTitle}
            {page ? ` · page ${page.page}` : ""}
          </span>
          {page ? (
            <SourcePage text={page.text} mime={current.documentMime} highlight={current.value} />
          ) : (
            <p className="m-0 rounded-xl border border-line bg-card px-6 py-6 text-xs text-ink-2">No text for this page.</p>
          )}
          <span className="text-[12.5px] text-ink-2">Read on this Mac. This page was not sent to any AI.</span>
        </aside>
      )}
    </div>
  );
}
