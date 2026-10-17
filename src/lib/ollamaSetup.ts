import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { LOCAL_MODEL, OLLAMA } from "./extract";
import { hasLibrary } from "./library";

/**
 * Getting the local model without Terminal: Voidcat checks whether Ollama is installed and running and whether the
 * model is there, opens Ollama's download page or the app, and asks Ollama to download the model with a progress bar.
 */

export type OllamaState = "checking" | "missing" | "installed" | "no-model" | "ready";

export async function ollamaState(): Promise<OllamaState> {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`);
    if (res.ok) {
      const { models } = (await res.json()) as { models?: { name: string }[] };
      return models?.some((m) => m.name === LOCAL_MODEL || m.name === `${LOCAL_MODEL}:latest`) ? "ready" : "no-model";
    }
  } catch {
    /* not running */
  }
  return hasLibrary && (await invoke<boolean>("ollama_installed")) ? "installed" : "missing";
}

export const downloadOllama = () => openUrl("https://ollama.com/download");
export const openOllama = () => invoke<void>("open_ollama");

/** Asks Ollama to download the local model; `progress` gets 0–1 as the files arrive. */
export async function pullModel(progress: (share: number) => void) {
  const res = await fetch(`${OLLAMA}/api/pull`, { method: "POST", body: JSON.stringify({ model: LOCAL_MODEL, stream: true }) });
  if (!res.ok || !res.body) throw new Error(`Ollama couldn't start the download (${res.status}).`);
  const parts = new Map<string, { total: number; completed: number }>();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest += value;
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const m = JSON.parse(line) as { status?: string; digest?: string; total?: number; completed?: number; error?: string };
      if (m.error) throw new Error(m.error);
      if (m.digest && m.total) parts.set(m.digest, { total: m.total, completed: m.completed ?? 0 });
      let total = 0;
      let completed = 0;
      for (const p of parts.values()) {
        total += p.total;
        completed += p.completed;
      }
      if (total) progress(completed / total);
      if (m.status === "success") progress(1);
    }
  }
}

/** The setup state, checked again every few seconds until the model is ready (installing Ollama happens outside). */
export function useOllamaSetup() {
  const [state, setState] = useState<OllamaState>("checking");
  const [share, setShare] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const check = useCallback(() => ollamaState().then(setState), []);

  useEffect(() => {
    check();
    if (state === "ready" || share !== null) return;
    const timer = setInterval(check, 3000);
    return () => clearInterval(timer);
  }, [check, state, share]);

  const pull = async () => {
    setError(null);
    setShare(0);
    try {
      await pullModel(setShare);
      await check();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setShare(null);
    }
  };
  return { state, share, error, pull };
}
