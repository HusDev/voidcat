import { Cloud, CloudCheck, KeyRound, LoaderCircle, LogIn, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  deleteCloudCopy,
  disconnectThisMac,
  joinCloudLibrary,
  macCloud,
  type Outcome,
  setNewDocumentsGoUp,
  signInThroughBrowser,
  syncNow,
  useCloudStatus,
} from "../cloud/mac";
import { ago } from "./CloudMark";

const primary = "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40";
const secondary = "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-card px-3.5 py-2 text-[13px] font-semibold hover:border-ink-2 disabled:opacity-40";

/** Settings → Voidcat Cloud on the Mac: connect (sign-in in the browser), then what's synced and the controls. */
export function MacCloud() {
  const s = useCloudStatus();
  const [step, setStep] = useState<"idle" | "waiting" | "join">("idle");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  const here = useRef<HTMLElement>(null);
  const { hash: anchor } = useLocation();
  useEffect(() => () => cancel.current?.(), []);
  // The sidebar's cloud status links here.
  useEffect(() => {
    if (anchor === "#cloud") here.current?.scrollIntoView({ block: "start" });
  }, [anchor]);

  if (!macCloud) return null;

  const start = async (how: { email: string } | "google") => {
    setError(null);
    setBusy(true);
    try {
      const flow = await signInThroughBrowser(how);
      cancel.current = flow.cancel;
      setSentTo(how === "google" ? null : how.email);
      setStep("waiting");
      const outcome: Outcome = await flow.done;
      setStep(outcome === "join" ? "join" : "idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("idle");
    } finally {
      setBusy(false);
    }
  };

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const err = error && <p className="m-0 text-[12.5px] text-danger">{error}</p>;
  const total = s.marks.size;
  const local = [...s.marks.values()].filter((m) => m === "local").length;
  const inCloud = [...s.marks.values()].filter((m) => m === "cloud").length;

  return (
    <section ref={here} id="cloud" aria-labelledby="mac-cloud" className="flex scroll-mt-6 flex-col gap-3">
      <h2 id="mac-cloud" className="m-0 flex items-center gap-2 text-[15px] font-semibold">
        Voidcat Cloud
        {s.account ? (
          <span className="flex items-center gap-1.5 rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok">
            <span className="size-1.5 rounded-full bg-ok" /> Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[12px] font-normal text-ink-2">
            <span className="size-1.5 rounded-full bg-line-strong" /> Not connected
          </span>
        )}
      </h2>

      {!s.account && step === "idle" && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-card px-4 py-4">
          <span className="flex items-start gap-3">
            <Cloud aria-hidden className="mt-0.5 size-4.5 shrink-0 text-ink-2" />
            <span className="text-[13px] text-ink-2">
              Open your library in any browser. Each file is locked on this Mac before it leaves, so the cloud only ever holds locked copies. Your Mac's recovery
              key opens it: nothing new to save.
            </span>
          </span>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start({ email: email.trim() });
            }}
            className="flex flex-wrap gap-2 pl-7.5"
          >
            <label htmlFor="mac-cloud-email" className="sr-only">
              Email address
            </label>
            <input
              id="mac-cloud-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-3 py-2 text-[13.5px] outline-none focus:border-ink-2"
            />
            <button type="submit" disabled={busy || !email.includes("@")} className={primary}>
              {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Mail aria-hidden className="size-4" />} Email me a sign-in link
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-3 pl-7.5">
            <button type="button" disabled={busy} onClick={() => start("google")} className={secondary}>
              <LogIn aria-hidden className="size-4" /> Sign in with Google
            </button>
            <span className="text-[12px] text-ink-2">Both open your browser; once you're signed in, it hands you back to Voidcat.</span>
          </div>
          <div className="pl-7.5">{err}</div>
        </div>
      )}

      {step === "waiting" && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong bg-card px-4 py-3.5">
          <LoaderCircle aria-hidden className="size-4.5 shrink-0 animate-spin text-ink-2" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold">Waiting for your browser…</span>
            <span className="text-[12.5px] text-ink-2">
              {sentTo ? `We sent a link to ${sentTo}. Open it on this Mac (check spam if it isn't there).` : "Sign in with Google in the page that opened."}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              cancel.current?.();
              setStep("idle");
              setBusy(false);
            }}
            className="text-[13px] text-ink-2 underline"
          >
            Cancel
          </button>
        </div>
      )}

      {step === "join" && <Join onCancel={() => act(async () => (await disconnectThisMac(), setStep("idle")))} />}

      {s.account && step !== "join" && (
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-card">
          <div className="grid grid-cols-3 gap-3 px-4 py-3.5">
            <Stat label="Signed in as" value={s.account.email ?? "Your account"} />
            <Stat label="In the cloud" value={`${inCloud} of ${total} documents`} />
            <Stat label="Last synced" value={s.phase === "syncing" ? `Syncing, ${s.left} left` : s.account.syncedAt ? ago(s.account.syncedAt) : "Not yet"} />
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14px] font-semibold">New documents go to the cloud</span>
              <span className="text-[12.5px] text-ink-2">Off: new documents stay on this Mac until you turn them on one by one.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={s.account.newDocuments}
              aria-label="New documents go to the cloud"
              onClick={() => act(() => setNewDocumentsGoUp(!s.account?.newDocuments))}
              className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${s.account.newDocuments ? "bg-accent" : "bg-line-strong"}`}
            >
              <span className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-[left] ${s.account.newDocuments ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14px] font-semibold">Only on this Mac: {local}</span>
              <span className="text-[12.5px] text-ink-2">Turn the cloud off for a document from its tab or its card's menu in the Library.</span>
            </span>
            <Link to="/" className="text-[13px] font-semibold text-link underline">
              Library
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {s.error && <span className="w-full text-[12.5px] text-danger">{s.error}</span>}
            <button type="button" disabled={s.phase === "syncing"} onClick={syncNow} className={secondary}>
              <CloudCheck aria-hidden className="size-4" /> Sync now
            </button>
            <span className="flex-1" />
            <button type="button" disabled={busy} onClick={() => act(disconnectThisMac)} className={secondary}>
              Disconnect this Mac
            </button>
            <DeleteCopy busy={busy} onDelete={() => act(deleteCloudCopy)} />
          </div>
          <p className="m-0 px-4 py-3 text-[12px] text-ink-2">
            Disconnecting stops syncing; everything stays on this Mac and the cloud copy stays for your browsers. Deleting removes every locked copy from the cloud.
          </p>
          {err && <div className="px-4 py-3">{err}</div>}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 flex-col rounded-lg bg-ground px-3 py-2">
      <span className="text-[11.5px] text-ink-2">{label}</span>
      <span className="truncate text-[13.5px] font-medium">{value}</span>
    </span>
  );
}

/** Asks once more before deleting the cloud copy. */
function DeleteCopy({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  return sure ? (
    <span className="flex items-center gap-2">
      <span className="text-[12.5px] text-danger">Delete every locked copy?</span>
      <button type="button" disabled={busy} onClick={onDelete} className="rounded-lg bg-danger px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
        {busy ? "Deleting…" : "Delete"}
      </button>
      <button type="button" onClick={() => setSure(false)} className="text-[13px] text-ink-2 underline">
        Keep
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => setSure(true)} className="rounded-lg border border-danger px-3.5 py-2 text-[13px] font-semibold text-danger">
      Delete the cloud copy…
    </button>
  );
}

/** The account already has a cloud library, locked with another key: join it with that library's recovery key. */
function Join({ onCancel }: { onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-card px-4 py-4">
      <span className="text-[16px] font-semibold">This account already has a cloud library</span>
      <span className="text-[13px] text-ink-2">
        It was started somewhere else, with another key. A Mac and a cloud library share one key, so type that library's recovery key to join it.
      </span>
      <label htmlFor="join-key" className="text-[12.5px] font-semibold">
        Recovery key of the cloud library
      </label>
      <textarea
        id="join-key"
        rows={2}
        value={code}
        onChange={(e) => setCode(e.currentTarget.value)}
        placeholder="XXXX-XXXX-XXXX-…"
        spellCheck={false}
        className="resize-none rounded-lg border border-line-strong bg-card px-3 py-2.5 text-center font-mono text-[14px] tracking-wide uppercase outline-none focus:border-ink-2"
      />
      <ul className="m-0 flex flex-col gap-1 rounded-lg bg-ground px-4 py-3 pl-8 text-[12.5px] text-page-ink">
        <li>Your documents on this Mac are added to the cloud library; nothing is lost on either side.</li>
        <li>This Mac re-locks its library with that key, so one recovery key opens both. A copy of the library from before is kept beside it.</li>
        <li>Your Mac's old recovery key stops working. Voidcat restarts when it's done.</li>
      </ul>
      {error && <p className="m-0 text-[12.5px] text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-[13px] text-ink-2 underline">
          Use another account
        </button>
        <span className="flex-1" />
        <button
          type="button"
          disabled={busy || code.replace(/[^a-z0-9]/gi, "").length < 50}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await joinCloudLibrary(code);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
          className={primary}
        >
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <KeyRound aria-hidden className="size-4" />} Join and sync
        </button>
      </div>
    </div>
  );
}
