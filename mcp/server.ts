/**
 * Voidcat's MCP server. Apps such as Claude Desktop, Cursor and Claude Code start it (stdio) to use the library.
 * It reads the library the Voidcat app keeps on this Mac and answers through `VoidcatTools`, which masks every
 * personal detail. Each app's access level is set in Voidcat (Connected AIs) and checked on every call.
 * Built into a single binary with `bun run build:mcp` and shipped inside the app.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ManualEvent } from "../src/lib/calendar";
import type { Document, Fact, Hit } from "../src/lib/library";
import { DEFAULT_LEVEL, INSTRUCTIONS, type Level, type LibrarySource, VoidcatTools } from "../src/lib/mcp";

const dir = process.env.VOIDCAT_DIR ?? join(homedir(), "Library/Application Support/dev.hus.voidcat");
if (!existsSync(join(dir, "voidcat.db"))) {
  console.error(`No Voidcat library in ${dir}. Open Voidcat once to create it.`);
  process.exit(1);
}
const db = new Database(join(dir, "voidcat.db"), { readwrite: true, create: false });
db.exec("pragma busy_timeout = 3000");
db.exec(`create table if not exists ai_apps (
  name text primary key,
  level text not null default '${DEFAULT_LEVEL}',
  first_seen text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_used text,
  calls integer not null default 0
)`);

const library: LibrarySource = {
  documents: () =>
    db
      .query(
        `select id, title, area, doc_type as docType, page_count as pageCount,
           (select f.area || ' › ' || f.name from folders f where f.id = documents.folder_id) as folderName
         from documents order by added_at desc`,
      )
      .all() as Document[],
  approvedFacts: () =>
    db
      .query(
        `select f.id, f.document_id as documentId, d.title as documentTitle, d.mime as documentMime, f.label, f.value, f.page, f.status
         from facts f join documents d on d.id = f.document_id where f.status = 'approved' order by d.title, f.created_at`,
      )
      .all() as Fact[],
  manualEvents: () =>
    db.query("select id, title, date, time, place, kind, document_id as documentId, notes from events order by date").all() as ManualEvent[],
  search: (query) => {
    const words = query
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2)
      .map((w) => `"${w}"*`);
    if (!words.length) return [];
    return db
      .query(
        `select p.document_id as documentId, d.title, p.page, snippet(pages, 2, '[[', ']]', ' … ', 24) as snippet
         from pages p join documents d on d.id = p.document_id where pages match ?1 order by rank limit 12`,
      )
      .all(words.join(" OR ")) as Hit[];
  },
  privateValues: () => {
    const has = db.query("select 1 from sqlite_master where name = 'contacts'").get();
    if (!has) return [];
    const rows = db
      .query("select name, phone, email, address, id_number as idNumber from contacts where kind = 'person' and hidden = 0")
      .all() as { name: string; phone: string | null; email: string | null; address: string | null; idNumber: string | null }[];
    return rows.flatMap((c) => [
      { label: "Name", value: c.name },
      ...(c.phone ? [{ label: "Phone", value: c.phone }] : []),
      ...(c.email ? [{ label: "Email", value: c.email }] : []),
      ...(c.address ? [{ label: "Address", value: c.address }] : []),
      ...(c.idNumber ? [{ label: "ID number", value: c.idNumber }] : []),
    ]);
  },
  page: (documentId, page) => (db.query("select text from pages where document_id = ?1 and page = ?2").get(documentId, page) as { text: string } | null)?.text ?? null,
};

const tools = new VoidcatTools(library);
const server = new McpServer({ name: "voidcat", version: "0.1.0" }, { instructions: INSTRUCTIONS });

/** The calling app's level, read fresh so a change in Voidcat applies at once. Records that the app used Voidcat. */
function levelOfCaller(): Level {
  const name = server.server.getClientVersion()?.name ?? "unknown";
  db.query("insert into ai_apps (name) values (?1) on conflict(name) do nothing").run(name);
  db.query("update ai_apps set last_used = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), calls = calls + 1 where name = ?1").run(name);
  return ((db.query("select level from ai_apps where name = ?1").get(name) as { level: Level } | null)?.level ?? DEFAULT_LEVEL) as Level;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const OFF = "This app is turned off in Voidcat. The user can allow it in Voidcat → Connected AIs.";
const NEEDS_SEARCH = "This app may only see facts and dates. The user can allow searching pages in Voidcat → Connected AIs.";

function guarded(need: "facts" | "search", run: () => string) {
  try {
    const level = levelOfCaller();
    if (level === "off") return text(OFF);
    if (need === "search" && level !== "search") return text(NEEDS_SEARCH);
    return text(run());
  } catch (err) {
    return { ...text(`Voidcat could not answer: ${err instanceof Error ? err.message : String(err)}`), isError: true };
  }
}

const readOnly = { readOnlyHint: true, openWorldHint: false };

server.registerTool(
  "list_documents",
  { title: "List documents", description: "Every document in the user's Voidcat library: id, title, folder, type and page count.", annotations: readOnly },
  () => guarded("facts", () => tools.listDocuments()),
);
server.registerTool(
  "get_facts",
  {
    title: "Get facts",
    description: "Facts the user approved from their documents (names, dates, amounts, IDs, as placeholders where private), grouped by document.",
    inputSchema: { document_id: z.string().optional().describe("Only facts from this document") },
    annotations: readOnly,
  },
  ({ document_id }) => guarded("facts", () => tools.facts(document_id)),
);
server.registerTool(
  "upcoming_dates",
  { title: "Upcoming dates", description: "Appointments, deadlines, expiries, renewals and payments from the user's documents and calendar.", annotations: readOnly },
  () => guarded("facts", () => tools.dates()),
);
server.registerTool(
  "search_documents",
  {
    title: "Search documents",
    description: "Full-text search inside the pages of the user's documents (accents ignored). Returns matching pages with a short excerpt.",
    inputSchema: { query: z.string().describe("Words to look for") },
    annotations: readOnly,
  },
  ({ query }) => guarded("search", () => tools.search(query)),
);
server.registerTool(
  "read_page",
  {
    title: "Read page",
    description: "The text of one page of a document, with private details masked.",
    inputSchema: { document_id: z.string(), page: z.number().int().min(1) },
    annotations: readOnly,
  },
  ({ document_id, page }) => guarded("search", () => tools.readPage(document_id, page)),
);

await server.connect(new StdioServerTransport());
