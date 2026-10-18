import { onAuthStateChanged, type User } from "firebase/auth";
import { Check, Copy, KeyRound, LoaderCircle, LogIn, Mail } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Logo } from "../components/Logo";
import { createLibrary, forgetThisBrowser, libraryState, unlockLibrary } from "./account";
import { emailLinkReturn, finishEmailLink, firebase, sendEmailLink, signInWithGoogle, signOutOfCloud } from "./firebase";
import type { Keys } from "./vault";
import { openWebLibrary, type WebLibrary } from "./webLibrary";

/** The signed-in, unlocked cloud library the app runs on in a browser. */
export type CloudSession = { user: User; keys: Keys; library: WebLibrary; signOut: () => Promise<void>; forget: () => Promise<void> };
const CloudContext = createContext<CloudSession | null>(null);
export const useCloud = () => useContext(CloudContext);

type Step = { kind: "loading" } | { kind: "signed-out" } | { kind: "email-sent"; email: string } | { kind: "confirm-email" } | { kind: "new" } | { kind: "show-code"; code: string; keys: Keys } | { kind: "locked" } | { kind: "ready"; keys: Keys };

const button =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40";

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ground px-6 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <Logo size={52} onPage />
        <h1 className="m-0 text-[28px] font-light">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** Loads and unlocks the records, then shows the app on them. */
function OpenLibrary({ user, keys, children }: { user: User; keys: Keys; children: ReactNode }) {
  const [library, setLibrary] = useState<WebLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let open: WebLibrary | null = null;
    let gone = false;
    openWebLibrary(user.uid, keys).then(
      (l) => {
        if (gone) return l.close();
        open = l;
        setLibrary(l);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      gone = true;
      open?.close();
    };
  }, [user.uid, keys]);
  if (!library)
    return (
      <Screen title="Opening your library">
        {error ? <p className="m-0 text-[13.5px] text-danger">{error}</p> : <LoaderCircle aria-hidden className="size-5 animate-spin text-ink-2" />}
      </Screen>
    );
  const session: CloudSession = {
    user,
    keys,
    library,
    signOut: () => signOutOfCloud(),
    forget: async () => {
      await forgetThisBrowser(user.uid);
      await signOutOfCloud();
    },
  };
  return <CloudContext.Provider value={session}>{children}</CloudContext.Provider>;
}

/**
 * In a browser, Voidcat runs on a cloud library: sign in with Google (who you are), then create a library or unlock
 * this browser with the recovery key (what opens it). Only then does the app appear.
 */
export function CloudGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");

  // Back from a sign-in email: finish signing in, or ask for the address when the link was opened elsewhere.
  useEffect(() => {
    const back = emailLinkReturn();
    if (!back) return;
    if (back.email) finishEmailLink(back.email).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    else setStep({ kind: "confirm-email" });
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(firebase().auth, async (u) => {
        setUser(u);
        setError(null);
        if (!u) return setStep((s) => (s.kind === "confirm-email" || s.kind === "email-sent" ? s : { kind: "signed-out" }));
        try {
          const s = await libraryState(u.uid);
          setStep(s.kind === "none" ? { kind: "new" } : s.kind === "locked" ? { kind: "locked" } : { kind: "ready", keys: s.keys });
        } catch (e) {
          setError(String(e));
          setStep({ kind: "signed-out" });
        }
      }),
    [],
  );

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (step.kind === "ready" && user) return <OpenLibrary user={user} keys={step.keys}>{children}</OpenLibrary>;

  const err = error && <p className="m-0 text-[13.5px] text-danger">{error}</p>;

  if (step.kind === "loading") return <Screen title="Voidcat"><LoaderCircle aria-hidden className="size-5 animate-spin text-ink-2" /></Screen>;

  const emailField = (
    <>
      <label htmlFor="cloud-email" className="sr-only">
        Email address
      </label>
      <input
        id="cloud-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.currentTarget.value)}
        placeholder="you@example.com"
        className="w-full rounded-xl border border-line-strong bg-card px-4 py-2.5 text-[15px] outline-none focus:border-ink-2"
      />
    </>
  );

  if (step.kind === "signed-out")
    return (
      <Screen title="Your papers, locked">
        <p className="m-0 text-[14.5px] text-ink-2">
          Voidcat keeps your documents encrypted on your devices. The cloud only ever stores them locked. Sign in to open your library in this browser.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await sendEmailLink(email.trim());
              setStep({ kind: "email-sent", email: email.trim() });
            });
          }}
          className="flex w-full flex-col gap-2.5"
        >
          {emailField}
          <button type="submit" disabled={busy || !email.includes("@")} className={button}>
            {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Mail aria-hidden className="size-4" />} Email me a sign-in link
          </button>
        </form>
        <span className="flex w-full items-center gap-3 text-[12.5px] text-ink-2">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => act(async () => void (await signInWithGoogle()))}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-card px-5 py-2.5 text-[14px] font-semibold hover:border-ink-2 disabled:opacity-40"
        >
          <LogIn aria-hidden className="size-4" /> Sign in with Google
        </button>
        <p className="m-0 text-[12px] text-ink-2">The email link keeps your Google account out of it. Either way, nobody but you can open your documents.</p>
        {err}
      </Screen>
    );

  if (step.kind === "email-sent")
    return (
      <Screen title="Check your email">
        <p className="m-0 text-[14.5px] text-ink-2">
          We sent a sign-in link to <b className="text-ink">{step.email}</b>. Open it in this browser to continue. It works once and expires after a while; check spam if it isn't there.
        </p>
        <button type="button" onClick={() => setStep({ kind: "signed-out" })} className="text-[13px] text-ink-2 underline">
          Use a different email
        </button>
      </Screen>
    );

  if (step.kind === "confirm-email")
    return (
      <Screen title="Confirm your email">
        <p className="m-0 text-[14.5px] text-ink-2">This link was opened in a different browser. Type the email it was sent to, so we know it's you.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(() => finishEmailLink(email.trim()));
          }}
          className="flex w-full flex-col gap-2.5"
        >
          {emailField}
          <button type="submit" disabled={busy || !email.includes("@")} className={button}>
            Sign in
          </button>
        </form>
        {err}
      </Screen>
    );

  if (step.kind === "new" && user)
    return (
      <Screen title="Create your library">
        <p className="m-0 text-[14.5px] text-ink-2">
          Signed in as <b className="text-ink">{user.email}</b>. Voidcat makes a key that locks everything before it leaves this browser. You'll get a recovery key to save next.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const made = await createLibrary(user.uid);
              setStep({ kind: "show-code", code: made.code, keys: made.keys });
            })
          }
          className={button}
        >
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <KeyRound aria-hidden className="size-4" />} Create my library
        </button>
        {err}
        <button type="button" onClick={() => signOutOfCloud()} className="text-[13px] text-ink-2 underline">
          Use another account
        </button>
      </Screen>
    );

  if (step.kind === "show-code")
    return (
      <Screen title="Save your recovery key">
        <p className="m-0 text-[14.5px] text-ink-2">
          This is the only way to open your library in another browser, on a new Mac, or if this browser forgets it. Nobody else has it, not even Voidcat.
        </p>
        <p className="m-0 w-full select-all break-all rounded-xl border border-line bg-card px-4 py-3 font-mono text-[15px] leading-relaxed tracking-wide">{step.code}</p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(step.code);
              setCopied(true);
            } catch {
              /* the key is selectable */
            }
          }}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
        >
          {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.currentTarget.checked)} className="size-4 accent-accent" />
          I've saved it in my password manager or on paper
        </label>
        <button type="button" disabled={!saved} onClick={() => setStep({ kind: "ready", keys: step.keys })} className={button}>
          Open my library
        </button>
      </Screen>
    );

  return (
    <Screen title="Unlock this browser">
      <p className="m-0 text-[14.5px] text-ink-2">
        Signed in as <b className="text-ink">{user?.email}</b>. Type your recovery key once; this browser remembers it until you choose "Forget this browser".
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (user) act(async () => setStep({ kind: "ready", keys: await unlockLibrary(user.uid, code) }));
        }}
        className="flex w-full flex-col items-center gap-3"
      >
        <label htmlFor="cloud-recovery" className="sr-only">
          Recovery key
        </label>
        <textarea
          id="cloud-recovery"
          rows={3}
          value={code}
          onChange={(e) => setCode(e.currentTarget.value)}
          placeholder="XXXX-XXXX-XXXX-…"
          spellCheck={false}
          className="w-full resize-none rounded-xl border border-line-strong bg-card px-4 py-3 text-center font-mono text-[15px] uppercase tracking-wide outline-none focus:border-ink-2"
        />
        <button type="submit" disabled={busy || code.replace(/[^a-z0-9]/gi, "").length < 50} className={button}>
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <KeyRound aria-hidden className="size-4" />} Unlock
        </button>
      </form>
      {err}
      <button type="button" onClick={() => signOutOfCloud()} className="text-[13px] text-ink-2 underline">
        Use another account
      </button>
    </Screen>
  );
}
