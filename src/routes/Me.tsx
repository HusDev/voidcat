import { AlertCircle, CircleHelp, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { type Fact, LIBRARY_CHANGED, announceChange, hasLibrary, listFacts, openDocument } from "../lib/library";
import {
  GROUPS,
  type Profile,
  buildProfile,
  chooseProfileValue,
  flagContact,
  initials,
  listContacts,
  loadProfile,
  profileChoices,
  saveProfile,
} from "../lib/people";
import { Private, useVeil } from "../lib/veil";

const sameWords = (a: string, b: string) => {
  const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(" ");
  return words(a) === words(b);
};

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** A short name for a source document: "Rental contract, Carrer Robles 214" → "Rental contract". */
const shortTitle = (title: string) => title.split(/[,(·]/)[0].trim().slice(0, 28);

function Source({ fact }: { fact: Fact }) {
  return (
    <button
      type="button"
      onClick={() => openDocument(fact.documentId)}
      title={`${fact.documentTitle}${fact.page ? `, page ${fact.page}` : ""}`}
      className="shrink-0 whitespace-nowrap rounded-md bg-accent-soft px-1.5 py-0.5 text-[11.5px] text-link hover:underline"
    >
      <Private>{shortTitle(fact.documentTitle)}</Private>
    </button>
  );
}

export function Me() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [saved, setSaved] = useState<{ profile: Profile; builtAt: string } | null>(null);
  const [choices, setChoices] = useState<Map<string, string>>(new Map());
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const veil = useVeil();

  const refresh = useCallback(async () => {
    const [f, p, c] = await Promise.all([listFacts("approved"), loadProfile(), profileChoices()]);
    setFacts(f);
    setSaved(p);
    setChoices(c);
    setLoaded(true);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, [refresh]);

  const build = async () => {
    setError(null);
    setBuilding(true);
    try {
      const all = await listFacts("approved");
      const profile = await buildProfile(all);
      await saveProfile(profile);
      // The owner shouldn't also be a contact.
      const name = all.find((f) => f.id === profile.ownerFactId)?.value;
      if (name) for (const c of await listContacts()) if (c.kind === "person" && sameWords(c.name, name)) await flagContact(c.id, "me");
      announceChange();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };

  const byId = new Map(facts.map((f) => [f.id, f]));
  const profile = saved?.profile;
  const name = profile?.ownerFactId ? byId.get(profile.ownerFactId)?.value : undefined;
  const chosenFor = (label: string) => choices.get(label.toLowerCase());
  const open = (profile?.conflicts ?? []).filter((c) => !chosenFor(c.label) && c.factIds.filter((id) => byId.has(id)).length > 1);
  const docs = new Set(facts.map((f) => f.documentId)).size;
  const stale = profile && profile.factCount !== facts.length;

  if (!loaded && hasLibrary) return null;

  return (
    <div className="flex w-full max-w-6xl gap-6">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-[22px] text-accent">
            {name && !veil.on ? initials(name) : "Me"}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="m-0 text-[30px] font-light tracking-tight">{name ? <Private>{name}</Private> : "Me"}</h1>
            <span className="text-sm text-ink-2">
              {profile ? `Built from ${docs} ${docs === 1 ? "document" : "documents"} · ${facts.length} facts you approved · updated ${ago(saved.builtAt)}` : "Your details, gathered from the facts you approved."}
            </span>
          </div>
          <button
            type="button"
            onClick={build}
            disabled={building || !hasLibrary || facts.length === 0}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13.5px] font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {building ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
            {building ? "Reading your facts on this Mac…" : profile ? "Update" : "Build my profile"}
          </button>
        </header>

        {error && (
          <p role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        )}
        {stale && !building && (
          <p className="m-0 flex items-center gap-2 rounded-lg bg-accent-soft/50 px-3.5 py-2.5 text-[13.5px]">
            <AlertCircle aria-hidden className="size-4 text-accent" /> You approved new facts since this was built. Update to include them.
          </p>
        )}

        {!profile && (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-card px-5 py-7 text-sm text-ink-2">
            <p className="m-0">
              Voidcat reads the facts you approved, works out which are about you, and lays them out here: your IDs, residency, home, work, education and health, each with the document it
              came from. It runs on this Mac; nothing is sent anywhere.
            </p>
            {facts.length === 0 && (
              <Link to="/inbox" className="self-start font-semibold text-link hover:underline">
                Approve some facts first
              </Link>
            )}
          </div>
        )}

        {profile && (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {GROUPS.map((group) => {
              const rows = profile.fields
                .filter((f) => f.group === group)
                .map((f) => ({ ...f, fact: byId.get(chosenFor(f.label) ?? f.factId) }))
                .filter((f) => f.fact);
              if (!rows.length) return null;
              return (
                <article key={group} className="flex flex-col rounded-xl border border-line bg-card px-4 pt-3.5 pb-1.5">
                  <h2 className="m-0 pb-1.5 text-[11.5px] font-semibold uppercase tracking-widest text-ink-2">{group}</h2>
                  {rows.map((r) => (
                    <div key={r.factId} className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-baseline gap-2.5 border-t border-line py-2">
                      <span className="text-[12.5px] text-ink-2">{r.label}</span>
                      <span data-selectable className="break-words text-[14px] font-medium">
                        <Private>{r.fact!.value}</Private>
                      </span>
                      <Source fact={r.fact!} />
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {profile && (
        <aside className="flex w-[300px] shrink-0 flex-col gap-4 self-start">
          {(open.length > 0 || profile.missing.length > 0) && (
            <div className="flex flex-col gap-3 rounded-xl border border-accent/50 bg-card p-4">
              <span className="text-[14px] font-bold">Needs you · {open.length + profile.missing.length}</span>
              {open.map((c) => (
                <div key={c.label} className="flex flex-col gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0">
                  <span className="text-[13.5px] font-semibold">{c.label}: which is right?</span>
                  <div className="flex flex-col gap-1.5">
                    {c.factIds
                      .map((id) => byId.get(id))
                      .filter((f): f is Fact => !!f)
                      .map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={async () => {
                            await chooseProfileValue(c.label.toLowerCase(), f.id);
                            refresh();
                          }}
                          className="flex flex-col items-start rounded-md border border-line-strong px-2.5 py-1.5 text-left hover:border-accent"
                        >
                          <span className="text-[13px] font-medium">
                            <Private>{f.value}</Private>
                          </span>
                          <span className="text-[11.5px] text-ink-2">
                            <Private>{f.documentTitle}</Private>
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
              {profile.missing.map((m) => (
                <div key={m.label} className="flex gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0">
                  <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13.5px] font-semibold">{m.label}</span>
                    <span className="text-[12.5px] leading-relaxed text-ink-2">{m.why}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {profile.timeline.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4">
              <span className="text-[14px] font-bold">Timeline</span>
              {profile.timeline.map((t, i) => (
                <div key={`${t.when}-${i}`} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 text-[13px]">
                  <span className="tabular-nums text-ink-2">{veil.on ? "••••" : t.when}</span>
                  <span>
                    <Private>{t.what}</Private>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="m-0 flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-private-ink" />
            Built on this Mac by the local model. Every value is one you approved, and AIs only ever see it as a placeholder.
          </p>
        </aside>
      )}
    </div>
  );
}
