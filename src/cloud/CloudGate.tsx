import { onAuthStateChanged, type User } from "firebase/auth";
import { Check, Copy, KeyRound, LoaderCircle, LogIn } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Logo } from "../components/Logo";
import { createLibrary, forgetThisBrowser, libraryState, unlockLibrary } from "./account";
import { firebase, signInWithGoogle, signOutOfCloud } from "./firebase";
import type { Keys } from "./vault";

/** The signed-in, unlocked cloud library the app runs on in a browser. */
export type CloudSession = { user: User; keys: Keys; signOut: () => Promise<void>; forget: () => Promise<void> };
const CloudContext = createContext<CloudSession | null>(null);
export const useCloud = () => useContext(CloudContext);

type Step = { kind: "loading" } | { kind: "signed-out" } | { kind: "new" } | { kind: "show-code"; code: string; keys: Keys } | { kind: "locked" } | { kind: "ready"; keys: Keys };

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

  useEffect(
    () =>
      onAuthStateChanged(firebase().auth, async (u) => {
        setUser(u);
        setError(null);
        if (!u) return setStep({ kind: "signed-out" });
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

  if (step.kind === "ready" && user) {
    const session: CloudSession = {
      user,
      keys: step.keys,
      signOut: () => signOutOfCloud(),
      forget: async () => {
        await forgetThisBrowser(user.uid);
        await signOutOfCloud();
      },
    };
    return <CloudContext.Provider value={session}>{children}</CloudContext.Provider>;
  }

  const err = error && <p className="m-0 text-[13.5px] text-danger">{error}</p>;

  if (step.kind === "loading") return <Screen title="Voidcat"><LoaderCircle aria-hidden className="size-5 animate-spin text-ink-2" /></Screen>;

  if (step.kind === "signed-out")
    return (
      <Screen title="Your papers, locked">
        <p className="m-0 text-[14.5px] text-ink-2">
          Voidcat keeps your documents encrypted on your devices. The cloud only ever stores them locked. Sign in to open your library in this browser.
        </p>
        <button type="button" disabled={busy} onClick={() => act(async () => void (await signInWithGoogle()))} className={button}>
          <LogIn aria-hidden className="size-4" /> Sign in with Google
        </button>
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
