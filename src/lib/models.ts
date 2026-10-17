import type { Turn } from "./cloud";
import { OLLAMA, readingModel } from "./extract";
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
      .sort((a, b) => (a.id === readingModel() ? -1 : b.id === readingModel() ? 1 : a.id.localeCompare(b.id)));
  } catch {
    return null;
  }
}

export const LOCAL_SYSTEM = `You answer questions about the user's own documents and facts, which are given to you below. You run on the user's computer, so you see the real values.
Notes tell you roughly how far each date is from today; use them to reason about deadlines.
Answer only what was asked. The documents and facts are background for answering, not something to recite: never list or summarise them unless the user asks for that. If the message is a greeting, thanks or small talk, reply in one short friendly sentence and offer help, without any facts.
Answer from the documents. If they don't contain the answer, say so. Be concise and practical. Use Markdown: a one-line direct answer first, then short bullet points only when they help.`;

export type LocalChunk = { text: string } | { thinking: string } | { call: { name: string; input: unknown } };

const THINK_KEY = "voidcat.thinkFirst";
/** "Think first": thinking models reason before answering (better answers, slower start). On unless turned off. */
export function thinkFirst() {
  try {
    return localStorage.getItem(THINK_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setThinkFirst(on: boolean) {
  try {
    localStorage.setItem(THINK_KEY, on ? "on" : "off");
  } catch {
    /* not remembered */
  }
}

const thinkers = new Map<string, Promise<boolean>>();
/** Whether a model on this Mac can think (Ollama lists "thinking" among its capabilities); asked once per model. */
export function canThink(model: string) {
  let known = thinkers.get(model);
  if (!known) {
    known = fetch(`${OLLAMA}/api/show`, { method: "POST", body: JSON.stringify({ model }) })
      .then((r) => r.json() as Promise<{ capabilities?: string[] }>)
      .then((d) => !!d.capabilities?.includes("thinking"))
      .catch(() => false);
    thinkers.set(model, known);
  }
  return known;
}

/** Streams an answer from a model on this Mac (text, and any tool call). Nothing leaves the computer, so the messages are not masked. */
export async function* askLocalModel(model: string, messages: Turn[]): AsyncGenerator<LocalChunk> {
  const think = thinkFirst() && (await canThink(model));
  // Qwen3 (not 3.5) ignores Ollama's think: false; its own switch is "/no_think" at the end of the message.
  const sent = !think && /^qwen3(?![.\d])/i.test(model) ? messages.map((m, k) => (k === messages.length - 1 && m.role === "user" ? { ...m, content: `${m.content}\n\n/no_think` } : m)) : messages;
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      // A thinking model gets to think, and Ollama streams the reasoning apart from the answer so it shows live in
      // the thinking box. Asked not to, some (qwen3) think anyway inside the answer, marked only by a closing </think>.
      think,
      options: { num_ctx: 16384 },
      tools: ollamaTools,
      messages: [{ role: "system", content: `${LOCAL_SYSTEM}\n${todayLine()}\n${TOOLS_HELP}` }, ...sent],
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
      const chunk = JSON.parse(line) as { message?: { content?: string; thinking?: string; tool_calls?: { function: { name: string; arguments: unknown } }[] }; error?: string };
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.message?.thinking) yield { thinking: chunk.message.thinking };
      if (chunk.message?.content) yield { text: chunk.message.content };
      for (const c of chunk.message?.tool_calls ?? []) yield { call: { name: c.function.name, input: c.function.arguments } };
    }
  }
}
