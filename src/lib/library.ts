import { invoke, isTauri } from "@tauri-apps/api/core";

/** The local library, kept by the Rust side in the app's data folder (`src-tauri/src/store.rs`). */

export type Document = {
  id: string;
  title: string;
  fileName: string;
  mime: string | null;
  sizeBytes: number;
  area: string | null;
  docType: string | null;
  /** new = stored, not read yet · read = text extracted · filed = classified and facts extracted */
  status: "new" | "read" | "filed";
  addedAt: string;
  textMethod: "pdf-text" | "text" | "ocr" | "pdf-ocr" | "unsupported" | null;
  pageCount: number | null;
  folderId: string | null;
  /** "Area › Folder" */
  folderName: string | null;
  /** auto = filed by SafeBox · suggested = waiting for you · confirmed = you chose */
  filing: "auto" | "suggested" | "confirmed" | null;
  suggestedArea: string | null;
  suggestedFolder: string | null;
  /** The suggested folder doesn't exist yet. */
  suggestedNew: boolean;
  suggestionReason: string | null;
};

export type Folder = { id: string; area: string; name: string; documents: number };

export type Imported = { added: Document[]; duplicates: string[]; failed: [string, string][] };
export type Stats = { documents: number; facts: number; pendingFacts: number; toFile: number };

/** False when the interface runs in a plain browser (`bun run dev`), where there is no library. */
export const hasLibrary = isTauri();

export const listDocuments = () => (hasLibrary ? invoke<Document[]>("list_documents") : Promise.resolve([]));
export const libraryStats = () => (hasLibrary ? invoke<Stats>("library_stats") : Promise.resolve({ documents: 0, facts: 0, pendingFacts: 0, toFile: 0 }));
export const listFolders = () => (hasLibrary ? invoke<Folder[]>("list_folders") : Promise.resolve([]));
/** Puts a document in "area › name", creating the folder if needed. */
export const fileInFolder = (id: string, area: string, name: string) => invoke<string>("file_document", { id, area, name });
export const renameFolder = (id: string, name: string) => invoke<void>("rename_folder", { id, name });
export const importFiles = (paths: string[]) => invoke<Imported>("import_files", { paths });
export const openDocument = (id: string) => invoke<void>("open_document", { id });
export const removeDocument = (id: string) => invoke<void>("remove_document", { id });

export const fileTypes = ["pdf", "png", "jpg", "jpeg", "heic", "webp", "txt", "md", "eml", "docx"];

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const formatDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export type Hit = { documentId: string; title: string; page: number; snippet: string };
export type Fact = { id: string; documentId: string; documentTitle: string; documentMime: string | null; label: string; value: string; page: number | null; status: "pending" | "approved" | "rejected" };
export type Page = { page: number; text: string };

export const searchLibrary = (query: string, any = false) => invoke<Hit[]>("search", { query, any });
export const listFacts = (status: Fact["status"]) => (hasLibrary ? invoke<Fact[]>("list_facts", { status }) : Promise.resolve([]));
export const documentPages = (id: string) => invoke<Page[]>("document_pages", { id });
export const settleFact = (id: string, status: Fact["status"], value?: string) => invoke<void>("settle_fact", { id, status, value: value ?? null });

/** Tells every screen that the library changed (a fact approved, a document filed…). */
export const LIBRARY_CHANGED = "safebox:library-changed";
export const announceChange = () => window.dispatchEvent(new Event(LIBRARY_CHANGED));

export const getSecret = (name: "openrouter") => invoke<string | null>("get_secret", { name });
export const setSecret = (name: "openrouter", value: string) => invoke<void>("set_secret", { name, value });
export const removeSecret = (name: "openrouter") => invoke<void>("remove_secret", { name });

/** Apps using the library through the MCP server, and their access level (`src-tauri/src/apps.rs`). */
export type AiApp = { name: string; level: "off" | "facts" | "search"; firstSeen: string; lastUsed: string | null; calls: number };
export type McpSetup = { server: string | null; claudeDesktop: boolean; cursor: boolean };
export const listAiApps = () => (hasLibrary ? invoke<AiApp[]>("list_ai_apps") : Promise.resolve([]));
export const setAiAppLevel = (name: string, level: AiApp["level"]) => invoke<void>("set_ai_app_level", { name, level });
export const removeAiApp = (name: string) => invoke<void>("remove_ai_app", { name });
export const mcpSetup = () => (hasLibrary ? invoke<McpSetup>("mcp_setup") : Promise.resolve({ server: null, claudeDesktop: false, cursor: false }));
export const connectApp = (app: "claude-desktop" | "cursor", on: boolean) => invoke<void>("connect_app", { app, on });
