//! The local library: one SQLite file and a folder of documents, both inside the app's data folder on this Mac.
//! Nothing here touches the network.

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub struct Store {
    pub db: Mutex<Connection>,
    pub(crate) files: PathBuf,
    pub(crate) vault: crate::vault::Vault,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    id: String,
    title: String,
    file_name: String,
    mime: Option<String>,
    size_bytes: i64,
    area: Option<String>,
    doc_type: Option<String>,
    /// new = stored, not read yet · read = text extracted · filed = classified and facts extracted
    status: String,
    added_at: String,
    /// How the text was read: pdf-text, text, ocr (photo), pdf-ocr (scanned PDF), sheet (spreadsheet) or unsupported.
    text_method: Option<String>,
    page_count: Option<i64>,
    folder_id: Option<String>,
    /// "Area › Folder" of the folder it's filed in.
    folder_name: Option<String>,
    /// auto = filed by Voidcat · suggested = waiting for you · confirmed = you chose
    filing: Option<String>,
    /// The folder Voidcat suggests while `filing` is "suggested".
    suggested_area: Option<String>,
    suggested_folder: Option<String>,
    /// True when the suggested folder doesn't exist yet.
    suggested_new: bool,
    suggestion_reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    id: String,
    area: String,
    name: String,
    documents: i64,
}

/// What the classifier proposes for a document.
#[derive(serde::Deserialize)]
pub struct Suggestion {
    area: String,
    folder: String,
    /// high = file it without asking (only when the folder already exists)
    confidence: String,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    page: i64,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    document_id: String,
    title: String,
    page: i64,
    /// A short piece of the page around the match, with matches wrapped in [[ ]].
    snippet: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    id: String,
    document_id: String,
    document_title: String,
    document_mime: Option<String>,
    label: String,
    value: String,
    page: Option<i64>,
    status: String,
}

#[derive(serde::Deserialize)]
pub struct NewFact {
    label: String,
    value: String,
    page: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    added: Vec<Document>,
    /// File names that were already in the library (same content).
    duplicates: Vec<String>,
    /// File names that could not be read, with the reason.
    failed: Vec<(String, String)>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    documents: i64,
    facts: i64,
    pending_facts: i64,
    /// Documents waiting for you to confirm their folder.
    to_file: i64,
}

const SCHEMA: &str = "
create table if not exists documents (
  id text primary key,
  title text not null,
  file_name text not null,
  mime text,
  size_bytes integer not null,
  sha256 text not null unique,
  stored_path text not null,
  area text,
  doc_type text,
  status text not null default 'new',
  added_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create table if not exists facts (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  label text not null,
  value text not null,
  page integer,
  status text not null default 'pending',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create index if not exists facts_document on facts(document_id);
-- Two levels: an area (Identity, Residency…) and a folder inside it.
create table if not exists folders (
  id text primary key,
  area text not null,
  name text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  unique (area, name collate nocase)
);
-- Page text for search, filled when a document is read.
create virtual table if not exists pages using fts5(document_id unindexed, page unindexed, text, tokenize = 'unicode61 remove_diacritics 2');
";

/// Columns added after the first release; added to older libraries on open.
fn migrate(db: &Connection) -> rusqlite::Result<()> {
    let has = |col: &str| -> rusqlite::Result<bool> {
        db.query_row(
            "select count(*) from pragma_table_info('documents') where name = ?1",
            [col],
            |r| r.get::<_, i64>(0),
        )
        .map(|n| n > 0)
    };
    if !has("text_method")? {
        db.execute_batch("alter table documents add column text_method text;")?;
    }
    if !has("page_count")? {
        db.execute_batch("alter table documents add column page_count integer;")?;
    }
    for col in [
        "folder_id text references folders(id) on delete set null",
        "filing text",
        "suggested_area text",
        "suggested_folder text",
        "suggestion_reason text",
    ] {
        let name = col.split(' ').next().unwrap();
        if !has(name)? {
            db.execute_batch(&format!("alter table documents add column {col};"))?;
        }
    }
    // Files added before Voidcat knew their type (spreadsheets, CSV) get it now, so they can be read.
    let unknown: Vec<(String, String)> = db
        .prepare("select id, file_name from documents where mime is null")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    for (id, name) in unknown {
        if let Some(mime) = mime_of(&name) {
            db.execute("update documents set mime = ?2 where id = ?1", params![id, mime])?;
        }
    }
    Ok(())
}

const COLUMNS: &str = "id, title, file_name, mime, size_bytes, area, doc_type, status, added_at, text_method, page_count, folder_id,
  (select f.area || ' › ' || f.name from folders f where f.id = documents.folder_id), filing, suggested_area, suggested_folder,
  suggested_folder is not null and not exists (select 1 from folders f where f.area = documents.suggested_area collate nocase and f.name = documents.suggested_folder collate nocase),
  suggestion_reason";

fn row_to_document(r: &rusqlite::Row) -> rusqlite::Result<Document> {
    Ok(Document {
        id: r.get(0)?,
        title: r.get(1)?,
        file_name: r.get(2)?,
        mime: r.get(3)?,
        size_bytes: r.get(4)?,
        area: r.get(5)?,
        doc_type: r.get(6)?,
        status: r.get(7)?,
        added_at: r.get(8)?,
        text_method: r.get(9)?,
        page_count: r.get(10)?,
        folder_id: r.get(11)?,
        folder_name: r.get(12)?,
        filing: r.get(13)?,
        suggested_area: r.get(14)?,
        suggested_folder: r.get(15)?,
        suggested_new: r.get(16)?,
        suggestion_reason: r.get(17)?,
    })
}

/// A readable title from a file name: "rental_contract-signed.pdf" → "Rental contract signed".
fn title_from(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
    let spaced: String = stem
        .chars()
        .map(|c| if c == '_' || c == '-' { ' ' } else { c })
        .collect();
    let trimmed = spaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = trimmed.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => name.to_string(),
    }
}

fn mime_of(name: &str) -> Option<String> {
    let ext = Path::new(name).extension()?.to_str()?.to_lowercase();
    let m = match ext.as_str() {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "heic" => "image/heic",
        "webp" => "image/webp",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "eml" => "message/rfc822",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls" => "application/vnd.ms-excel",
        "ods" => "application/vnd.oasis.opendocument.spreadsheet",
        "csv" => "text/csv",
        _ => return None,
    };
    Some(m.to_string())
}

/// Puts a document in the suggested folder when it exists and the model is sure; otherwise it waits in "to file".
fn place(tx: &Connection, id: &str, s: &Suggestion) -> Result<(), String> {
    let (folder_area, folder_name) = (s.area.trim(), s.folder.trim());
    let existing: Option<String> = tx
        .query_row("select id from folders where area = ?1 collate nocase and name = ?2 collate nocase", params![folder_area, folder_name], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    match existing {
        Some(folder) if s.confidence == "high" => tx.execute(
            "update documents set folder_id = ?2, area = ?3, filing = 'auto', suggested_area = null, suggested_folder = null, suggestion_reason = ?4 where id = ?1",
            params![id, folder, folder_area, s.reason],
        ),
        _ => tx.execute(
            "update documents set folder_id = null, filing = 'suggested', suggested_area = ?2, suggested_folder = ?3, suggestion_reason = ?4 where id = ?1",
            params![id, folder_area, folder_name, s.reason],
        ),
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Where "Open in default app" puts decrypted copies; emptied on every start.
const OPENED: &str = "opened";

/// Opens the library database with its key. A library from before encryption is converted first: exported into an
/// encrypted copy, every table's row count compared, and only then swapped in (the plain file is deleted after).
fn open_encrypted(path: &Path, key: &str) -> Result<Connection, String> {
    let keyed = |p: &Path| -> Result<Connection, String> {
        let db = Connection::open(p).map_err(|e| e.to_string())?;
        db.execute_batch(&format!("pragma key = \"x'{key}'\";")).map_err(|e| e.to_string())?;
        Ok(db)
    };
    let readable = |db: &Connection| db.query_row("select count(*) from sqlite_master", [], |r| r.get::<_, i64>(0)).is_ok();
    if !path.exists() || !crate::vault::is_encrypted_db(path) && fs::metadata(path).map(|m| m.len() == 0).unwrap_or(true) {
        return keyed(path);
    }
    if crate::vault::is_encrypted_db(path) {
        let db = keyed(path)?;
        return if readable(&db) { Ok(db) } else { Err("The library couldn't be unlocked with the key in the Keychain.".into()) };
    }

    // A plain library: convert it.
    let plain = Connection::open(path).map_err(|e| e.to_string())?;
    plain.execute_batch("pragma wal_checkpoint(truncate);").map_err(|e| e.to_string())?;
    let tables: Vec<String> = {
        let mut stmt = plain
            .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and sql not like 'create virtual%' collate nocase")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };
    let count = |db: &Connection, t: &str| db.query_row(&format!("select count(*) from \"{t}\""), [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string());
    let encrypting = path.with_extension("db.encrypting");
    let _ = fs::remove_file(&encrypting);
    let target = encrypting.to_string_lossy().replace('\'', "''");
    plain
        .execute_batch(&format!("attach database '{target}' as enc key \"x'{key}'\"; select sqlcipher_export('enc'); detach database enc;"))
        .map_err(|e| format!("Couldn't encrypt the library: {e}"))?;
    let version: i64 = plain.query_row("pragma user_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    {
        let enc = keyed(&encrypting)?;
        enc.execute_batch(&format!("pragma user_version = {version};")).map_err(|e| e.to_string())?;
        for t in &tables {
            if count(&plain, t)? != count(&enc, t)? {
                let _ = fs::remove_file(&encrypting);
                return Err(format!("Stopped encrypting: table {t} didn't copy completely. The library is unchanged."));
            }
        }
    }
    drop(plain);
    for side in ["db-wal", "db-shm"] {
        let _ = fs::remove_file(path.with_extension(side));
    }
    fs::rename(&encrypting, path).map_err(|e| e.to_string())?;
    let db = keyed(path)?;
    if readable(&db) { Ok(db) } else { Err("The encrypted library couldn't be opened.".into()) }
}

/// Words that say nothing about a document (greetings, question words, fillers in English and Spanish): a question
/// like "hello there" must not turn up pages that happen to contain "there".
const FILLER: &[&str] = &[
    "hello", "hola", "thanks", "thank", "gracias", "please", "there", "here", "what", "when", "where", "which", "while",
    "whom", "whose", "that", "this", "these", "those", "have", "does", "with", "from", "into", "about", "your", "yours",
    "mine", "they", "them", "their", "then", "than", "were", "been", "being", "would", "could", "should", "will", "shall",
    "some", "much", "many", "more", "most", "also", "just", "only", "very", "like", "want", "need", "know", "tell", "show",
    "give", "find", "make", "okay", "cual", "cuál", "cuando", "cuándo", "donde", "dónde", "como", "cómo", "para",
    "esta", "este", "esto", "estos", "estas", "tengo", "tiene", "sobre", "dime", "quiero", "puedes", "buenas", "buenos",
];

impl Store {
    pub fn open(dir: &Path, vault: crate::vault::Vault) -> Result<Self, String> {
        let files = dir.join("files");
        fs::create_dir_all(&files).map_err(|e| e.to_string())?;
        let db = open_encrypted(&dir.join(crate::legacy::DB), &vault.db_key)?;
        db.execute_batch("pragma journal_mode = wal; pragma foreign_keys = on;")
            .map_err(|e| e.to_string())?;
        db.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        migrate(&db).map_err(|e| e.to_string())?;
        crate::legacy::fix_paths(&db, dir).map_err(|e| e.to_string())?;
        db.execute_batch(crate::calendar::SCHEMA).map_err(|e| e.to_string())?;
        db.execute_batch(crate::opportunities::SCHEMA).map_err(|e| e.to_string())?;
        db.execute_batch(crate::chats::SCHEMA).map_err(|e| e.to_string())?;
        db.execute_batch(crate::labels::SCHEMA).map_err(|e| e.to_string())?;
        db.execute_batch(crate::apps::SCHEMA).map_err(|e| e.to_string())?;
        db.execute_batch(crate::people::SCHEMA).map_err(|e| e.to_string())?;
        db.execute_batch(crate::cloud::SCHEMA).map_err(|e| e.to_string())?;
        let store = Store {
            db: Mutex::new(db),
            files,
            vault,
        };
        store.encrypt_files()?;
        // Copies decrypted for "Open in default app" last until the next start.
        let _ = fs::remove_dir_all(dir.join(OPENED));
        Ok(store)
    }

    /// Encrypts the stored copies of documents added before encryption, each checked against its sha256 before the
    /// plain copy is replaced.
    fn encrypt_files(&self) -> Result<(), String> {
        let docs: Vec<(String, String)> = {
            let db = self.db.lock().unwrap();
            let mut stmt = db.prepare("select stored_path, sha256 from documents").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
            rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
        };
        for (path, sha) in docs {
            let Ok(bytes) = fs::read(&path) else { continue };
            if crate::vault::is_encrypted(&bytes) {
                continue;
            }
            let sealed = self.vault.encrypt(&bytes)?;
            let back = self.vault.decrypt(sealed.clone())?;
            if hex::encode(Sha256::digest(&back)) != sha {
                return Err(format!("Stopped encrypting: {path} didn't read back the same."));
            }
            let tmp = format!("{path}.encrypting");
            fs::write(&tmp, &sealed).map_err(|e| e.to_string())?;
            fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Whether `vault` opens the library in `dir` (a recovery key typed in), without changing anything.
    pub fn opens(dir: &Path, vault: &crate::vault::Vault) -> bool {
        let path = dir.join(crate::legacy::DB);
        crate::vault::is_encrypted_db(&path) && open_encrypted(&path, &vault.db_key).is_ok()
    }

    pub fn recovery_code(&self) -> String {
        self.vault.recovery_code()
    }

    /// Every document decrypted, named "Area/Folder/file name" (or "Not filed/…"), for one backup zip.
    pub fn export_all(&self) -> Result<Vec<(String, Vec<u8>)>, String> {
        let docs: Vec<(String, String)> = {
            let db = self.db.lock().unwrap();
            let mut stmt = db
                .prepare(
                    "select coalesce(f.area || '/' || f.name, 'Not filed') || '/' || d.file_name, d.stored_path
                     from documents d left join folders f on f.id = d.folder_id order by 1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
            rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
        };
        docs.into_iter()
            .map(|(name, path)| {
                let bytes = fs::read(&path).map_err(|e| format!("{name} could not be read: {e}"))?;
                Ok((name.replace(['\\', ':'], " "), self.vault.decrypt(bytes)?))
            })
            .collect()
    }

    /// A document's file decrypted into the library's "opened" folder, for opening in another app.
    pub fn plain_copy(&self, id: &str) -> Result<PathBuf, String> {
        let (name, bytes) = self.contents_of(&[id.to_string()])?.remove(0);
        let dir = self.files.parent().unwrap_or(&self.files).join(OPENED).join(id);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(Path::new(&name).file_name().unwrap_or_default());
        fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(path)
    }

    /// Copies files into the library. The same content twice is one document.
    pub fn import(&self, paths: Vec<String>) -> Imported {
        let mut out = Imported {
            added: vec![],
            duplicates: vec![],
            failed: vec![],
        };
        let db = self.db.lock().unwrap();
        for p in paths {
            let path = Path::new(&p);
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("file")
                .to_string();
            let bytes = match fs::read(path) {
                Ok(b) => b,
                Err(e) => {
                    out.failed.push((name, e.to_string()));
                    continue;
                }
            };
            let sha = hex::encode(Sha256::digest(&bytes));
            let known: Option<String> = db
                .query_row("select id from documents where sha256 = ?1", [&sha], |r| {
                    r.get(0)
                })
                .optional()
                .unwrap_or(None);
            if known.is_some() {
                out.duplicates.push(name);
                continue;
            }
            let id = uuid::Uuid::new_v4().to_string();
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|e| format!(".{}", e.to_lowercase()))
                .unwrap_or_default();
            let stored = self.files.join(format!("{id}{ext}"));
            let sealed = match self.vault.encrypt(&bytes) {
                Ok(b) => b,
                Err(e) => {
                    out.failed.push((name, e));
                    continue;
                }
            };
            if let Err(e) = fs::write(&stored, &sealed) {
                out.failed.push((name, e.to_string()));
                continue;
            }
            let inserted = db.execute(
                "insert into documents (id, title, file_name, mime, size_bytes, sha256, stored_path) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, title_from(&name), name, mime_of(&name), bytes.len() as i64, sha, stored.to_string_lossy()],
            );
            match inserted {
                Ok(_) => match db.query_row(
                    &format!("select {COLUMNS} from documents where id = ?1"),
                    [&id],
                    row_to_document,
                ) {
                    Ok(doc) => out.added.push(doc),
                    Err(e) => out.failed.push((name, e.to_string())),
                },
                Err(e) => {
                    let _ = fs::remove_file(&stored);
                    out.failed.push((name, e.to_string()));
                }
            }
        }
        out
    }

    pub fn list(&self) -> Result<Vec<Document>, String> {
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare(&format!(
                "select {COLUMNS} from documents order by added_at desc, title"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], row_to_document)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn stats(&self) -> Result<Stats, String> {
        let db = self.db.lock().unwrap();
        let count = |sql: &str| {
            db.query_row(sql, [], |r| r.get::<_, i64>(0))
                .map_err(|e| e.to_string())
        };
        Ok(Stats {
            documents: count("select count(*) from documents")?,
            facts: count("select count(*) from facts where status = 'approved'")?,
            pending_facts: count("select count(*) from facts where status = 'pending'")?,
            to_file: count("select count(*) from documents where filing = 'suggested'")?,
        })
    }

    pub fn path_of(&self, id: &str) -> Result<String, String> {
        let db = self.db.lock().unwrap();
        db.query_row(
            "select stored_path from documents where id = ?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|_| "Document not found.".to_string())
    }

    /// Each document's original file name and its contents (decrypted), in the order asked.
    pub fn contents_of(&self, ids: &[String]) -> Result<Vec<(String, Vec<u8>)>, String> {
        let paths: Vec<(String, String)> = {
            let db = self.db.lock().unwrap();
            ids.iter()
                .map(|id| {
                    db.query_row("select file_name, stored_path from documents where id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
                        .map_err(|_| "Document not found.".to_string())
                })
                .collect::<Result<_, _>>()?
        };
        paths
            .into_iter()
            .map(|(name, path)| {
                let bytes = fs::read(&path).map_err(|e| format!("{name} could not be read: {e}"))?;
                Ok((name, self.vault.decrypt(bytes)?))
            })
            .collect()
    }

    pub fn bytes_of(&self, id: &str) -> Result<Vec<u8>, String> {
        self.vault.decrypt(fs::read(self.path_of(id)?).map_err(|e| e.to_string())?)
    }

    /// Stores the text of each page (replacing any earlier reading) so it can be searched.
    pub fn save_reading(&self, id: &str, pages: Vec<String>, method: &str) -> Result<(), String> {
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("delete from pages where document_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        for (i, text) in pages.iter().enumerate() {
            if text.trim().is_empty() {
                continue;
            }
            tx.execute(
                "insert into pages (document_id, page, text) values (?1, ?2, ?3)",
                params![id, (i + 1) as i64, text],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.execute(
            "update documents set status = case when status = 'filed' then 'filed' else 'read' end, text_method = ?2, page_count = ?3 where id = ?1",
            params![id, method, pages.len() as i64],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn pages(&self, id: &str) -> Result<Vec<Page>, String> {
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare("select page, text from pages where document_id = ?1 order by page")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([id], |r| {
                Ok(Page {
                    page: r.get(0)?,
                    text: r.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// Full-text search inside every page; accents don't matter. With `any`, a page matching some of the words is
    /// enough (best matches first), which suits questions; otherwise every word must appear (as a prefix).
    pub fn search(&self, query: &str, any: bool) -> Result<Vec<Hit>, String> {
        let words: Vec<String> = query
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| !w.is_empty() && (!any || (w.chars().count() > 3 && !FILLER.contains(&w.to_lowercase().as_str()))))
            .map(|w| format!("\"{}\"*", w.replace('"', "")))
            .collect();
        if words.is_empty() {
            return Ok(vec![]);
        }
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare(
                "select p.document_id, d.title, p.page, snippet(pages, 2, '[[', ']]', ' … ', 14)
                 from pages p join documents d on d.id = p.document_id
                 where pages match ?1 order by rank limit 30",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([words.join(if any { " OR " } else { " " })], |r| {
                Ok(Hit {
                    document_id: r.get(0)?,
                    title: r.get(1)?,
                    page: r.get(2)?,
                    snippet: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// Files a document (title, area, type) and adds the facts found in it, waiting for approval.
    /// Facts from an earlier filing that were never approved are replaced. The folder suggestion is applied at once
    /// when the folder already exists and the classifier is confident; otherwise it waits for the user.
    pub fn save_filing(
        &self,
        id: &str,
        title: &str,
        area: &str,
        doc_type: &str,
        facts: Vec<NewFact>,
        suggestion: Option<Suggestion>,
    ) -> Result<(), String> {
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("update documents set title = ?2, area = ?3, doc_type = ?4, status = 'filed' where id = ?1", params![id, title, area, doc_type])
            .map_err(|e| e.to_string())?;
        tx.execute(
            "delete from facts where document_id = ?1 and status = 'pending'",
            [id],
        )
        .map_err(|e| e.to_string())?;
        for f in facts {
            if f.label.trim().is_empty() || f.value.trim().is_empty() {
                continue;
            }
            tx.execute(
                "insert into facts (id, document_id, label, value, page) values (?1, ?2, ?3, ?4, ?5)",
                params![uuid::Uuid::new_v4().to_string(), id, f.label.trim(), f.value.trim(), f.page],
            )
            .map_err(|e| e.to_string())?;
        }
        // A document the user already placed keeps its folder.
        let placed: Option<String> = tx
            .query_row("select filing from documents where id = ?1", [id], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        if let (Some(s), false) = (suggestion, placed.as_deref() == Some("confirmed")) {
            place(&tx, id, &s)?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    /// Files a document again: a new area, type and folder suggestion, even over a folder you chose. Its facts stay as
    /// they are. A folder the document leaves empty is removed.
    pub fn refile(&self, id: &str, area: &str, doc_type: &str, suggestion: Suggestion) -> Result<(), String> {
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let old: Option<String> = tx
            .query_row("select folder_id from documents where id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        tx.execute("update documents set area = ?2, doc_type = ?3 where id = ?1", params![id, area, doc_type])
            .map_err(|e| e.to_string())?;
        place(&tx, id, &suggestion)?;
        if let Some(old) = old {
            tx.execute("delete from folders where id = ?1 and not exists (select 1 from documents where folder_id = ?1)", [&old])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    /// All folders, with how many documents each holds (empty ones too).
    pub fn folders(&self) -> Result<Vec<Folder>, String> {
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare("select f.id, f.area, f.name, (select count(*) from documents d where d.folder_id = f.id) from folders f order by f.area, f.name collate nocase")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Folder {
                    id: r.get(0)?,
                    area: r.get(1)?,
                    name: r.get(2)?,
                    documents: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// Puts a document in a folder, creating the folder when it doesn't exist yet. Returns the folder id.
    pub fn file_document(&self, id: &str, area: &str, name: &str) -> Result<String, String> {
        let (area, name) = (area.trim(), name.trim());
        if area.is_empty() || name.is_empty() {
            return Err("A folder needs an area and a name.".into());
        }
        let db = self.db.lock().unwrap();
        let find = || -> rusqlite::Result<Option<(String, String)>> {
            db.query_row("select id, area from folders where area = ?1 collate nocase and name = ?2 collate nocase", params![area, name], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()
        };
        let (folder, folder_area) = match find().map_err(|e| e.to_string())? {
            Some(found) => found,
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                db.execute(
                    "insert into folders (id, area, name) values (?1, ?2, ?3)",
                    params![id, area, name],
                )
                .map_err(|e| e.to_string())?;
                (id, area.to_string())
            }
        };
        db.execute(
            "update documents set folder_id = ?2, area = ?3, filing = 'confirmed', suggested_area = null, suggested_folder = null where id = ?1",
            params![id, folder, folder_area],
        )
        .map_err(|e| e.to_string())?;
        Ok(folder)
    }

    /// Moves a folder, with its documents, to another area. When that area already has a folder of the same name, the
    /// two become one. Returns the folder the documents are in now.
    pub fn move_folder(&self, id: &str, area: &str) -> Result<String, String> {
        let area = area.trim();
        if area.is_empty() {
            return Err("Choose an area.".into());
        }
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let name: String = tx
            .query_row("select name from folders where id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let same: Option<String> = tx
            .query_row("select id from folders where area = ?1 collate nocase and name = ?2 collate nocase and id != ?3", params![area, name, id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        let into = match same {
            Some(other) => {
                tx.execute("update documents set folder_id = ?2 where folder_id = ?1", params![id, other]).map_err(|e| e.to_string())?;
                tx.execute("delete from folders where id = ?1", [id]).map_err(|e| e.to_string())?;
                other
            }
            None => {
                tx.execute("update folders set area = ?2 where id = ?1", params![id, area]).map_err(|e| e.to_string())?;
                id.to_string()
            }
        };
        tx.execute("update documents set area = ?2 where folder_id = ?1", params![into, area]).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(into)
    }

    /// The name a document shows everywhere in Voidcat; the stored file keeps its own name.
    pub fn rename_document(&self, id: &str, title: &str) -> Result<(), String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("Give the document a name.".into());
        }
        let db = self.db.lock().unwrap();
        db.execute("update documents set title = ?2 where id = ?1", params![id, title])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn rename_folder(&self, id: &str, name: &str) -> Result<(), String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Give the folder a name.".into());
        }
        let db = self.db.lock().unwrap();
        db.execute(
            "update folders set name = ?2 where id = ?1",
            params![id, name],
        )
        .map_err(|e| match e {
            rusqlite::Error::SqliteFailure(f, _)
                if f.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                "A folder with that name already exists.".to_string()
            }
            e => e.to_string(),
        })?;
        Ok(())
    }

    pub fn facts(&self, status: &str) -> Result<Vec<Fact>, String> {
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare(
                "select f.id, f.document_id, d.title, d.mime, f.label, f.value, f.page, f.status
                 from facts f join documents d on d.id = f.document_id
                 where f.status = ?1 order by d.added_at desc, f.page, f.rowid",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([status], |r| {
                Ok(Fact {
                    id: r.get(0)?,
                    document_id: r.get(1)?,
                    document_title: r.get(2)?,
                    document_mime: r.get(3)?,
                    label: r.get(4)?,
                    value: r.get(5)?,
                    page: r.get(6)?,
                    status: r.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// Approve or reject a fact, optionally correcting its value first.
    pub fn settle_fact(&self, id: &str, status: &str, value: Option<String>) -> Result<(), String> {
        if !["approved", "rejected", "pending"].contains(&status) {
            return Err("Unknown status.".into());
        }
        let db = self.db.lock().unwrap();
        match value {
            Some(v) if !v.trim().is_empty() => db.execute(
                "update facts set status = ?2, value = ?3 where id = ?1",
                params![id, status, v.trim()],
            ),
            _ => db.execute(
                "update facts set status = ?2 where id = ?1",
                params![id, status],
            ),
        }
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Removes a document, its facts, its search text and its stored file.
    pub fn remove(&self, id: &str) -> Result<(), String> {
        let path = self.path_of(id)?;
        let db = self.db.lock().unwrap();
        db.execute("delete from pages where document_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        db.execute("delete from documents where id = ?1", [id])
            .map_err(|e| e.to_string())?;
        let _ = fs::remove_file(path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_read_like_names() {
        assert_eq!(
            title_from("rental_contract-signed.pdf"),
            "Rental contract signed"
        );
        assert_eq!(title_from("passport.PDF"), "Passport");
    }

    #[test]
    fn refiling_moves_a_document_keeps_its_facts_and_drops_the_empty_folder() {
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4()));
        let store = Store::open(&dir, crate::vault::Vault::from_master(&[3; 32])).unwrap();
        let src = dir.join("grant.xlsx");
        fs::write(&src, b"example").unwrap();
        store.import(vec![src.to_string_lossy().to_string()]);
        let id = store.list().unwrap()[0].id.clone();
        store
            .save_filing(&id, "Equity grant", "Travel", "grant", vec![NewFact { label: "Initial grant".into(), value: "6000".into(), page: Some(1) }], None)
            .unwrap();
        store.file_document(&id, "Travel", "Passports").unwrap();
        let fact = store.facts("pending").unwrap()[0].id.clone();
        store.settle_fact(&fact, "approved", None).unwrap();

        store.file_document(&id, "Work & money", "Equity").unwrap();
        store.file_document(&id, "Travel", "Passports").unwrap();
        let s = Suggestion { area: "Work & money".into(), folder: "equity".into(), confidence: "high".into(), reason: "An equity grant".into() };
        store.refile(&id, "Work & money", "equity_grant", s).unwrap();

        let doc = &store.list().unwrap()[0];
        assert_eq!(doc.folder_name.as_deref(), Some("Work & money › Equity"));
        assert_eq!(doc.area.as_deref(), Some("Work & money"));
        assert_eq!(store.facts("approved").unwrap().len(), 1, "facts are kept");
        assert!(store.folders().unwrap().iter().all(|f| f.area != "Travel"), "the folder it left empty is gone");
    }

    #[test]
    fn moving_a_folder_takes_its_documents_and_merges_with_a_namesake() {
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4()));
        let store = Store::open(&dir, crate::vault::Vault::from_master(&[3; 32])).unwrap();
        for name in ["a.pdf", "b.pdf"] {
            let src = dir.join(name);
            fs::write(&src, name.as_bytes()).unwrap();
            store.import(vec![src.to_string_lossy().to_string()]);
        }
        let ids: Vec<String> = store.list().unwrap().iter().map(|d| d.id.clone()).collect();
        let travel = store.file_document(&ids[0], "Travel", "Passports").unwrap();

        assert_eq!(store.move_folder(&travel, "Identity").unwrap(), travel, "a plain move keeps the folder");
        assert!(store.list().unwrap().iter().any(|d| d.folder_name.as_deref() == Some("Identity › Passports") && d.area.as_deref() == Some("Identity")));

        let other = store.file_document(&ids[1], "Travel", "Passports").unwrap();
        assert_eq!(store.move_folder(&other, "Identity").unwrap(), travel, "same name in the new area: merged");
        assert_eq!(store.folders().unwrap().len(), 1);
        assert!(store.list().unwrap().iter().all(|d| d.folder_id.as_deref() == Some(travel.as_str())));
    }

    #[test]
    fn renames_documents_and_folders() {
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4()));
        let store = Store::open(&dir, crate::vault::Vault::from_master(&[3; 32])).unwrap();
        let src = dir.join("scan.pdf");
        fs::write(&src, b"scan").unwrap();
        store.import(vec![src.to_string_lossy().to_string()]);
        let id = store.list().unwrap()[0].id.clone();
        store.rename_document(&id, "  Passport, renewed ").unwrap();
        assert_eq!(store.list().unwrap()[0].title, "Passport, renewed");
        assert!(store.rename_document(&id, " ").is_err());

        let folder = store.file_document(&id, "Identity", "Passports").unwrap();
        store.file_document(&id, "Identity", "IDs").unwrap();
        assert!(store.rename_folder(&folder, "ids").is_err(), "names are unique in an area");
        store.rename_folder(&folder, "Old passports").unwrap();
        assert!(store.folders().unwrap().iter().any(|f| f.name == "Old passports"));
    }

    #[test]
    fn imports_once_and_removes() {
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4()));
        let store = Store::open(&dir, crate::vault::Vault::from_master(&[3; 32])).unwrap();
        let src = dir.join("lease.pdf");
        fs::write(&src, b"%PDF-1.4 example").unwrap();
        let p = src.to_string_lossy().to_string();

        let first = store.import(vec![p.clone()]);
        assert_eq!(first.added.len(), 1);
        let again = store.import(vec![p]);
        assert_eq!(again.duplicates, vec!["lease.pdf".to_string()]);

        let docs = store.list().unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].mime.as_deref(), Some("application/pdf"));
        let id = docs[0].id.clone();
        store
            .save_reading(
                &id,
                vec!["Contrato de arrendamiento. Renta mensual 1.150 euros.".into()],
                "pdf-text",
            )
            .unwrap();
        let hits = store.search("arrendamiento renta", false).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains("[[arrendamiento]]"));
        assert_eq!(
            store.search("contrato", false).unwrap().len(),
            1,
            "prefix and accent-insensitive"
        );
        assert_eq!(
            store
                .search("cuanto es la renta mensual", true)
                .unwrap()
                .len(),
            1,
            "any word, for questions"
        );
        assert!(
            store.search("hola, buenas, gracias", true).unwrap().is_empty(),
            "greetings and fillers find nothing"
        );

        let suggest = |confidence: &str| {
            Some(Suggestion {
                area: "Home".into(),
                folder: "Leases".into(),
                confidence: confidence.into(),
                reason: "A rental contract".into(),
            })
        };
        store
            .save_filing(
                &id,
                "Rental contract",
                "Home",
                "rental_contract",
                vec![NewFact {
                    label: "Rent".into(),
                    value: "€1,150 a month".into(),
                    page: Some(1),
                }],
                suggest("high"),
            )
            .unwrap();
        // No "Home › Leases" folder yet: even a confident suggestion waits for the user.
        let doc = &store.list().unwrap()[0];
        assert_eq!(doc.filing.as_deref(), Some("suggested"));
        assert!(doc.suggested_new);
        assert_eq!(store.stats().unwrap().to_file, 1);

        let folder = store.file_document(&id, "Home", "Leases").unwrap();
        let doc = &store.list().unwrap()[0];
        assert_eq!(
            (doc.filing.as_deref(), doc.folder_name.as_deref()),
            (Some("confirmed"), Some("Home › Leases"))
        );
        assert_eq!(store.folders().unwrap()[0].documents, 1);
        store.file_document(&id, "home", "leases").unwrap();
        assert_eq!(
            store.folders().unwrap().len(),
            1,
            "same folder whatever the case"
        );

        // A confirmed document keeps its folder when it's read again.
        store
            .save_filing(
                &id,
                "Rental contract",
                "Home",
                "rental_contract",
                vec![],
                suggest("low"),
            )
            .unwrap();
        assert_eq!(
            store.list().unwrap()[0].folder_id.as_deref(),
            Some(folder.as_str())
        );
        store.rename_folder(&folder, "Lease Provença").unwrap();
        assert_eq!(
            store.list().unwrap()[0].folder_name.as_deref(),
            Some("Home › Lease Provença")
        );
        store
            .save_filing(
                &id,
                "Rental contract",
                "Home",
                "rental_contract",
                vec![NewFact {
                    label: "Rent".into(),
                    value: "€1,150 a month".into(),
                    page: Some(1),
                }],
                None,
            )
            .unwrap();
        let pending = store.facts("pending").unwrap();
        assert_eq!(pending.len(), 1);
        store
            .settle_fact(&pending[0].id, "approved", Some("€1,150 / month".into()))
            .unwrap();
        assert_eq!(store.facts("approved").unwrap()[0].value, "€1,150 / month");
        assert_eq!(store.stats().unwrap().facts, 1);

        store.remove(&id).unwrap();
        assert!(store.search("renta", false).unwrap().is_empty());
        assert_eq!(store.stats().unwrap().documents, 0);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn exports_everything_and_checks_recovery_keys() {
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4()));
        let vault = crate::vault::Vault::from_master(&[6; 32]);
        let code = vault.recovery_code();
        let store = Store::open(&dir, vault).unwrap();
        let src = dir.join("note.txt");
        fs::write(&src, b"invented note").unwrap();
        store.import(vec![src.to_string_lossy().into()]);
        let all = store.export_all().unwrap();
        assert_eq!(all, vec![("Not filed/note.txt".to_string(), b"invented note".to_vec())]);
        drop(store);
        assert!(Store::opens(&dir, &crate::vault::Vault::from_recovery_code(&code).unwrap()));
        assert!(!Store::opens(&dir, &crate::vault::Vault::from_master(&[7; 32])));
    }

    #[test]
    fn converts_a_library_from_before_encryption() {
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("files")).unwrap();
        let stored = dir.join("files").join("lease.pdf");
        fs::write(&stored, b"%PDF-1.4 invented lease").unwrap();
        {
            let plain = Connection::open(dir.join(crate::legacy::DB)).unwrap();
            plain.execute_batch(SCHEMA).unwrap();
            plain
                .execute(
                    "insert into documents (id, title, file_name, mime, size_bytes, sha256, stored_path) values ('d1', 'Lease', 'lease.pdf', 'application/pdf', 23, ?1, ?2)",
                    params![hex::encode(Sha256::digest(b"%PDF-1.4 invented lease")), stored.to_string_lossy()],
                )
                .unwrap();
            plain.execute("insert into pages (document_id, page, text) values ('d1', 1, 'contrato de arrendamiento')", []).unwrap();
        }

        let store = Store::open(&dir, crate::vault::Vault::from_master(&[3; 32])).unwrap();
        assert!(crate::vault::is_encrypted_db(&dir.join(crate::legacy::DB)), "the database is encrypted");
        assert!(crate::vault::is_encrypted(&fs::read(&stored).unwrap()), "the stored file is encrypted");
        assert_eq!(store.list().unwrap().len(), 1);
        assert_eq!(store.search("arrendamiento", false).unwrap().len(), 1);
        assert_eq!(store.bytes_of("d1").unwrap(), b"%PDF-1.4 invented lease");
        assert_eq!(fs::read(store.plain_copy("d1").unwrap()).unwrap(), b"%PDF-1.4 invented lease");
        drop(store);

        // Opens again with the same key, and refuses another one.
        assert!(Store::open(&dir, crate::vault::Vault::from_master(&[3; 32])).is_ok());
        assert!(Store::open(&dir, crate::vault::Vault::from_master(&[4; 32])).is_err());
    }
}

#[cfg(test)]
mod copy_check {
    /// Converts a copy of a real library (VOIDCAT_COPY) with a throwaway key; prints only counts.
    #[test]
    #[ignore]
    fn converts_a_copy() {
        let Ok(dir) = std::env::var("VOIDCAT_COPY") else { return };
        let dir = std::path::PathBuf::from(dir);
        let store = super::Store::open(&dir, crate::vault::Vault::from_master(&[9; 32])).unwrap();
        let docs = store.list().unwrap();
        let mut read = 0;
        for d in &docs {
            if store.bytes_of(&d.id).is_ok() {
                read += 1;
            }
        }
        let db = store.db.lock().unwrap();
        let pages: i64 = db.query_row("select count(*) from pages", [], |r| r.get(0)).unwrap();
        let facts: i64 = db.query_row("select count(*) from facts", [], |r| r.get(0)).unwrap();
        let chats: i64 = db.query_row("select count(*) from chats", [], |r| r.get(0)).unwrap();
        println!("documents {} (files read back {read}), pages {pages}, facts {facts}, chats {chats}", docs.len());
        println!("db encrypted {}", crate::vault::is_encrypted_db(&dir.join(crate::legacy::DB)));
    }
}
