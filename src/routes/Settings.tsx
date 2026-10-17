import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { BellRing, Check, EyeOff, Monitor, Moon, ScanFace, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { hasLibrary } from "../lib/library";
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
        <span className="text-sm text-ink-2">Saved on this Mac.</span>
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
    </div>
  );
}
