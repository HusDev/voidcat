import { AlertCircle, FileText, LoaderCircle, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { SideChat } from "../components/SideChat";
import { dateKind } from "../lib/calendar";
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
  aboutYou,
} from "../lib/people";
import { parseDate } from "../lib/privacy";
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

/** The document a value came from, as a small link after the value (it never takes the value's room). */
function Source({ fact }: { fact: Fact }) {
  return (
    <button
      type="button"
      onClick={() => openDocument(fact.documentId)}
      aria-label={`Open ${fact.documentTitle}`}
      title={`From ${fact.documentTitle}${fact.page ? `, page ${fact.page}` : ""}`}
      className="ml-1.5 inline-grid size-5 place-items-center rounded align-[-3px] text-ink-2 hover:bg-accent-soft hover:text-link"
    >
      <FileText aria-hidden className="size-3.5" />
    </button>
  );
}

const DAY = 86_400_000;
/** An expiry date's state: past, within three months, or fine. */
function expiry(f: Fact) {
  if (dateKind(f.label)?.kind !== "expires") return null;
  const d = parseDate(f.value);
  if (!d) return null;
  const days = (d.getTime() - new Date(new Date().toDateString()).getTime()) / DAY;
  return days < 0 ? "past" : days <= 90 ? "soon" : "ok";
}

/** The one-line summary under the name: nationality, birth date, ID number, city, as far as they're known. */
function summary(fields: { label: string; fact: Fact }[]) {
  const pick = (re: RegExp) => fields.find((f) => re.test(f.label))?.fact.value;
  return [pick(/national/i), pick(/date of birth|birth ?date|fecha de nacimiento/i) && `born ${pick(/date of birth|birth ?date|fecha de nacimiento/i)}`, pick(/\b(nie|tie|nif|dni)\b|id number/i), pick(/\bcity\b|town|municipality/i)].filter(Boolean) as string[];
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

  const rows = (profile?.fields ?? []).map((f) => ({ ...f, fact: byId.get(chosenFor(f.label) ?? f.factId) })).filter((f): f is typeof f & { fact: Fact } => !!f.fact);
  const line = summary(rows);
  // The model sometimes doesn't say which fact is the owner's name; the profile's own "full name" row then stands in.
  const shownName = name ?? rows.find((r) => /full name|^name$|nombre completo/i.test(r.label))?.fact.value;
  const expiring = facts.filter((f) => expiry(f) === "soon" || expiry(f) === "past").length;

  /** Your profile as text, sent with each question in the chat beside it. */
  const profileText = () =>
    [
      "The user is asking about themselves. Their profile, from facts they approved:",
      ...aboutYou(profile, facts, choices).lines,
      profile?.timeline.length ? "Their timeline:" : "",
      ...(profile?.timeline ?? []).map((t) => `- ${t.when}: ${t.what}`),
      "When asked for a CV, bio, letter or form answers, write it from this profile; leave a clear [placeholder] for anything missing instead of inventing it. A CV or bio never shows salary, ID or passport numbers, unless the user asks for them.",
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <div className="flex w-full flex-wrap items-start gap-5">
    <div className="flex min-w-0 max-w-5xl flex-[999_1_560px] flex-col gap-4">
      <section aria-label="Profile" className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-2xl bg-rail px-5 py-5 text-rail-ink sm:px-6">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-void/25 font-display text-[26px] font-light text-[#c4b5fd]">{shownName && !veil.on ? initials(shownName) : "Me"}</span>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rail-mute">Me</span>
          <h1 className="m-0 break-words text-[28px] font-light tracking-tight text-rail-ink">{shownName ? <Private>{shownName}</Private> : "Your profile"}</h1>
          {line.length > 0 && (
            <span className="break-words font-mono text-[12.5px] text-rail-mute">
              {line.map((v, i) => (
                <span key={v}>
                  {i > 0 && " · "}
                  <Private>{v}</Private>
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <span className="flex flex-col justify-center rounded-xl bg-white/6 px-3.5 py-2">
            <span className="text-[19px] font-semibold tabular-nums">{docs}</span>
            <span className="text-[12px] text-rail-mute">{docs === 1 ? "document" : "documents"}</span>
          </span>
          {expiring > 0 && (
            <Link to="/calendar" className="flex flex-col justify-center rounded-xl bg-private/12 px-3.5 py-2 no-underline">
              <span className="text-[19px] font-semibold tabular-nums text-private">{expiring}</span>
              <span className="text-[12px] text-rail-mute">expires soon</span>
            </Link>
          )}
          <button
            type="button"
            onClick={build}
            disabled={building || !hasLibrary || facts.length === 0}
            className="inline-flex min-h-14 items-center gap-1.5 rounded-xl bg-accent px-4 text-[13.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40"
          >
            {building ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
            {building ? "Reading on this Mac…" : profile ? "Update" : "Build my profile"}
          </button>
        </div>
      </section>

      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
      {stale && !building && (
        <p className="m-0 flex items-center gap-2 rounded-lg bg-accent-soft/50 px-3.5 py-2.5 text-[13.5px]">
          <AlertCircle aria-hidden className="size-4 shrink-0 text-accent" /> You approved new facts since this was built. Update to include them.
        </p>
      )}

      {!profile && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-card px-5 py-7 text-sm text-ink-2">
          <p className="m-0">
            Voidcat reads the facts you approved, works out which are about you, and lays them out here: your IDs, residency, home, work, education and health, each with the document it came
            from. It runs on this Mac; nothing is sent anywhere.
          </p>
          {facts.length === 0 && (
            <Link to="/inbox" className="self-start font-semibold text-link hover:underline">
              Approve some facts first
            </Link>
          )}
        </div>
      )}

      {profile && (
        <>
          {(profile.missing.length > 0 || saved) && (
            <section aria-label="Missing" className="flex flex-wrap items-center gap-2">
              {profile.missing.length > 0 && <span className="text-[13.5px] font-bold">Missing</span>}
              {profile.missing.map((m) => (
                <span key={m.label} title={m.why} className="rounded-full border border-dashed border-accent/60 bg-card px-3 py-1 text-[13px]">
                  {m.label}
                </span>
              ))}
              <span className="ml-auto text-[12.5px] text-ink-2">
                From {facts.length} approved facts · updated {ago(saved!.builtAt)}
              </span>
            </section>
          )}

          {open.map((c) => (
            <section key={c.label} aria-label={`${c.label}: which is right?`} className="flex flex-col gap-2.5 rounded-xl border border-accent/50 bg-card p-4">
              <span className="text-[14px] font-semibold">{c.label}: your documents disagree. Which is right?</span>
              <div className="flex flex-wrap gap-2">
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
                      className="flex min-w-0 max-w-full flex-col items-start rounded-lg border border-line-strong px-3 py-2 text-left hover:border-accent"
                    >
                      <span className="break-words text-[13.5px] font-medium">
                        <Private>{f.value}</Private>
                      </span>
                      <span className="break-words text-[11.5px] text-ink-2">
                        <Private>{f.documentTitle}</Private>
                      </span>
                    </button>
                  ))}
              </div>
            </section>
          ))}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3.5">
            {GROUPS.map((group) => {
              const inGroup = rows.filter((r) => r.group === group);
              if (!inGroup.length) return null;
              return (
                <article key={group} className="flex flex-col gap-2.5 rounded-xl border border-line bg-card px-4.5 py-4">
                  <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">{group}</h2>
                  <dl className="m-0 grid grid-cols-[minmax(90px,120px)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13.5px]">
                    {inGroup.map((r) => {
                      const state = expiry(r.fact);
                      return (
                        <div key={r.factId} className="contents">
                          <dt className="text-ink-2">{r.label}</dt>
                          <dd data-selectable className={`m-0 min-w-0 break-words ${state === "past" || state === "soon" ? "text-danger" : state === "ok" ? "text-ok" : ""}`}>
                            <Private>{r.fact.value}</Private>
                            <Source fact={r.fact} />
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </article>
              );
            })}
          </div>

          {profile.timeline.length > 0 && (
            <section aria-label="Timeline" className="flex flex-col gap-3 rounded-xl border border-line bg-card px-4.5 py-4">
              <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">Timeline</h2>
              <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-3 gap-y-3 border-t-2 border-line p-0 pt-3">
                {profile.timeline.map((t, i) => (
                  <li key={`${t.when}-${i}`} className="flex flex-col gap-0.5">
                    <span className="font-mono text-[12px] tabular-nums text-ink-2">{veil.on ? "••••" : t.when}</span>
                    <span className="text-[13px] leading-snug">
                      <Private>{t.what}</Private>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="m-0 flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-private-ink" />
            Built on this Mac by the local model. Every value is one you approved, and AIs only ever see it as a placeholder.
          </p>
        </>
      )}
    </div>
    {profile && (
      <SideChat
        resetKey="me"
        title="Ask about me"
        reads={
          <>
            <UserRound aria-hidden className="size-3.5 shrink-0" />
            Reads your profile and your documents
          </>
        }
        extra={profileText}
        suggestions={["Build my CV", "Write a short bio about me", "My ID, NIE and address for a form", "Which of my documents expire soon?"]}
        placeholder="Ask about you, or ask for a CV…"
      />
    )}
    </div>
  );
}
