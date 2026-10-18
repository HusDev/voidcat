import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Archive, BellRing, Cloud, Check, Copy, EyeOff, KeyRound, LoaderCircle, Monitor, Moon, ScanFace, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useCloud } from "../cloud/CloudGate";
import { MacCloud } from "../components/MacCloud";
import { exportEverything, onMac as hasLibrary, recoveryCode } from "../lib/library";
import { MODEL_SIZE, setNameCheck, useNameCheck } from "../lib/nameCheck";
import { type Theme, useTheme } from "../lib/theme";
import { useVeil } from "../lib/veil";

const THEMES: { id: Theme; name: string; note: string; Icon: typeof Sun }[] = [
  { id: "system", name: "Auto", note: "Follows your Mac", Icon: Monitor },
  { id: "light", name: "Light", note: "Always light", Icon: Sun },
  { id: "dark", name: "Dark", note: "Always dark", Icon: Moon },
];

/** A small drawing of the app in a theme: dark sidebar, then the workspace in that theme's colours. */
function Preview({ id }: { id: Theme }) {
  const half = (ground: string, card: string, line: string) => (
    <span className="flex flex-1 flex-col gap-1.5 p-2" style={{ background: ground }}>
      <span className="h-1.5 w-1/2 rounded-full" style={{ background: line }} />
      <span className="h-5 rounded" style={{ background: card }} />
      <span className="h-5 rounded" style={{ background: card }} />
    </span>
  );
  const light = half("#f4f3f8", "#ffffff", "#d3d0de");
  const dark = half("#0b0b0f", "#1a1922", "#34323f");
  return (
    <span aria-hidden className="flex h-24 overflow-hidden rounded-lg border border-line">
      <span className="flex w-9 flex-col gap-1.5 bg-[#08080b] p-2">
        <span className="size-2 rounded-full bg-void" />
        <span className="h-1 rounded-full bg-white/20" />
        <span className="h-1 rounded-full bg-white/20" />
      </span>
      {id === "light" ? light : id === "dark" ? dark : (
        <span className="flex flex-1">
          {light}
          {dark}
        </span>
      )}
    </span>
  );
}

/** "Open at login": with the menu bar cat, reminders keep arriving after a restart. */
function useOpenAtLogin() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (hasLibrary) isEnabled().then(setOn, () => setOn(false));
  }, []);
  const toggle = async () => {
    await (on ? disable() : enable());
    setOn(await isEnabled());
  };
  return [on, toggle] as const;
}

/** Your data: one zip of every document, and the recovery key that opens the library without the Keychain. */
function YourData() {
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const exportAll = async () => {
    setExporting(true);
    setExported(null);
    try {
      const n = await exportEverything();
      if (n !== null) setExported(`Saved ${n} document${n === 1 ? "" : "s"}. The zip isn't encrypted: keep it somewhere safe.`);
    } catch (e) {
      setExported(`Couldn't export: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-labelledby="your-data" className="flex flex-col gap-3">
      <h2 id="your-data" className="m-0 text-[15px] font-semibold">
        Your data
      </h2>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Archive aria-hidden className="size-4.5 shrink-0 text-ink-2" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold">Export everything</span>
            <span className="text-[12.5px] text-ink-2">All your documents as one zip, sorted into their folders. A backup you control.</span>
          </span>
          <button
            type="button"
            disabled={!hasLibrary || exporting}
            onClick={exportAll}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold hover:border-ink-2 disabled:opacity-40"
          >
            {exporting && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
            Export…
          </button>
        </div>
        {exported && <p className="m-0 pl-7.5 text-[12.5px] text-ink-2">{exported}</p>}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
        <div className="flex items-center gap-3">
          <KeyRound aria-hidden className="size-4.5 shrink-0 text-ink-2" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold">Recovery key</span>
            <span className="text-[12.5px] text-ink-2">
              Your library is encrypted with a key in this Mac's Keychain. If that's ever lost (a new Mac, a reset Keychain), this key is the only way back in.
            </span>
          </span>
          <button
            type="button"
            disabled={!hasLibrary}
            onClick={async () => setCode(code ? null : await recoveryCode())}
            className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold hover:border-ink-2 disabled:opacity-40"
          >
            {code ? "Hide" : "Show"}
          </button>
        </div>
        {code && (
          <div className="flex flex-col gap-2 pl-7.5">
            <p className="m-0 select-all break-all rounded-lg bg-ground px-3 py-2.5 font-mono text-[14px] leading-relaxed tracking-wide">{code}</p>
            <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* the key is selectable */
                  }
                }}
                className="flex items-center gap-1.5 font-semibold text-ink hover:underline"
              >
                {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <span>Write it down or keep it in your password manager. Anyone with it and your library folder can read your documents.</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** In the browser: the cloud account this library is opened with. */
function CloudAccount() {
  const cloud = useCloud();
  if (!cloud) return null;
  return (
    <section aria-labelledby="cloud-account" className="flex flex-col gap-3">
      <h2 id="cloud-account" className="m-0 text-[15px] font-semibold">
        Cloud account
      </h2>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
        <Cloud aria-hidden className="size-4.5 shrink-0 text-ink-2" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-semibold">{cloud.user.email}</span>
          <span className="text-[12.5px] text-ink-2">Your library is locked before it leaves this browser. Sign out keeps this browser unlocked for next time; Forget removes its key.</span>
        </span>
        <button type="button" onClick={cloud.signOut} className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold hover:border-ink-2">
          Sign out
        </button>
        <button type="button" onClick={cloud.forget} className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-danger hover:border-danger">
          Forget this browser
        </button>
      </div>
    </section>
  );
}

export function Settings() {
  const [theme, setTheme] = useTheme();
  const veil = useVeil();
  const [atLogin, toggleAtLogin] = useOpenAtLogin();
  const check = useNameCheck();
  const pct = check.total ? Math.round((check.loaded / check.total) * 100) : 0;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[30px] font-light tracking-tight">Settings</h1>
        <span className="text-sm text-ink-2">{hasLibrary ? "Saved on this Mac." : "Saved in this browser."}</span>
      </header>

      <section aria-labelledby="appearance" className="flex flex-col gap-3">
        <h2 id="appearance" className="m-0 text-[15px] font-semibold">
          Appearance
        </h2>
        <div role="radiogroup" aria-labelledby="appearance" className="grid grid-cols-3 gap-3">
          {THEMES.map(({ id, name, note, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              onClick={() => setTheme(id)}
              className={`flex flex-col gap-2.5 rounded-xl border bg-card p-3 text-left ${theme === id ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-strong"}`}
            >
              <Preview id={id} />
              <span className="flex items-center gap-2">
                <Icon aria-hidden className="size-4 text-ink-2" />
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold">{name}</span>
                  <span className="text-[12.5px] text-ink-2">{note}</span>
                </span>
                {theme === id && <Check aria-hidden className="ml-auto size-4 text-accent" />}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="privacy" className="flex flex-col gap-3">
        <h2 id="privacy" className="m-0 text-[15px] font-semibold">
          Privacy
        </h2>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
          <EyeOff aria-hidden className="size-4.5 text-ink-2" />
          <span className="flex flex-1 flex-col">
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              Hide private details <kbd className="rounded border border-line-strong px-1.5 font-sans text-[11.5px] font-normal text-ink-2">⌘⇧H</kbd>
            </span>
            <span className="text-[12.5px] text-ink-2">Shows the placeholders the AI sees instead of real values, hides nationality, places and your first name, and blurs source pages. For screen recording.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={veil.on}
            aria-label="Hide private details"
            onClick={veil.toggle}
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${veil.on ? "bg-private" : "bg-line-strong"}`}
          >
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${veil.on ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
          <ScanFace aria-hidden className="size-4.5 text-ink-2" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold">Catch names the rules miss</span>
            <span className="text-[12.5px] text-ink-2">
              Before a question goes to a cloud model, OpenAI's privacy-filter model reads it on this Mac and masks any other names, addresses, emails, phone
              numbers and account numbers it finds. A {MODEL_SIZE} download, once.
            </span>
            {check.on && check.status === "downloading" && (
              <span className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-2">
                <span className="h-1.5 w-40 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
                </span>
                Downloading… {pct}%
              </span>
            )}
            {check.on && check.status === "ready" && <span className="mt-1 text-[12px] text-ok">Ready on this Mac.</span>}
            {check.on && check.status === "failed" && <span className="mt-1 text-[12px] text-danger">Couldn't load the model: {check.error}</span>}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={check.on}
            aria-label="Catch names the rules miss"
            disabled={!hasLibrary}
            onClick={() => setNameCheck(!check.on)}
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40 ${check.on ? "bg-private" : "bg-line-strong"}`}
          >
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${check.on ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
      </section>

      <CloudAccount />
      <MacCloud />

      {hasLibrary && <YourData />}

      {hasLibrary && (
      <section aria-labelledby="reminders" className="flex flex-col gap-3">
        <h2 id="reminders" className="m-0 text-[15px] font-semibold">
          Reminders
        </h2>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
          <BellRing aria-hidden className="size-4.5 text-ink-2" />
          <span className="flex flex-1 flex-col">
            <span className="text-[14px] font-semibold">Open Voidcat when you log in</span>
            <span className="text-[12.5px] text-ink-2">
              Closing the window keeps Voidcat in the menu bar, so calendar reminders still arrive. Quit from the cat in the menu bar or with ⌘Q.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!!atLogin}
            aria-label="Open Voidcat when you log in"
            disabled={atLogin === null}
            onClick={toggleAtLogin}
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40 ${atLogin ? "bg-accent" : "bg-line-strong"}`}
          >
            <span className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-[left] ${atLogin ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
      </section>
      )}
    </div>
  );
}
