import { Bytes, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { zipSync } from "fflate";
import { clearWebBackend, setWebBackend } from "../lib/backend";
import { announceChange, type Document, type Fact, type Folder, type Hit, type Page } from "../lib/library";
import { firebase } from "./firebase";
import { type Keys, open, openText, seal, sealText } from "./vault";

/**
 * The cloud library in a browser. Every `users/{uid}/records/doc_…` record is opened in memory (never stored
 * unlocked) and answers the same commands the Mac's Rust side does, so the Library, folders, document tabs and fact
 * review work unchanged. A change made here updates the record and leaves a sealed `edit_…` record that the Mac
 * applies to its own library on its next sync (`cloud_apply`); files added here are fetched and read by the Mac.
 */

/** A document record as the Mac writes it (`cloud.rs` `Record`). */
export type DocRecord = {
  kind: "document";
  v: number;
  id: string;
  title: string;
  fileName: string;
  mime: string | null;
  sizeBytes: number;
  sha256: string;
  area: string | null;
  docType: string | null;
  status: Document["status"];
  addedAt: string;
  textMethod: Document["textMethod"];
  pageCount: number | null;
  folder: [string, string] | null;
  filing: Document["filing"];
  facts: { id: string; label: string; value: string; page: number | null; status: Fact["status"] }[];
  pages: [number, string][];
  pagesCut: boolean;
};

export type Edit =
  | { op: "settle_fact"; factId: string; status: Fact["status"]; value: string | null }
  | { op: "rename_document"; id: string; title: string }
  | { op: "file_document"; id: string; area: string; name: string }
  | { op: "rename_folder"; area: string; from: string; to: string }
  | { op: "remove_document"; id: string }
  | { op: "import"; id: string; fileName: string }
  /** Read in the cloud ("Read now"): the Mac keeps this reading instead of reading the file again. */
  | {
      op: "reading";
      id: string;
      method: NonNullable<Document["textMethod"]>;
      pages: string[];
      title: string;
      docType: string;
      area: string;
      folder: string;
      facts: { id?: string; label: string; value: string; page: number | null }[];
    };

export const folderId = (area: string, name: string) => `${area.toLowerCase()}/${name.toLowerCase()}`;
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

export function toDocument(r: DocRecord): Document {
  return {
    id: r.id,
    title: r.title,
    fileName: r.fileName,
    mime: r.mime,
    sizeBytes: r.sizeBytes,
    area: r.area,
    docType: r.docType,
    status: r.status,
    addedAt: r.addedAt,
    textMethod: r.textMethod,
    pageCount: r.pageCount,
    folderId: r.folder ? folderId(...r.folder) : null,
    folderName: r.folder ? `${r.folder[0]} › ${r.folder[1]}` : null,
    filing: r.filing,
    suggestedArea: null,
    suggestedFolder: null,
    suggestedNew: false,
    suggestionReason: null,
  };
}

/** Accents and case don't matter, as in the Mac's search. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Search inside the pages: every word (as a prefix), or with `any` some of them, best first. Snippets mark matches with [[ ]]. */
export function searchRecords(records: DocRecord[], query: string, any: boolean): Hit[] {
  const words = fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
  if (!words.length) return [];
  const hits: (Hit & { score: number })[] = [];
  for (const r of records)
    for (const [page, text] of r.pages) {
      const tokens = fold(text).split(/[^\p{L}\p{N}]+/u);
      const found = words.filter((w) => tokens.some((t) => t.startsWith(w)));
      if (any ? !found.length : found.length < words.length) continue;
      hits.push({ documentId: r.id, title: r.title, page, snippet: snippet(text, found), score: found.length });
    }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((h) => ({ documentId: h.documentId, title: h.title, page: h.page, snippet: h.snippet }));
}

function snippet(text: string, words: string[]) {
  // Where the first word that starts with a searched word begins (folding keeps lengths for most text).
  const first = [...fold(text).matchAll(/[\p{L}\p{N}]+/gu)].find((m) => words.some((w) => m[0].startsWith(w)));
  const start = Math.max(0, (first?.index ?? 0) - 60);
  const piece = text.slice(start, start + 180);
  // Folding keeps lengths for most text; mark whole words that start with a searched word.
  const marked = piece.replace(/[\p{L}\p{N}]+/gu, (w) => (words.some((q) => fold(w).startsWith(q)) ? `[[${w}]]` : w));
  return `${start > 0 ? "…" : ""}${marked}${start + 180 < text.length ? "…" : ""}`;
}

/** Applies a browser change to a record (also what the Mac will do with it), or says it doesn't touch it. */
export function applyEdit(r: DocRecord, e: Edit): DocRecord | null {
  switch (e.op) {
    case "settle_fact": {
      if (!r.facts.some((f) => f.id === e.factId)) return null;
      const facts = r.facts.map((f) => (f.id === e.factId ? { ...f, status: e.status, value: e.value?.trim() ? e.value.trim() : f.value } : f));
      return { ...r, facts: facts.filter((f) => f.status !== "rejected") };
    }
    case "rename_document":
      return r.id === e.id ? { ...r, title: e.title.trim() || r.title } : null;
    case "file_document":
      return r.id === e.id ? { ...r, folder: [e.area, e.name], area: e.area, filing: "confirmed" } : null;
    case "rename_folder":
      return r.folder && same(r.folder[0], e.area) && same(r.folder[1], e.from) ? { ...r, folder: [r.folder[0], e.to] } : null;
    default:
      return null;
  }
}

const decode = (b: ArrayBuffer | Uint8Array) => new Uint8Array(b);

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
  webp: "image/webp",
  txt: "text/plain",
  md: "text/markdown",
  eml: "message/rfc822",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

/** "rental_contract-signed.pdf" → "Rental contract signed", as on the Mac. */
export function titleFrom(name: string) {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").split(/\s+/).filter(Boolean).join(" ");
  return stem ? stem[0].toUpperCase() + stem.slice(1) : name;
}

export type WebLibrary = {
  close: () => void;
  /** Adds files from this browser (see `upload` below). */
  upload: (files: File[]) => Promise<{ added: number; duplicates: string[]; failed: [string, string][] }>;
  /** Every document, unlocked, as one zip sorted into Area/Folder (see `exportZip` below). */
  exportZip: (progress?: (done: number, total: number) => void) => Promise<{ zip: Uint8Array; count: number }>;
};

/** "Area/Folder/file.pdf" (or "Not filed/…"), with " (2)" before the extension when a name repeats. */
export function zipNames(docs: Pick<DocRecord, "folder" | "fileName">[]) {
  const used = new Set<string>();
  return docs.map((d) => {
    const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").trim() || "file";
    const dir = d.folder ? `${clean(d.folder[0])}/${clean(d.folder[1])}` : "Not filed";
    const name = clean(d.fileName);
    const dot = name.lastIndexOf(".");
    let path = `${dir}/${name}`;
    for (let n = 2; used.has(path.toLowerCase()); n++) path = dot > 0 ? `${dir}/${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${dir}/${name} (${n})`;
    used.add(path.toLowerCase());
    return path;
  });
}

/** Opens the signed-in account's cloud library for this browser. Resolves once the records have loaded. */
export function openWebLibrary(uid: string, keys: Keys): Promise<WebLibrary> {
  const { db, storage } = firebase();
  const records = new Map<string, DocRecord>();
  const files = new Map<string, Promise<ArrayBuffer>>();
  const recordRef = (id: string) => doc(db, "users", uid, "records", `doc_${id}`);
  const fileRef = (id: string) => ref(storage, `users/${uid}/files/${id}`);
  let changed: ReturnType<typeof setTimeout> | undefined;
  const announce = () => {
    clearTimeout(changed);
    changed = setTimeout(announceChange, 50);
  };

  const all = () => [...records.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.title.localeCompare(b.title));
  const facts = (status: string): Fact[] =>
    all().flatMap((r) =>
      r.facts.filter((f) => f.status === status).map((f) => ({ ...f, documentId: r.id, documentTitle: r.title, documentMime: r.mime })),
    );
  const folders = (): Folder[] => {
    const out = new Map<string, Folder>();
    for (const r of records.values())
      if (r.folder) {
        const id = folderId(...r.folder);
        const f = out.get(id) ?? { id, area: r.folder[0], name: r.folder[1], documents: 0 };
        f.documents++;
        out.set(id, f);
      }
    return [...out.values()].sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  };

  /** Saves a changed record and leaves the change for the Mac. Edits are named by time so the Mac applies them in order. */
  async function save(edit: Edit, touched: DocRecord[]) {
    for (const r of touched) records.set(r.id, r);
    announce();
    const stamp = `${Date.now()}`.padStart(15, "0");
    await setDoc(doc(db, "users", uid, "records", `edit_${stamp}_${crypto.randomUUID().slice(0, 8)}`), {
      data: Bytes.fromUint8Array(await sealText(keys.records, JSON.stringify(edit))),
      v: 1,
      updatedAt: serverTimestamp(),
    });
    for (const r of touched)
      await setDoc(recordRef(r.id), { data: Bytes.fromUint8Array(await sealText(keys.records, JSON.stringify(r))), v: 1, updatedAt: serverTimestamp() });
  }

  async function edit(e: Edit) {
    const touched = [...records.values()].map((r) => applyEdit(r, e)).filter((r): r is DocRecord => !!r);
    await save(e, touched);
  }

  async function bytes(id: string) {
    if (!files.has(id))
      files.set(
        id,
        getBytes(fileRef(id)).then(async (b) => {
          const plain = await open(keys.files, decode(b));
          return plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) as ArrayBuffer;
        }),
      );
    const p = files.get(id)!;
    p.catch(() => files.delete(id));
    return p;
  }

  const need = <T>(v: T | undefined, what = "That document isn't in your cloud library.") => {
    if (v === undefined) throw new Error(what);
    return v;
  };

  const commands: Record<string, (a: Record<string, unknown>) => unknown> = {
    list_documents: () => all().map(toDocument),
    library_stats: () => ({
      documents: records.size,
      facts: facts("approved").length,
      pendingFacts: facts("pending").length,
      toFile: 0,
    }),
    list_folders: folders,
    list_facts: (a) => facts(String(a.status)),
    document_pages: (a): Page[] => need(records.get(String(a.id))).pages.map(([page, text]) => ({ page, text })),
    // A fresh copy every time: pdf.js takes over (detaches) the buffer it's given, as it does with the Mac's.
    document_bytes: async (a) => (await bytes(String(a.id))).slice(0),
    read_docx: (a) => need(records.get(String(a.id))).pages.map(([, text]) => text),
    read_sheets: (a) =>
      need(records.get(String(a.id))).pages.map(([page, text]) => {
        const [name, ...rows] = text.split("\n");
        return { name: name || `Sheet ${page}`, rows: rows.map((row) => row.split(" | ")), cut: false };
      }),
    search: (a) => searchRecords(all(), String(a.query), !!a.any),
    settle_fact: (a) => edit({ op: "settle_fact", factId: String(a.id), status: a.status as Fact["status"], value: (a.value as string | null) ?? null }),
    rename_document: (a) => edit({ op: "rename_document", id: String(a.id), title: String(a.title) }),
    file_document: async (a) => {
      await edit({ op: "file_document", id: String(a.id), area: String(a.area), name: String(a.name) });
      return folderId(String(a.area), String(a.name));
    },
    rename_folder: (a) => {
      const f = need(
        folders().find((x) => x.id === a.id),
        "That folder isn't in your cloud library.",
      );
      if (folders().some((x) => x.id !== f.id && same(x.area, f.area) && same(x.name, String(a.name)))) throw new Error("A folder with that name already exists.");
      return edit({ op: "rename_folder", area: f.area, from: f.name, to: String(a.name).trim() });
    },
    save_cloud_reading: async (a) => {
      const r = need(records.get(String(a.id)));
      const e = a as unknown as Extract<Edit, { op: "reading" }>;
      // Firestore takes up to 1 MiB a record: keep the page text well under that.
      let room = 800_000;
      const pages: [number, string][] = [];
      for (const [i, text] of e.pages.entries()) {
        if (text.length > room) break;
        room -= text.length;
        pages.push([i + 1, text]);
      }
      // The Mac keeps these ids, so approving a fact here works before and after it syncs.
      const facts = e.facts.map((f) => ({ id: crypto.randomUUID(), label: f.label, value: f.value, page: f.page, status: "pending" as const }));
      const updated: DocRecord = {
        ...r,
        title: e.title,
        docType: e.docType,
        area: e.area,
        status: "filed",
        textMethod: e.method,
        pageCount: e.pages.length,
        folder: [e.area, e.folder],
        filing: "auto",
        facts,
        pages,
        pagesCut: pages.length < e.pages.length,
      };
      await save({ op: "reading", id: r.id, method: e.method, pages: pages.map(([, t]) => t), title: e.title, docType: e.docType, area: e.area, folder: e.folder, facts: facts.map(({ id, label, value, page }) => ({ id, label, value, page })) }, [updated]);
    },
    remove_document: async (a) => {
      const id = String(a.id);
      records.delete(id);
      announce();
      await save({ op: "remove_document", id }, []);
      await deleteDoc(recordRef(id));
      await deleteObject(fileRef(id)).catch(() => {});
    },
    // What the Mac keeps for itself (labels, chats, calendar, contacts, profile, apps): empty here for now.
    list_labels: () => [],
    unchecked_for_labels: () => [],
    list_chats: () => [],
    get_chat: () => null,
    list_events: () => [],
    done_event_keys: () => [],
    event_papers: () => [],
    list_opportunities: () => [],
    list_contacts: () => [],
    owner_names: () => [],
    unscanned_for_contacts: () => [],
    get_profile: () => null,
    profile_choices: () => [],
    list_ai_apps: () => [],
    get_secret: () => null,
    mcp_setup: () => ({ server: null, claudeDesktop: false, cursor: false }),
  };

  /**
   * Adds files from this browser: each is sealed here, uploaded, and listed at once as "new"; the Mac fetches it on
   * its next sync, reads it and files it. The same content twice is skipped.
   */
  async function upload(picked: File[]) {
    const out = { added: 0, duplicates: [] as string[], failed: [] as [string, string][] };
    for (const file of picked) {
      try {
        const plain = new Uint8Array(await file.arrayBuffer());
        const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", plain))].map((b) => b.toString(16).padStart(2, "0")).join("");
        if ([...records.values()].some((r) => r.sha256 === sha)) {
          out.duplicates.push(file.name);
          continue;
        }
        const id = crypto.randomUUID();
        await uploadBytes(fileRef(id), await seal(keys.files, plain), { contentType: "application/octet-stream" });
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const record: DocRecord = {
          kind: "document",
          v: 1,
          id,
          title: titleFrom(file.name),
          fileName: file.name,
          mime: EXT_MIME[ext] ?? (file.type || null),
          sizeBytes: plain.length,
          sha256: sha,
          area: null,
          docType: null,
          status: "new",
          addedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
          textMethod: null,
          pageCount: null,
          folder: null,
          filing: null,
          facts: [],
          pages: [],
          pagesCut: false,
        };
        await save({ op: "import", id, fileName: file.name }, [record]);
        out.added++;
      } catch (e) {
        out.failed.push([file.name, e instanceof Error ? e.message : String(e)]);
      }
    }
    return out;
  }

  const backend = async (cmd: string, args?: Record<string, unknown>) => {
    const run = commands[cmd];
    if (!run) throw new Error("This works in Voidcat on your Mac for now.");
    return run(args ?? {});
  };
  setWebBackend(backend);

  /** Unlocks every file here, one by one, and zips them; nothing unlocked leaves the browser except as your download. */
  async function exportZip(progress: (done: number, total: number) => void = () => {}) {
    const docs = all();
    const names = zipNames(docs);
    const entries: Record<string, Uint8Array> = {};
    for (const [i, d] of docs.entries()) {
      progress(i, docs.length);
      entries[names[i]] = new Uint8Array(await bytes(d.id));
    }
    progress(docs.length, docs.length);
    return { zip: zipSync(entries, { level: 6 }), count: docs.length };
  }

  return new Promise((resolve, reject) => {
    let first = true;
    const stop = onSnapshot(
      collection(db, "users", uid, "records"),
      async (snap) => {
        for (const change of snap.docChanges()) {
          const id = change.doc.id;
          if (!id.startsWith("doc_")) continue;
          const docId = id.slice(4);
          if (change.type === "removed") {
            records.delete(docId);
            continue;
          }
          try {
            const r = JSON.parse(await openText(keys.records, (change.doc.get("data") as Bytes).toUint8Array())) as DocRecord;
            if (r.kind === "document") records.set(r.id, r);
            // A newer file (re-uploaded by the Mac) must be fetched again.
            files.delete(r.id);
          } catch {
            // A record this key can't open (damaged): left out.
          }
        }
        announce();
        if (first) {
          first = false;
          resolve({
            close: () => {
              stop();
              clearWebBackend(backend);
            },
            upload,
            exportZip,
          });
        }
      },
      (e) => (first ? reject(e) : console.error(e)),
    );
  });
}
