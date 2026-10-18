import { KeyRound, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Logo } from "../components/Logo";
import { recoverLibrary } from "../lib/library";

/** Shown instead of the app when the library's key is missing from the Keychain (a new Mac, a reset Keychain). */
export function Recover() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await recoverLibrary(code);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <main data-tauri-drag-region className="grid min-h-screen place-items-center bg-ground px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          unlock();
        }}
        className="flex w-full max-w-md flex-col items-center gap-4 text-center"
      >
        <Logo size={52} onPage />
        <h1 className="m-0 text-[28px] font-light">Unlock your library</h1>
        <p className="m-0 text-[14.5px] text-ink-2">
          Your documents are here, but this Mac doesn't have their key. Type the recovery key you saved from Settings: 13 groups of four letters and numbers.
        </p>
        <label htmlFor="recovery-code" className="sr-only">
          Recovery key
        </label>
        <textarea
          id="recovery-code"
          rows={3}
          value={code}
          onChange={(e) => setCode(e.currentTarget.value)}
          placeholder="XXXX-XXXX-XXXX-…"
          spellCheck={false}
          className="w-full resize-none rounded-xl border border-line-strong bg-card px-4 py-3 text-center font-mono text-[15px] uppercase tracking-wide outline-none focus:border-ink-2"
        />
        {error && <p className="m-0 text-[13.5px] text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.replace(/[^a-z0-9]/gi, "").length < 50}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40"
        >
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <KeyRound aria-hidden className="size-4" />}
          Unlock
        </button>
      </form>
    </main>
  );
}
