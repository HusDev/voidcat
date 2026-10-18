import { call as invoke, onMac } from "./backend";
import { cloudConfigured } from "../cloud/config";
import type { DragEvent } from "react";

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
  textMethod: "pdf-text" | "text" | "ocr" | "pdf-ocr" | "sheet" | "unsupported" | null;
  pageCount: number | null;
  folderId: string | null;
  /** "Area › Folder" */
  folderName: string | null;
  /** auto = filed by Voidcat · suggested = waiting for you · confirmed = you chose */
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

/**
 * There is a library to show: the Mac's, or in a browser the cloud library (the app only appears once it's open,
 * see `CloudGate`). False only in a plain browser preview without the cloud.
 */
export const hasLibrary = onMac || cloudConfigured;
export { onMac };

export const listDocuments = () => (hasLibrary ? invoke<Document[]>("list_documents") : Promise.resolve([]));
export const libraryStats = () => (hasLibrary ? invoke<Stats>("library_stats") : Promise.resolve({ documents: 0, facts: 0, pendingFacts: 0, toFile: 0 }));
export const listFolders = () => (hasLibrary ? invoke<Folder[]>("list_folders") : Promise.resolve([]));
/** Puts a document in "area › name", creating the folder if needed. */
export const fileInFolder = (id: string, area: string, name: string) => invoke<string>("file_document", { id, area, name });
export const renameFolder = (id: string, name: string) => invoke<void>("rename_folder", { id, name });
/** The name a document shows in Voidcat; the stored file keeps its own name. */
export const renameDocument = (id: string, title: string) => invoke<void>("rename_document", { id, title });
/**
 * Saves documents as one .zip, each under its original file name, where you choose in the save dialog.
 * Returns false when you cancel.
 */
export async function downloadZip(name: string, ids: string[]) {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const safe = name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Documents";
  const path = await save({ defaultPath: `${safe}.zip`, filters: [{ name: "Zip archive", extensions: ["zip"] }] });
  if (!path) return false;
  await invoke<void>("save_zip", { path, ids });
  return true;
}

/** Every document as one zip, sorted into Area/Folder, at a place the user picks. Returns how many, or null if cancelled. */
export async function exportEverything() {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: `Voidcat documents ${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: "Zip archive", extensions: ["zip"] }] });
  if (!path) return null;
  return invoke<number>("export_all", { path });
}

/** True when the library's key is missing from the Keychain and only the recovery key can open it. */
export const libraryLocked = () => (onMac ? invoke<boolean>("library_locked") : Promise.resolve(false));
/** Opens a locked library with the recovery key; the app restarts when it works. */
export const recoverLibrary = (code: string) => invoke<void>("recover_library", { code });
export const recoveryCode = () => invoke<string>("recovery_code");

/** Moves a folder and its documents to another area; returns the folder they're in now (a namesake there absorbs it). */
export const moveFolder = (id: string, area: string) => invoke<string>("move_folder", { id, area });

/** Drag and drop inside the app: what is being dragged, as a data type the drop targets look for. */
export const DRAG_DOCUMENT = "application/x-voidcat-document";
export const DRAG_FOLDER = "application/x-voidcat-folder";
export const dragDocument = (e: DragEvent, id: string) => {
  e.dataTransfer.setData(DRAG_DOCUMENT, id);
  e.dataTransfer.effectAllowed = "move";
};
export const importFiles = (paths: string[]) => invoke<Imported>("import_files", { paths });
export const OPEN_DOCUMENT = "voidcat:open-document";
/** Opens a document in a tab inside the app (see `lib/tabs.tsx`). */
export const openDocument = (id: string) => window.dispatchEvent(new CustomEvent(OPEN_DOCUMENT, { detail: id }));
/** Opens the file in the Mac's default app for its type (Preview, a browser…). */
export const openInDefaultApp = (id: string) => invoke<void>("open_document", { id });
export const removeDocument = (id: string) => invoke<void>("remove_document", { id });

export const fileTypes = ["pdf", "png", "jpg", "jpeg", "heic", "webp", "txt", "md", "csv", "eml", "docx", "xlsx", "xls", "ods"];

const SHEETS = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/vnd.oasis.opendocument.spreadsheet"];
export const isSpreadsheet = (mime: string | null) => SHEETS.includes(mime ?? "");
export type Sheet = { name: string; rows: string[][]; cut: boolean };
/** A spreadsheet's sheets as rows of text, read on this Mac. */
export const readSheets = (id: string) => invoke<Sheet[]>("read_sheets", { id });

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
export type Chat = { id: string; title: string; updatedAt: string };
/** Ask's saved conversations, newest first. */
export const listChats = () => (hasLibrary ? invoke<Chat[]>("list_chats") : Promise.resolve([]));
/** A conversation's JSON, or null when it was deleted. */
export const getChat = (id: string) => (hasLibrary ? invoke<string | null>("get_chat", { id }) : Promise.resolve(null));
export const saveChat = (id: string, title: string, body: string) => (hasLibrary ? invoke<void>("save_chat", { id, title, body }) : Promise.resolve());
export const deleteChat = (id: string) => invoke<void>("delete_chat", { id });
export const CHATS_CHANGED = "voidcat:chats-changed";
export const announceChats = () => window.dispatchEvent(new Event(CHATS_CHANGED));

export const LIBRARY_CHANGED = "voidcat:library-changed";
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
