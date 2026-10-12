import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";

/**
 * Cloud models through OpenRouter. Every request is routed only to providers that keep nothing (zero data retention)
 * and don't collect data, and every request carries only text the privacy layer has already masked.
 */

export type CloudModel = { id: string; name: string; created: number; promptPrice: number; completionPrice: number };

const MODEL_KEY = "safebox.cloudModel";
/** Used until the user picks another: strong at reading documents and reasoning about dates and rules. */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

export function savedModel(): string {
  try {
    const id = localStorage.getItem(MODEL_KEY);
    return id && !id.endsWith(":batch") ? id : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function saveModel(id: string) {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    /* the choice just isn't remembered */
  }
}

/** The public model list (no key, no personal data). Text models only, newest first. */
export async function listModels(): Promise<CloudModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`Could not load the model list (${res.status}).`);
  const body = (await res.json()) as {
    data: { id: string; name: string; created: number; pricing?: { prompt?: string; completion?: string }; architecture?: { output_modalities?: string[] } }[];
  };
  return body.data
    .filter((m) => (m.architecture?.output_modalities ?? ["text"]).includes("text"))
    // ":batch" variants answer hours later through a queue; they can't answer a question live.
    .filter((m) => !m.id.endsWith(":batch"))
    .map((m) => ({
      id: m.id,
      name: m.name,
      created: m.created,
      promptPrice: Number(m.pricing?.prompt ?? 0) * 1_000_000,
      completionPrice: Number(m.pricing?.completion ?? 0) * 1_000_000,
    }))
    .sort((a, b) => b.created - a.created);
}

/** A sensible default: the newest Claude Sonnet, else the newest model. */
export const defaultModel = (models: CloudModel[]) => (models.some((m) => m.id === DEFAULT_MODEL) ? DEFAULT_MODEL : (models[0]?.id ?? null));

export const SYSTEM = `You answer questions about the user's own documents and facts, which are given to you below.
Personal details have been replaced with placeholders such as [PERSON_1], [ID_2] or [DATE_3]. Use the placeholders exactly as written when you refer to those details; they are turned back into the real values on the user's computer. Never try to guess what a placeholder stands for.
Notes tell you roughly how far each date is from today; use them to reason about deadlines.
Answer from the documents. If they don't contain the answer, say so. Be concise and practical. Use Markdown: a one-line direct answer first, then short bullet points.`;

export type Turn = { role: "user" | "assistant"; content: string };

/** Streams an answer from the chosen model. Every message must already be masked. */
export function askCloud({ apiKey, model, messages }: { apiKey: string; model: string; messages: Turn[] }) {
  const openrouter = createOpenRouter({ apiKey, headers: { "X-Title": "SafeBox" } });
  return streamText({
    model: openrouter(model, { provider: { zdr: true, data_collection: "deny" } }),
    system: SYSTEM,
    messages,
  });
}
