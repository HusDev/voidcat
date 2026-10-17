/// <reference lib="webworker" />
// Runs OpenAI's privacy-filter model (Apache 2.0) on this Mac, away from the screen's thread. The model is downloaded
// once from Hugging Face and kept in the app's cache; the text it reads never leaves the computer.
import { env, pipeline } from "@huggingface/transformers";

export const MODEL = "openai/privacy-filter";

env.allowLocalModels = false;
// The engine's own files ship with the app under /ort/ (see vite.config.ts) instead of coming from a CDN.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = "/ort/";

export type ToWorker = { type: "load" } | { type: "find"; id: number; text: string };
export type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; device: string }
  | { type: "failed"; error: string }
  | { type: "found"; id: number; spans: { group: string; word: string; score: number }[] }
  | { type: "error"; id: number; error: string };

type Span = { entity_group: string; word: string; score: number };
type Classifier = (text: string, options: { aggregation_strategy: string }) => Promise<Span[]>;

let classifier: Promise<Classifier> | null = null;
const post = (m: FromWorker) => postMessage(m);

function load() {
  if (classifier) return classifier;
  const files = new Map<string, { loaded: number; total: number }>();
  const progress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== "progress" || !p.file) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    post({ type: "progress", loaded, total });
  };
  const device = "gpu" in navigator ? "webgpu" : "wasm";
  classifier = (pipeline("token-classification", MODEL, { device, dtype: "q4", progress_callback: progress }) as Promise<unknown> as Promise<Classifier>).then(
    (c) => {
      post({ type: "ready", device });
      return c;
    },
    (e) => {
      classifier = null;
      post({ type: "failed", error: String(e?.message ?? e) });
      throw e;
    },
  );
  return classifier;
}

onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === "load") {
    load().catch(() => {});
    return;
  }
  try {
    const c = await load();
    const spans = await c(m.text, { aggregation_strategy: "simple" });
    post({ type: "found", id: m.id, spans: spans.map((s) => ({ group: s.entity_group, word: s.word, score: s.score })) });
  } catch (err) {
    post({ type: "error", id: m.id, error: String((err as Error)?.message ?? err) });
  }
};
