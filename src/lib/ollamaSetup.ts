import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { OLLAMA, readingModel } from "./extract";
import { hasLibrary } from "./library";

/**
 * Getting the local model without Terminal: Voidcat checks whether Ollama is installed and running and whether the
 * model is there, opens Ollama's download page or the app, and asks Ollama to download the model with a progress bar.
 */

export type OllamaState = "checking" | "missing" | "installed" | "no-model" | "ready";
export type OllamaStatus = { state: OllamaState; installed: string[] };

const same = (a: string, b: string) => a === b || a === `${b}:latest`;
export const isInstalled = (installed: string[], id: string) => installed.some((n) => same(n, id));

/** Where the setup stands, and which models Ollama already has. "ready" = the reading model is installed. */
export async function ollamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`);
    if (res.ok) {
      const { models } = (await res.json()) as { models?: { name: string }[] };
      const installed = (models ?? []).map((m) => m.name);
      return { state: isInstalled(installed, readingModel()) ? "ready" : "no-model", installed };
    }
  } catch {
    /* not running */
  }
  return { state: hasLibrary && (await invoke<boolean>("ollama_installed")) ? "installed" : "missing", installed: [] };
}

export const ollamaState = async () => (await ollamaStatus()).state;

/** This Mac's memory in GB, to say which models fit. */
export const macMemory = () => (hasLibrary ? invoke<number>("mac_memory_gb") : Promise.resolve(16));

export const downloadOllama = () => openUrl("https://ollama.com/download");
export const openOllama = () => invoke<void>("open_ollama");

/** Asks Ollama to download a model (the reading model unless named); `progress` gets 0–1 as the files arrive. */
export async function pullModel(progress: (share: number) => void, model = readingModel()) {
  const res = await fetch(`${OLLAMA}/api/pull`, { method: "POST", body: JSON.stringify({ model, stream: true }) });
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
  const [status, setStatus] = useState<OllamaStatus>({ state: "checking", installed: [] });
  const [pulling, setPulling] = useState<{ model: string; share: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const check = useCallback(() => ollamaStatus().then(setStatus), []);

  useEffect(() => {
    check();
    if (status.state === "ready" || pulling) return;
    const timer = setInterval(check, 3000);
    return () => clearInterval(timer);
  }, [check, status.state, pulling]);

  /** Downloads `model` (the reading model unless named), then checks again. */
  const pull = async (model = readingModel()) => {
    setError(null);
    setPulling({ model, share: 0 });
    try {
      await pullModel((share) => setPulling({ model, share }), model);
      await check();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setPulling(null);
    }
  };
  return { ...status, share: pulling?.share ?? null, pulling: pulling?.model ?? null, error, pull, check };
}
