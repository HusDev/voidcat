import { type Turn, askCloud } from "./cloud";
import { type Document, type Fact, type Hit, documentPages, getSecret, listDocuments, listFacts, searchLibrary } from "./library";
import { type AskModel, askLocalModel } from "./models";
import { contactFacts, listContacts } from "./people";
import { Masker } from "./privacy";
import { BUNDLE, type Bundle, type CatalogEntry, catalogLines, resolveBundle } from "./tools";

/** How Ask builds a question's context, sends it, and streams the answer back. Shared by Ask and a document's own chat. */

const PAGE_CHARS = 1800;
const MAX_PAGES = 5;
/** When you narrow the question to a few documents, more of their pages are read. */
const MAX_SCOPED_PAGES = 8;
/** Documents listed with each question so the model can pick some for a zip. */
const MAX_CATALOG = 300;
export const PLACEHOLDER = /(\[(?:PERSON|ID|DATE|ADDRESS|EMAIL|PHONE|IBAN|PRIVATE)_\d+\])/;

/** Something you narrowed the question to with @: a document, a folder, an area, or everything. */
export type Mention = { kind: "document" | "folder" | "area" | "all"; id: string; label: string };

export type Exchange = {
  id: number;
  question: string;
  model: AskModel;
  /** What the question was narrowed to; none (or "all") = the whole library. */
  scope?: Mention[];
  /** The message with real values, for a model on this Mac. */
  plain: string;
  /** The same message masked, for a cloud model. */
  masked: string;
  /** The library list sent with the question; the model names documents by their place in it (D1, D2…). */
  catalog?: CatalogEntry[];
  /** Documents the model put together into a zip for you to save. */
  bundle?: Bundle;
  /** Exactly what was (or will be) sent for this question, already masked. */
  sent: string;
  hidden: number;
  sources: Hit[];
  answer: string;
  /** The answer as the model wrote it, with placeholders (shown while private details are hidden). */
  raw: string;
  state: "review" | "sending" | "done" | "failed";
  error?: string;
};

/** The documents a set of mentions covers, or null for the whole library. */
export function scopeIds(mentions: Mention[] | undefined, docs: Pick<Document, "id" | "folderId" | "area">[]): Set<string> | null {
  if (!mentions?.length || mentions.some((m) => m.kind === "all")) return null;
  const ids = new Set<string>();
  for (const m of mentions) {
    for (const d of docs) {
      if ((m.kind === "document" && d.id === m.id) || (m.kind === "folder" && d.folderId === m.id) || (m.kind === "area" && d.area?.toLowerCase() === m.id.toLowerCase())) ids.add(d.id);
    }
  }
  return ids;
}

/** How many different private details a message hides. */
export const hiddenIn = (sent: string) => new Set(sent.match(new RegExp(PLACEHOLDER, "g"))).size;

/**
 * The question with its context, as one message (real values) and its masked copy: the approved facts and the pages
 * that best match, from the whole library or only from what you chose with @.
 */
export async function build(question: string, masker: Masker, scope?: Mention[], extra?: string) {
  const [facts, hits, docs] = await Promise.all([listFacts("approved"), searchLibrary(question, true), listDocuments()]);
  // The masker knows every fact and contact, even outside the scope, so nothing private slips through.
  masker.learn([...facts, ...contactFacts(await listContacts())]);
  const ids = scopeIds(scope, docs);
  const inScope = ids ? docs.filter((d) => ids.has(d.id)) : docs;
  const catalog: CatalogEntry[] = inScope.slice(0, MAX_CATALOG).map((d) => ({ id: d.id, title: d.title, folder: d.folderName, type: d.docType }));

  const top: Hit[] = hits.filter((h) => !ids || ids.has(h.documentId)).slice(0, MAX_PAGES);
  // Narrowed to a few documents: read their first pages too, so a question like "summarise it" has something to go on.
  if (ids) {
    for (const d of inScope) {
      for (const p of await documentPages(d.id)) {
        if (top.length >= MAX_SCOPED_PAGES) break;
        if (!top.some((h) => h.documentId === d.id && h.page === p.page)) top.push({ documentId: d.id, title: d.title, page: p.page, snippet: "" });
      }
    }
  }
  const pages = await Promise.all(
    top.map(async (h) => `### ${h.title}, page ${h.page}\n${((await documentPages(h.documentId)).find((p) => p.page === h.page)?.text ?? "").slice(0, PAGE_CHARS)}`),
  );
  const factLines = facts.filter((f) => !ids || ids.has(f.documentId)).map((f: Fact) => `- ${f.label}: ${f.value} (${f.documentTitle}${f.page ? `, p. ${f.page}` : ""})`);
  const body = [
    `Question: ${question}`,
    extra ?? "",
    ids ? `The user chose to ask only about: ${inScope.map((d) => d.title).join(", ") || "(nothing)"}. Answer only from these documents.` : "",
    factLines.length ? `Facts the user approved:\n${factLines.join("\n")}` : "",
    pages.length ? `${ids ? "Pages from the chosen documents" : "Matching pages from the user's documents"}:\n\n${pages.join("\n\n")}` : "No document pages matched the question.",
    catalog.length ? `Documents ${ids ? "chosen" : "in the library"} (D-number | title | folder | type), for ${BUNDLE}:\n${catalogLines(catalog)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const masked = masker.mask(body);
  const notes = masker.notes();
  return { plain: body, masked: notes.length ? `${masked}\n\nNotes on dates:\n${notes.join("\n")}` : masked, sources: top, catalog };
}

/** A new exchange for a question, waiting for review (cloud with private details) or to be sent. */
export async function prepare(question: string, model: AskModel, masker: Masker, scope?: Mention[], extra?: string): Promise<Exchange> {
  const built = await build(question, masker, scope, extra);
  const local = model.provider === "local";
  return {
    id: Date.now(),
    question,
    model,
    scope: scope?.length ? scope : undefined,
    plain: built.plain,
    masked: built.masked,
    sent: local ? built.plain : built.masked,
    hidden: local ? 0 : hiddenIn(built.masked),
    sources: built.sources,
    catalog: built.catalog,
    answer: "",
    raw: "",
    state: "review",
  };
}

/** On this Mac, or nothing private in it: no reason to make you confirm before sending. */
export const needsReview = (e: Exchange) => e.model.provider === "cloud" && PLACEHOLDER.test(e.masked);

/** A masker that knows today's facts and contacts, and a saved conversation re-masked with it, so placeholders stay consistent. */
export async function resume(saved: Exchange[]) {
  const masker = new Masker([]);
  masker.learn([...(await listFacts("approved")), ...contactFacts(await listContacts())]);
  return { masker, thread: saved.map((e) => ({ ...e, masked: masker.mask(e.plain), raw: masker.mask(e.answer) })) };
}

/** Sends one exchange with the earlier ones as context, and streams the answer in through `update`, unmasked on this Mac. */
export async function run(e: Exchange, earlier: Exchange[], masker: Masker, update: (patch: Partial<Exchange>) => void) {
  const local = e.model.provider === "local";
  // A cloud model only ever gets masked text, even for turns a local model answered.
  const done = earlier.filter((x) => x.state === "done");
  // What the assistant said, including a zip it put together (an empty turn would be refused).
  const said = (x: Exchange) => [x.answer, x.bundle && `(Put together "${x.bundle.name}.zip": ${x.bundle.titles.join(", ")})`].filter(Boolean).join("\n") || "(no answer)";
  const messages: Turn[] = [
    ...done.flatMap((x): Turn[] =>
      local
        ? [{ role: "user", content: x.plain }, { role: "assistant", content: said(x) }]
        : [{ role: "user", content: x.masked }, { role: "assistant", content: masker.mask(said(x)) }],
    ),
    { role: "user", content: local ? e.plain : e.masked },
  ];
  update({ state: "sending" });
  try {
    let text = "";
    if (local) {
      for await (const chunk of askLocalModel(e.model.id, messages)) {
        if ("call" in chunk) {
          if (chunk.call.name === BUNDLE) update({ bundle: resolveBundle(chunk.call.input, e.catalog ?? []) ?? undefined });
          continue;
        }
        text += chunk.text;
        update({ answer: text, raw: masker.mask(text) });
      }
    } else {
      const apiKey = await getSecret("openrouter");
      if (!apiKey) return update({ state: "failed", error: "Add your OpenRouter key in Connected AIs first." });
      const result = askCloud({ apiKey, model: e.model.id, messages });
      for await (const chunk of result.textStream) {
        text += chunk;
        update({ answer: masker.unmask(text), raw: text });
      }
      // The zip's name may hold placeholders; the documents come from the list on this Mac.
      const call = (await result.toolCalls).find((c) => c.toolName === BUNDLE);
      if (call) update({ bundle: resolveBundle(call.input, e.catalog ?? [], (s) => masker.unmask(s)) ?? undefined });
    }
    update({ state: "done" });
  } catch (err) {
    update({ state: "failed", error: err instanceof Error ? err.message : String(err) });
  }
}
