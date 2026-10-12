import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LIBRARY_CHANGED, listFacts } from "./library";
import { Masker } from "./privacy";

/**
 * "Hide private details": a switch for screen recording and screen sharing. While it's on, personal values are shown
 * as the same placeholders the AI sees ([PERSON_1], [ID_2]…), and long free text (source pages) is blurred.
 * Toggle with the eye in the sidebar or ⌘⇧H. Remembered between launches.
 */

type Veil = { on: boolean; toggle: () => void; mask: (text: string) => string };

const VeilContext = createContext<Veil>({ on: false, toggle: () => {}, mask: (t) => t });
const KEY = "voidcat.veil";

const read = () => {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
};

export function VeilProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(read);
  const [masker, setMasker] = useState(() => new Masker([]));

  // One masker for the whole app, built from the approved facts, so a value has the same placeholder on every screen.
  useEffect(() => {
    const refresh = () => listFacts("approved").then((facts) => setMasker(new Masker(facts)));
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, []);

  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem(KEY, v ? "off" : "on");
      } catch {
        /* not remembered */
      }
      return !v;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(() => ({ on, toggle, mask: (t: string) => masker.mask(t) }), [on, toggle, masker]);
  return <VeilContext.Provider value={value}>{children}</VeilContext.Provider>;
}

export const useVeil = () => useContext(VeilContext);

const PLACEHOLDER = /(\[(?:PERSON|ID|DATE|ADDRESS|EMAIL|PHONE|IBAN|PRIVATE)_\d+\])/;

/** Text with placeholders drawn as cyan chips. */
export function Placeholders({ text }: { text: string }) {
  return (
    <>
      {text.split(PLACEHOLDER).map((part, i) =>
        i % 2 ? (
          <span key={i} className="rounded bg-chip px-1 font-mono text-[0.9em] text-private">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A personal value: shown as is, or as its placeholder while private details are hidden. */
export function Private({ children }: { children: string }) {
  const { on, mask } = useVeil();
  return on ? <Placeholders text={mask(children)} /> : <>{children}</>;
}

/** Long free text: blurred while private details are hidden. */
export function Blurred({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { on } = useVeil();
  return (
    <div className={`${className} ${on ? "pointer-events-none select-none blur-[6px]" : ""}`} aria-hidden={on || undefined}>
      {children}
    </div>
  );
}
