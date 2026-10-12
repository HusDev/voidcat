import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";

/**
 * Cloud models through OpenRouter. Every request is routed only to providers that keep nothing (zero data retention)
 * and don't collect data, and every request carries only text the privacy layer has already masked.
 */

export type CloudModel = { id: string; name: string; created: number; promptPrice: number; completionPrice: number };

const MODEL_KEY = "safebox.cloudModel";

export function savedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
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
export const defaultModel = (models: CloudModel[]) => models.find((m) => m.id.startsWith("anthropic/claude-sonnet"))?.id ?? models[0]?.id ?? null;

export const SYSTEM = `You answer questions about the user's own documents and facts, which are given to you below.
Personal details have been replaced with placeholders such as [PERSON_1], [ID_2] or [DATE_3]. Use the placeholders exactly as written when you refer to those details; they are turned back into the real values on the user's computer. Never try to guess what a placeholder stands for.
Notes tell you roughly how far each date is from today; use them to reason about deadlines.
Answer from the documents. If they don't contain the answer, say so. Be concise and practical. Use Markdown: a one-line direct answer first, then short bullet points.`;

/** Streams an answer from the chosen model. `prompt` must already be masked. */
export function askCloud({ apiKey, model, prompt }: { apiKey: string; model: string; prompt: string }) {
  const openrouter = createOpenRouter({ apiKey, headers: { "X-Title": "SafeBox" } });
  return streamText({
    model: openrouter(model, { provider: { zdr: true, data_collection: "deny" } }),
    system: SYSTEM,
    prompt,
  });
}
