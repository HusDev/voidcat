/**
 * Voidcat's MCP server. Apps such as Claude Desktop, Cursor and Claude Code start it (stdio) to use the library.
 * The library is encrypted, so it asks the running Voidcat app (a Unix socket in the library folder) and answers
 * through `VoidcatTools`, which masks every personal detail. Each app's access level is set in Voidcat (Connected AIs) and checked on every call.
 * Built into a single binary with `bun run build:mcp` and shipped inside the app.
 */
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ManualEvent } from "../src/lib/calendar";
import type { Document, Fact, Hit } from "../src/lib/library";
import { DEFAULT_LEVEL, INSTRUCTIONS, type Level, type LibrarySource, VoidcatTools } from "../src/lib/mcp";

const dir = process.env.VOIDCAT_DIR ?? join(homedir(), "Library/Application Support/dev.hus.voidcat");
if (!existsSync(dir)) {
  console.error(`No Voidcat library in ${dir}. Open Voidcat once to create it.`);
  process.exit(1);
}
// The library is encrypted and only the app holds its key, so every answer comes from the running app.
const SOCKET = join(dir, "mcp.sock");
const CLOSED = "Voidcat isn't open. Open Voidcat (it can stay in the menu bar) and try again.";

function ask<T>(request: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!existsSync(SOCKET)) return reject(new Error(CLOSED));
    let reply = "";
    const socket = connect(SOCKET, () => socket.write(`${JSON.stringify(request)}\n`));
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      reply += chunk;
    });
    socket.on("end", () => {
      try {
        const answer = JSON.parse(reply) as { ok?: T; error?: string };
        if (answer.error) reject(new Error(answer.error));
        else resolve(answer.ok as T);
      } catch {
        reject(new Error(CLOSED));
      }
    });
    socket.on("error", () => reject(new Error(CLOSED)));
  });
}

type Contact = { name: string; phone: string | null; email: string | null; address: string | null; idNumber: string | null };
type Snapshot = { documents: Document[]; facts: Fact[]; events: ManualEvent[]; contacts: Contact[] };

/** What one call needs, fetched fresh: the library's documents, facts, dates and people, plus a search or a page. */
async function library(extra: { search?: string; page?: { documentId: string; page: number } } = {}): Promise<LibrarySource> {
  const snap = await ask<Snapshot>({ method: "snapshot" });
  const hits = extra.search ? await ask<Hit[]>({ method: "search", query: extra.search }) : [];
  const pageText = extra.page ? await ask<string | null>({ method: "page", ...extra.page }) : null;
  return {
    documents: () => snap.documents,
    approvedFacts: () => snap.facts,
    manualEvents: () => snap.events,
    search: () => hits,
    privateValues: () =>
      snap.contacts.flatMap((c) => [
        { label: "Name", value: c.name },
        ...(c.phone ? [{ label: "Phone", value: c.phone }] : []),
        ...(c.email ? [{ label: "Email", value: c.email }] : []),
        ...(c.address ? [{ label: "Address", value: c.address }] : []),
        ...(c.idNumber ? [{ label: "ID number", value: c.idNumber }] : []),
      ]),
    page: () => pageText,
  };
}

const server = new McpServer({ name: "voidcat", version: "0.1.0" }, { instructions: INSTRUCTIONS });

/** The calling app's level, read fresh so a change in Voidcat applies at once. Records that the app used Voidcat. */
async function levelOfCaller(): Promise<Level> {
  const name = server.server.getClientVersion()?.name ?? "unknown";
  return ((await ask<Level>({ method: "hello", name })) ?? DEFAULT_LEVEL) as Level;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const OFF = "This app is turned off in Voidcat. The user can allow it in Voidcat → Connected AIs.";
const NEEDS_SEARCH = "This app may only see facts and dates. The user can allow searching pages in Voidcat → Connected AIs.";

async function guarded(need: "facts" | "search", run: (tools: VoidcatTools) => string, extra?: Parameters<typeof library>[0]) {
  try {
    const level = await levelOfCaller();
    if (level === "off") return text(OFF);
    if (need === "search" && level !== "search") return text(NEEDS_SEARCH);
    return text(run(new VoidcatTools(await library(extra))));
  } catch (err) {
    return { ...text(`Voidcat could not answer: ${err instanceof Error ? err.message : String(err)}`), isError: true };
  }
}

const readOnly = { readOnlyHint: true, openWorldHint: false };

server.registerTool(
  "list_documents",
  { title: "List documents", description: "Every document in the user's Voidcat library: id, title, folder, type and page count.", annotations: readOnly },
  () => guarded("facts", (tools) => tools.listDocuments()),
);
server.registerTool(
  "get_facts",
  {
    title: "Get facts",
    description: "Facts the user approved from their documents (names, dates, amounts, IDs, as placeholders where private), grouped by document.",
    inputSchema: { document_id: z.string().optional().describe("Only facts from this document") },
    annotations: readOnly,
  },
  ({ document_id }) => guarded("facts", (tools) => tools.facts(document_id)),
);
server.registerTool(
  "upcoming_dates",
  { title: "Upcoming dates", description: "Appointments, deadlines, expiries, renewals and payments from the user's documents and calendar.", annotations: readOnly },
  () => guarded("facts", (tools) => tools.dates()),
);
server.registerTool(
  "search_documents",
  {
    title: "Search documents",
    description: "Full-text search inside the pages of the user's documents (accents ignored). Returns matching pages with a short excerpt.",
    inputSchema: { query: z.string().describe("Words to look for") },
    annotations: readOnly,
  },
  ({ query }) => guarded("search", (tools) => tools.search(query), { search: query }),
);
server.registerTool(
  "read_page",
  {
    title: "Read page",
    description: "The text of one page of a document, with private details masked.",
    inputSchema: { document_id: z.string(), page: z.number().int().min(1) },
    annotations: readOnly,
  },
  ({ document_id, page }) => guarded("search", (tools) => tools.readPage(document_id, page), { page: { documentId: document_id, page } }),
);

await server.connect(new StdioServerTransport());
