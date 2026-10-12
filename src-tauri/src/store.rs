//! The local library: one SQLite file and a folder of documents, both inside the app's data folder on this Mac.
//! Nothing here touches the network.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}, sync::Mutex};

pub struct Store {
    db: Mutex<Connection>,
    files: PathBuf,
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
-- Page text for search, filled when a document is read.
create virtual table if not exists pages using fts5(document_id unindexed, page unindexed, text, tokenize = 'unicode61 remove_diacritics 2');
";

const COLUMNS: &str = "id, title, file_name, mime, size_bytes, area, doc_type, status, added_at";

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
    })
}

/// A readable title from a file name: "rental_contract-signed.pdf" → "Rental contract signed".
fn title_from(name: &str) -> String {
    let stem = Path::new(name).file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let spaced: String = stem.chars().map(|c| if c == '_' || c == '-' { ' ' } else { c }).collect();
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
        _ => return None,
    };
    Some(m.to_string())
}

impl Store {
    pub fn open(dir: &Path) -> Result<Self, String> {
        let files = dir.join("files");
        fs::create_dir_all(&files).map_err(|e| e.to_string())?;
        let db = Connection::open(dir.join("safebox.db")).map_err(|e| e.to_string())?;
        db.execute_batch("pragma journal_mode = wal; pragma foreign_keys = on;").map_err(|e| e.to_string())?;
        db.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        Ok(Store { db: Mutex::new(db), files })
    }

    /// Copies files into the library. The same content twice is one document.
    pub fn import(&self, paths: Vec<String>) -> Imported {
        let mut out = Imported { added: vec![], duplicates: vec![], failed: vec![] };
        let db = self.db.lock().unwrap();
        for p in paths {
            let path = Path::new(&p);
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("file").to_string();
            let bytes = match fs::read(path) {
                Ok(b) => b,
                Err(e) => {
                    out.failed.push((name, e.to_string()));
                    continue;
                }
            };
            let sha = hex::encode(Sha256::digest(&bytes));
            let known: Option<String> = db.query_row("select id from documents where sha256 = ?1", [&sha], |r| r.get(0)).optional().unwrap_or(None);
            if known.is_some() {
                out.duplicates.push(name);
                continue;
            }
            let id = uuid::Uuid::new_v4().to_string();
            let ext = path.extension().and_then(|s| s.to_str()).map(|e| format!(".{}", e.to_lowercase())).unwrap_or_default();
            let stored = self.files.join(format!("{id}{ext}"));
            if let Err(e) = fs::write(&stored, &bytes) {
                out.failed.push((name, e.to_string()));
                continue;
            }
            let inserted = db.execute(
                "insert into documents (id, title, file_name, mime, size_bytes, sha256, stored_path) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, title_from(&name), name, mime_of(&name), bytes.len() as i64, sha, stored.to_string_lossy()],
            );
            match inserted {
                Ok(_) => match db.query_row(&format!("select {COLUMNS} from documents where id = ?1"), [&id], row_to_document) {
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
        let mut stmt = db.prepare(&format!("select {COLUMNS} from documents order by added_at desc, title")).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], row_to_document).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn stats(&self) -> Result<Stats, String> {
        let db = self.db.lock().unwrap();
        let count = |sql: &str| db.query_row(sql, [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string());
        Ok(Stats {
            documents: count("select count(*) from documents")?,
            facts: count("select count(*) from facts where status = 'approved'")?,
            pending_facts: count("select count(*) from facts where status = 'pending'")?,
        })
    }

    pub fn path_of(&self, id: &str) -> Result<String, String> {
        let db = self.db.lock().unwrap();
        db.query_row("select stored_path from documents where id = ?1", [id], |r| r.get(0)).map_err(|_| "Document not found.".to_string())
    }

    /// Removes a document, its facts, its search text and its stored file.
    pub fn remove(&self, id: &str) -> Result<(), String> {
        let path = self.path_of(id)?;
        let db = self.db.lock().unwrap();
        db.execute("delete from pages where document_id = ?1", [id]).map_err(|e| e.to_string())?;
        db.execute("delete from documents where id = ?1", [id]).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_read_like_names() {
        assert_eq!(title_from("rental_contract-signed.pdf"), "Rental contract signed");
        assert_eq!(title_from("passport.PDF"), "Passport");
    }

    #[test]
    fn imports_once_and_removes() {
        let dir = std::env::temp_dir().join(format!("safebox-test-{}", uuid::Uuid::new_v4()));
        let store = Store::open(&dir).unwrap();
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
        store.remove(&docs[0].id).unwrap();
        assert_eq!(store.stats().unwrap().documents, 0);
        let _ = fs::remove_dir_all(dir);
    }
}
