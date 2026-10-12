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
    /// How the text was read: pdf-text, text, ocr (photo), pdf-ocr (scanned PDF) or unsupported.
    text_method: Option<String>,
    page_count: Option<i64>,
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

/// Columns added after the first release; added to older libraries on open.
fn migrate(db: &Connection) -> rusqlite::Result<()> {
    let has = |col: &str| -> rusqlite::Result<bool> {
        db.query_row("select count(*) from pragma_table_info('documents') where name = ?1", [col], |r| r.get::<_, i64>(0)).map(|n| n > 0)
    };
    if !has("text_method")? {
        db.execute_batch("alter table documents add column text_method text;")?;
    }
    if !has("page_count")? {
        db.execute_batch("alter table documents add column page_count integer;")?;
    }
    Ok(())
}

const COLUMNS: &str = "id, title, file_name, mime, size_bytes, area, doc_type, status, added_at, text_method, page_count";

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
        migrate(&db).map_err(|e| e.to_string())?;
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

    pub fn bytes_of(&self, id: &str) -> Result<Vec<u8>, String> {
        fs::read(self.path_of(id)?).map_err(|e| e.to_string())
    }

    /// Stores the text of each page (replacing any earlier reading) so it can be searched.
    pub fn save_reading(&self, id: &str, pages: Vec<String>, method: &str) -> Result<(), String> {
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("delete from pages where document_id = ?1", [id]).map_err(|e| e.to_string())?;
        for (i, text) in pages.iter().enumerate() {
            if text.trim().is_empty() {
                continue;
            }
            tx.execute("insert into pages (document_id, page, text) values (?1, ?2, ?3)", params![id, (i + 1) as i64, text]).map_err(|e| e.to_string())?;
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
        let mut stmt = db.prepare("select page, text from pages where document_id = ?1 order by page").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([id], |r| Ok(Page { page: r.get(0)?, text: r.get(1)? })).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// Full-text search inside every page; accents don't matter. With `any`, a page matching some of the words is
    /// enough (best matches first), which suits questions; otherwise every word must appear (as a prefix).
    pub fn search(&self, query: &str, any: bool) -> Result<Vec<Hit>, String> {
        let words: Vec<String> = query
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| !w.is_empty() && (!any || w.chars().count() > 3))
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
            .query_map([words.join(if any { " OR " } else { " " })], |r| Ok(Hit { document_id: r.get(0)?, title: r.get(1)?, page: r.get(2)?, snippet: r.get(3)? }))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// Files a document (title, area, type) and adds the facts found in it, waiting for approval.
    /// Facts from an earlier filing that were never approved are replaced.
    pub fn save_filing(&self, id: &str, title: &str, area: &str, doc_type: &str, facts: Vec<NewFact>) -> Result<(), String> {
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("update documents set title = ?2, area = ?3, doc_type = ?4, status = 'filed' where id = ?1", params![id, title, area, doc_type])
            .map_err(|e| e.to_string())?;
        tx.execute("delete from facts where document_id = ?1 and status = 'pending'", [id]).map_err(|e| e.to_string())?;
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
        tx.commit().map_err(|e| e.to_string())
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
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// Approve or reject a fact, optionally correcting its value first.
    pub fn settle_fact(&self, id: &str, status: &str, value: Option<String>) -> Result<(), String> {
        if !["approved", "rejected", "pending"].contains(&status) {
            return Err("Unknown status.".into());
        }
        let db = self.db.lock().unwrap();
        match value {
            Some(v) if !v.trim().is_empty() => db.execute("update facts set status = ?2, value = ?3 where id = ?1", params![id, status, v.trim()]),
            _ => db.execute("update facts set status = ?2 where id = ?1", params![id, status]),
        }
        .map_err(|e| e.to_string())?;
        Ok(())
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
        let id = docs[0].id.clone();
        store.save_reading(&id, vec!["Contrato de arrendamiento. Renta mensual 1.150 euros.".into()], "pdf-text").unwrap();
        let hits = store.search("arrendamiento renta", false).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains("[[arrendamiento]]"));
        assert_eq!(store.search("contrato", false).unwrap().len(), 1, "prefix and accent-insensitive");
        assert_eq!(store.search("cuanto es la renta mensual", true).unwrap().len(), 1, "any word, for questions");

        store
            .save_filing(&id, "Rental contract", "Home", "rental_contract", vec![NewFact { label: "Rent".into(), value: "€1,150 a month".into(), page: Some(1) }])
            .unwrap();
        let pending = store.facts("pending").unwrap();
        assert_eq!(pending.len(), 1);
        store.settle_fact(&pending[0].id, "approved", Some("€1,150 / month".into())).unwrap();
        assert_eq!(store.facts("approved").unwrap()[0].value, "€1,150 / month");
        assert_eq!(store.stats().unwrap().facts, 1);

        store.remove(&id).unwrap();
        assert!(store.search("renta", false).unwrap().is_empty());
        assert_eq!(store.stats().unwrap().documents, 0);
        let _ = fs::remove_dir_all(dir);
    }
}
