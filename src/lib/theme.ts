import { useEffect, useState } from "react";

/** The app's theme: follow the Mac (system), or always light or dark. Remembered on this Mac. */
export type Theme = "system" | "light" | "dark";
const KEY = "voidcat.theme";

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Sets `data-theme` on the page; index.css switches every colour token from it. */
export function applyTheme(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* the choice just isn't remembered */
    }
  }, [theme]);
  return [theme, setTheme] as const;
}
