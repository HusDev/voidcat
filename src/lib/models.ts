import type { Turn } from "./cloud";
import { LOCAL_MODEL, OLLAMA } from "./extract";
import { TOOLS_HELP, ollamaTools, todayLine } from "./tools";

/** Which model answers in Ask: one on this Mac (Ollama) or a cloud model through OpenRouter. */

export type AskModel = { provider: "local" | "cloud"; id: string };
export type LocalModel = { id: string; size: string };

const KEY = "voidcat.askModel";

export function savedAskModel(): AskModel | null {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return m && (m.provider === "local" || m.provider === "cloud") && typeof m.id === "string" ? m : null;
  } catch {
    return null;
  }
}

export function saveAskModel(m: AskModel) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* the choice just isn't remembered */
  }
}

/** Chat models installed in Ollama, or null when Ollama isn't running. */
export async function listLocalModels(): Promise<LocalModel[] | null> {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`);
    if (!res.ok) return null;
    const body = (await res.json()) as { models: { name: string; details?: { parameter_size?: string }; capabilities?: string[] }[] };
    return body.models
      .filter((m) => !m.capabilities || m.capabilities.includes("completion"))
      .map((m) => ({ id: m.name, size: m.details?.parameter_size ?? "" }))
      .sort((a, b) => (a.id === LOCAL_MODEL ? -1 : b.id === LOCAL_MODEL ? 1 : a.id.localeCompare(b.id)));
  } catch {
    return null;
  }
}

export const LOCAL_SYSTEM = `You answer questions about the user's own documents and facts, which are given to you below. You run on the user's computer, so you see the real values.
Notes tell you roughly how far each date is from today; use them to reason about deadlines.
Answer only what was asked. The documents and facts are background for answering, not something to recite: never list or summarise them unless the user asks for that. If the message is a greeting, thanks or small talk, reply in one short friendly sentence and offer help, without any facts.
Answer from the documents. If they don't contain the answer, say so. Be concise and practical. Use Markdown: a one-line direct answer first, then short bullet points only when they help.`;

export type LocalChunk = { text: string } | { call: { name: string; input: unknown } };

/** Streams an answer from a model on this Mac (text, and any tool call). Nothing leaves the computer, so the messages are not masked. */
export async function* askLocalModel(model: string, messages: Turn[]): AsyncGenerator<LocalChunk> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      think: false,
      options: { num_ctx: 16384 },
      tools: ollamaTools,
      messages: [{ role: "system", content: `${LOCAL_SYSTEM}\n${todayLine()}\n${TOOLS_HELP}` }, ...messages],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`The local model didn't answer (${res.status}). Is Ollama running?`);
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
      const chunk = JSON.parse(line) as { message?: { content?: string; tool_calls?: { function: { name: string; arguments: unknown } }[] }; error?: string };
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.message?.content) yield { text: chunk.message.content };
      for (const c of chunk.message?.tool_calls ?? []) yield { call: { name: c.function.name, input: c.function.arguments } };
    }
  }
}
