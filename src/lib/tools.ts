import { tool } from "ai";
import { z } from "zod";

/**
 * Tools the model in Ask can call. The model only proposes: a tool call becomes a card in the chat, and nothing is
 * saved or sent until you click it.
 */

export const BUNDLE = "bundle_documents";

const description = "Put documents from the user's library into one zip file the user can save. Use D-numbers from the library list only.";

export const BundleInput = z.object({
  documents: z.array(z.string()).min(1).describe("D-numbers of the documents, e.g. ['D3', 'D7']"),
  name: z.string().describe("A short name for the zip, e.g. 'Residency papers'"),
});

/** Added to the system prompt so the model knows when to use the tool. */
export const TOOLS_HELP = `You can put documents together for the user: when they ask for documents or files (to download, send, share or collect), call ${BUNDLE} with the D-numbers of the documents that match from the library list and a short name for the zip. Then say in one short sentence which documents you chose. Only use D-numbers that are in the list. The zip only exists if you call ${BUNDLE}: never say you made, bundled or zipped anything without calling it.`;

export { todayLine } from "./askPrompt";

export const cloudTools = { [BUNDLE]: tool({ description, inputSchema: BundleInput }) };

/** The same tool in Ollama's format. */
export const ollamaTools = [{ type: "function", function: { name: BUNDLE, description, parameters: z.toJSONSchema(BundleInput) } }];

/** One library document as the model sees it, by its D-number (position + 1). */
export type CatalogEntry = { id: string; title: string; folder: string | null; type: string | null };
export type Bundle = { name: string; ids: string[]; titles: string[] };

/** The library list sent with each question: "D1 | title | folder | type". */
export const catalogLines = (catalog: CatalogEntry[]) => catalog.map((d, i) => `D${i + 1} | ${d.title} | ${d.folder ?? "Not filed"} | ${d.type ?? ""}`).join("\n");

/** The model's tool input turned into real documents; D-numbers it made up are dropped. Null when nothing is left. */
export function resolveBundle(input: unknown, catalog: CatalogEntry[], unmask: (s: string) => string = (s) => s): Bundle | null {
  const parsed = BundleInput.safeParse(input);
  if (!parsed.success) return null;
  const picked: CatalogEntry[] = [];
  for (const ref of parsed.data.documents) {
    const n = Number(/^\s*D?(\d+)\s*$/i.exec(ref)?.[1]);
    const doc = catalog[n - 1];
    if (doc && !picked.includes(doc)) picked.push(doc);
  }
  if (!picked.length) return null;
  return { name: unmask(parsed.data.name).trim() || "Documents", ids: picked.map((d) => d.id), titles: picked.map((d) => d.title) };
}
