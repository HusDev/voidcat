import { FileText, Search, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { docs, type DocStatus } from "../lib/sample";

const badge: Record<DocStatus, string> = {
  current: "bg-ok-soft text-ok",
  renew: "bg-private-soft text-private-ink",
  stamps: "bg-private-soft text-private-ink",
  replaced: "bg-ground text-ink-2",
  record: "bg-ground text-ink-2",
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function Library({ pending }: { pending: number }) {
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);
  const picker = useRef<HTMLInputElement>(null);

  const q = norm(query.trim());
  const shown = q ? docs.filter((d) => norm([d.title, d.area, ...d.facts.map((f) => f.value)].join(" ")).includes(q)) : docs;
  const add = (files: FileList | null) => files && setDropped((list) => [...[...files].map((f) => f.name), ...list]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="m-0 text-[26px] font-bold tracking-tight">Library</h1>
        <span className="text-sm text-ink-2">38 documents · 112 facts</span>
        <label htmlFor="lib-search" className="ml-auto flex h-10 w-80 items-center gap-2 rounded-lg border border-[#d3d8dd] bg-card px-3 text-sm text-ink-2">
          <Search aria-hidden className="size-4" />
          <input
            id="lib-search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search: passport, lease, 2027…"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none"
          />
        </label>
      </header>

      <section
        aria-label="Drop files"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={`flex items-center gap-4.5 rounded-xl border-2 border-dashed px-6 py-5 transition-colors ${dragging ? "border-link bg-[#e3eef2]" : "border-[#9fb4c1] bg-[#f7fafb]"}`}
      >
        <Upload aria-hidden className="size-10 text-link" strokeWidth={1.6} />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">Drop any document here</span>
          <span className="text-[13.5px] text-ink-2">PDF, photo, scan or email. SafeBox reads it on this Mac, files it and pulls out the facts.</span>
        </div>
        <button type="button" onClick={() => picker.current?.click()} className="ml-auto h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2">
          Choose files
        </button>
        <input ref={picker} type="file" multiple hidden onChange={(e) => add(e.currentTarget.files)} />
      </section>

      {dropped.map((name) => (
        <section key={name} aria-label="Waiting to be read" className="flex items-center gap-3.5 rounded-xl border border-line bg-card px-4.5 py-3.5">
          <span className="grid size-9 place-items-center rounded-lg bg-[#e3eef2]">
            <FileText aria-hidden className="size-4.5 text-link" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="text-[13px] text-ink-2">Waiting to be read on this Mac</span>
          </div>
        </section>
      ))}

      {pending > 0 && (
        <section aria-label="Just added" className="flex items-center gap-3.5 rounded-xl border border-line bg-card px-4.5 py-3.5">
          <span className="grid size-9 place-items-center rounded-lg bg-[#e3eef2]">
            <FileText aria-hidden className="size-4.5 text-link" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">rental_contract_signed.pdf</span>
            <span className="text-[13px] text-ink-2">
              Filed in Home as <b className="text-ink">Rental contract</b> · 8 pages read · {pending} facts found
            </span>
          </div>
          <Link to="/inbox" className="ml-auto text-sm font-semibold text-link hover:underline">
            Review {pending} facts
          </Link>
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
        {shown.map((d) => (
          <article key={d.id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">{d.area}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[d.status]}`}>{d.statusLabel}</span>
            </div>
            <span className="text-[15px] font-semibold">{d.title}</span>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              {d.facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-ink-2">{f.label}</dt>
                  <dd data-selectable className={`m-0 ${f.mono ? "font-mono" : ""}`}>
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
        {shown.length === 0 && <p className="text-sm text-ink-2">Nothing matches “{query.trim()}”.</p>}
      </div>
    </div>
  );
}
