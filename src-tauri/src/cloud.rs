//! Voidcat Cloud from the Mac. The interface signs in and talks to Firebase; this side decides what goes up and locks
//! it first, so the cloud only ever gets sealed bytes: each document is one record (its details, facts and page text,
//! sealed with the records key) plus its stored file, which is already sealed with the files key.
//! Nothing here touches the network.

use crate::store::Store;
use crate::vault::Vault;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

pub const SCHEMA: &str = "
-- The cloud account this Mac syncs to (one row at most).
create table if not exists cloud_account (
  id integer primary key check (id = 1),
  uid text not null,
  email text,
  new_documents integer not null default 1,
  connected_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  synced_at text
);
-- The account the uploads below belong to; kept after disconnecting, so another account starts over.
create table if not exists cloud_last_uid (value text not null);
-- One row per document: whether it should be in the cloud, and what was last uploaded (hashes of the record's plain
-- JSON and of the file). No foreign key, so a removed document's row stays until its cloud copy is deleted.
create table if not exists cloud_sync (
  document_id text primary key,
  keep integer not null,
  record_hash text,
  file_hash text,
  uploaded_at text,
  error text
);
";

/// The check phrase sealed in `users/{uid}`; a key that opens it opens the library (same as `src/cloud/account.ts`).
const CHECK: &[u8] = b"voidcat-library-check";
/// Firestore takes up to 1 MiB a document; the sealed record stays well under the rules' 900,000 bytes.
const MAX_RECORD: usize = 850_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    uid: String,
    email: Option<String>,
    new_documents: bool,
    synced_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Upload {
    id: String,
    title: String,
    record_hash: String,
    /// The file's sha256, and whether it has to go up (new, or changed since the last upload).
    file_hash: String,
    file: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    upload: Vec<Upload>,
    /// Documents whose cloud copy must go: turned off, or removed from the library.
    remove: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mark {
    id: String,
    /// cloud = uploaded and up to date · pending = waiting or uploading · failed · local = kept only on this Mac
    state: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    kind: &'static str,
    v: u32,
    id: String,
    title: String,
    file_name: String,
    mime: Option<String>,
    size_bytes: i64,
    sha256: String,
    area: Option<String>,
    doc_type: Option<String>,
    status: String,
    added_at: String,
    text_method: Option<String>,
    page_count: Option<i64>,
    folder: Option<(String, String)>,
    filing: Option<String>,
    facts: Vec<RecordFact>,
    pages: Vec<(i64, String)>,
    /// Some page text was left out to keep the record small enough.
    pages_cut: bool,
}

#[derive(Serialize)]
struct RecordFact {
    id: String,
    label: String,
    value: String,
    page: Option<i64>,
    status: String,
}

fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

impl Store {
    pub fn cloud_account(&self) -> Result<Option<Account>, String> {
        let db = self.db.lock().unwrap();
        db.query_row("select uid, email, new_documents, synced_at from cloud_account", [], |r| {
            Ok(Account { uid: r.get(0)?, email: r.get(1)?, new_documents: r.get(2)?, synced_at: r.get(3)? })
        })
        .optional()
        .map_err(|e| e.to_string())
    }

    /// Connects this Mac to an account. Every document goes to the cloud; another account than last time starts over.
    pub fn cloud_connect(&self, uid: &str, email: Option<&str>) -> Result<(), String> {
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let before: Option<String> = tx.query_row("select uid from cloud_account", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        let last: Option<String> = tx.query_row("select value from cloud_last_uid", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        if before.as_deref().or(last.as_deref()).is_some_and(|u| u != uid) {
            tx.execute("delete from cloud_sync", []).map_err(|e| e.to_string())?;
        }
        tx.execute("delete from cloud_account", []).map_err(|e| e.to_string())?;
        tx.execute("insert into cloud_account (id, uid, email) values (1, ?1, ?2)", params![uid, email]).map_err(|e| e.to_string())?;
        tx.execute("delete from cloud_last_uid", []).map_err(|e| e.to_string())?;
        tx.execute("insert into cloud_last_uid (value) values (?1)", [uid]).map_err(|e| e.to_string())?;
        tx.execute("insert or ignore into cloud_sync (document_id, keep) select id, 1 from documents", []).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    /// Stops syncing. What was uploaded is remembered, so connecting the same account again only sends what changed.
    pub fn cloud_disconnect(&self) -> Result<(), String> {
        self.db.lock().unwrap().execute("delete from cloud_account", []).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// After the cloud copy was deleted: nothing is up there any more.
    pub fn cloud_forget_uploads(&self) -> Result<(), String> {
        let db = self.db.lock().unwrap();
        db.execute("delete from cloud_sync where document_id not in (select id from documents)", []).map_err(|e| e.to_string())?;
        db.execute("update cloud_sync set record_hash = null, file_hash = null, uploaded_at = null, error = null", []).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn cloud_set_new_documents(&self, on: bool) -> Result<(), String> {
        self.db.lock().unwrap().execute("update cloud_account set new_documents = ?1", [on]).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Keep one document in the cloud, or only on this Mac (its cloud copy is then deleted by the next sync).
    pub fn cloud_keep(&self, id: &str, keep: bool) -> Result<(), String> {
        self.db
            .lock()
            .unwrap()
            .execute(
                "insert into cloud_sync (document_id, keep) values (?1, ?2) on conflict(document_id) do update set keep = ?2, error = null",
                params![id, keep],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// A document as one record: its details, folder, facts and page text, as JSON (plain; sealed by the caller).
    fn cloud_record_json(&self, id: &str) -> Result<Vec<u8>, String> {
        let db = self.db.lock().unwrap();
        let mut rec = db
            .query_row(
                "select d.id, d.title, d.file_name, d.mime, d.size_bytes, d.sha256, d.area, d.doc_type, d.status, d.added_at, d.text_method, d.page_count,
                        f.area, f.name, d.filing
                 from documents d left join folders f on f.id = d.folder_id where d.id = ?1",
                [id],
                |r| {
                    let folder = match (r.get::<_, Option<String>>(12)?, r.get::<_, Option<String>>(13)?) {
                        (Some(a), Some(n)) => Some((a, n)),
                        _ => None,
                    };
                    Ok(Record {
                        kind: "document",
                        v: 1,
                        id: r.get(0)?,
                        title: r.get(1)?,
                        file_name: r.get(2)?,
                        mime: r.get(3)?,
                        size_bytes: r.get(4)?,
                        sha256: r.get(5)?,
                        area: r.get(6)?,
                        doc_type: r.get(7)?,
                        status: r.get(8)?,
                        added_at: r.get(9)?,
                        text_method: r.get(10)?,
                        page_count: r.get(11)?,
                        folder,
                        filing: r.get(14)?,
                        facts: vec![],
                        pages: vec![],
                        pages_cut: false,
                    })
                },
            )
            .map_err(|_| "Document not found.".to_string())?;
        let mut stmt = db
            .prepare("select id, label, value, page, status from facts where document_id = ?1 and status != 'rejected' order by page, rowid")
            .map_err(|e| e.to_string())?;
        rec.facts = stmt
            .query_map([id], |r| Ok(RecordFact { id: r.get(0)?, label: r.get(1)?, value: r.get(2)?, page: r.get(3)?, status: r.get(4)? }))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("select page, text from pages where document_id = ?1 order by page").map_err(|e| e.to_string())?;
        let pages: Vec<(i64, String)> = stmt
            .query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        let mut room = MAX_RECORD.saturating_sub(serde_json::to_vec(&rec).map_err(|e| e.to_string())?.len() + 1024);
        for (page, text) in pages {
            // Escaping can grow text; count it as JSON.
            let size = serde_json::to_string(&text).map_err(|e| e.to_string())?.len() + 16;
            if size > room {
                rec.pages_cut = true;
                break;
            }
            room -= size;
            rec.pages.push((page, text));
        }
        serde_json::to_vec(&rec).map_err(|e| e.to_string())
    }

    /// The record for one document, sealed with the records key.
    pub fn cloud_record(&self, id: &str) -> Result<Vec<u8>, String> {
        self.vault.seal_record(&self.cloud_record_json(id)?)
    }

    /// The stored file as it is on disk: already sealed with the files key, which the browser has too.
    pub fn cloud_file(&self, id: &str) -> Result<Vec<u8>, String> {
        let bytes = fs::read(self.path_of(id)?).map_err(|e| e.to_string())?;
        if crate::vault::is_encrypted(&bytes) { Ok(bytes) } else { self.vault.encrypt(&bytes) }
    }

    /// What the next sync has to do. New documents get a row here first, following "New documents go to the cloud".
    pub fn cloud_plan(&self) -> Result<Plan, String> {
        // id, title, sha256 of the file, and the record and file hashes last uploaded.
        type Row = (String, String, String, Option<String>, Option<String>);
        let rows: Vec<Row> = {
            let db = self.db.lock().unwrap();
            let default: bool = db.query_row("select new_documents from cloud_account", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?.ok_or("This Mac isn't connected to Voidcat Cloud.")?;
            db.execute("insert or ignore into cloud_sync (document_id, keep) select id, ?1 from documents", [default]).map_err(|e| e.to_string())?;
            let mut stmt = db
                .prepare("select d.id, d.title, d.sha256, s.record_hash, s.file_hash from documents d join cloud_sync s on s.document_id = d.id where s.keep = 1 order by d.added_at")
                .map_err(|e| e.to_string())?;
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<_, _>>()
                .map_err(|e| e.to_string())?
        };
        let mut upload = vec![];
        for (id, title, sha, record_hash, file_hash) in rows {
            let now = hash(&self.cloud_record_json(&id)?);
            let file = file_hash.as_deref() != Some(&sha);
            if file || record_hash.as_deref() != Some(&now) {
                upload.push(Upload { id, title, record_hash: now, file_hash: sha, file });
            }
        }
        let db = self.db.lock().unwrap();
        let mut stmt = db
            .prepare("select s.document_id from cloud_sync s left join documents d on d.id = s.document_id where (s.keep = 0 or d.id is null) and s.uploaded_at is not null")
            .map_err(|e| e.to_string())?;
        let remove = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
        Ok(Plan { upload, remove })
    }

    pub fn cloud_uploaded(&self, id: &str, record_hash: &str, file_hash: &str) -> Result<(), String> {
        let db = self.db.lock().unwrap();
        db.execute(
            "update cloud_sync set record_hash = ?2, file_hash = ?3, uploaded_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), error = null where document_id = ?1",
            params![id, record_hash, file_hash],
        )
        .map_err(|e| e.to_string())?;
        db.execute("update cloud_account set synced_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", []).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// The cloud copy is gone: forget the row of a removed document, or mark a kept-local one as not uploaded.
    pub fn cloud_removed(&self, id: &str) -> Result<(), String> {
        let db = self.db.lock().unwrap();
        db.execute("delete from cloud_sync where document_id = ?1 and document_id not in (select id from documents)", [id]).map_err(|e| e.to_string())?;
        db.execute("update cloud_sync set record_hash = null, file_hash = null, uploaded_at = null, error = null where document_id = ?1", [id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn cloud_failed(&self, id: &str, error: &str) -> Result<(), String> {
        self.db.lock().unwrap().execute("update cloud_sync set error = ?2 where document_id = ?1", params![id, error]).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Where each document is, for the marks on cards, rows and the document tab. Empty when not connected.
    pub fn cloud_marks(&self) -> Result<Vec<Mark>, String> {
        let db = self.db.lock().unwrap();
        let connected: bool = db.query_row("select count(*) from cloud_account", [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())? > 0;
        if !connected {
            return Ok(vec![]);
        }
        let mut stmt = db
            .prepare(
                "select d.id, case
                   when s.keep = 0 then 'local'
                   when s.error is not null then 'failed'
                   when s.file_hash = d.sha256 and s.uploaded_at is not null then 'cloud'
                   else 'pending' end
                 from documents d left join cloud_sync s on s.document_id = d.id",
            )
            .map_err(|e| e.to_string())?;
        stmt.query_map([], |r| Ok(Mark { id: r.get(0)?, state: r.get(1)? }))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())
    }

    /// The check phrase sealed with this library's records key, for a new cloud library made from this Mac.
    pub fn cloud_check(&self) -> Result<Vec<u8>, String> {
        self.vault.seal_record(CHECK)
    }

    /// Whether this Mac's key opens the cloud library whose check this is.
    pub fn cloud_opens(&self, check: &[u8]) -> bool {
        opens(&self.vault, check)
    }

    /// Joins a cloud library made elsewhere: re-locks this whole library with that library's key. A copy of the
    /// library folder is kept beside it first. Everything is written under the new key before anything is replaced,
    /// then `save_key` puts the new key in the Keychain, then the new files take the old ones' places. The database
    /// stays locked afterwards: the app must restart.
    pub fn rekey(&self, new: &Vault, save_key: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
        let db = self.db.lock().unwrap();
        let dir = self.files.parent().ok_or("No library folder.")?.to_path_buf();
        let db_path = dir.join(crate::legacy::DB);
        db.execute_batch("pragma wal_checkpoint(truncate);").map_err(|e| e.to_string())?;

        let backup = dir.with_file_name(format!(
            "{}.backup-before-join-{}",
            dir.file_name().and_then(|n| n.to_str()).unwrap_or("library"),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
        ));
        copy_dir(&dir, &backup, &["opened"]).map_err(|e| format!("Couldn't make a backup first: {e}"))?;

        let docs: Vec<(String, String)> = {
            let mut stmt = db.prepare("select stored_path, sha256 from documents").map_err(|e| e.to_string())?;
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?.collect::<Result<_, _>>().map_err(|e| e.to_string())?
        };
        let mut written: Vec<(String, String)> = vec![];
        let cleanup = |written: &[(String, String)], db_tmp: &Path| {
            for (_, tmp) in written {
                let _ = fs::remove_file(tmp);
            }
            let _ = fs::remove_file(db_tmp);
        };
        let db_tmp = db_path.with_extension("db.rekeyed");
        let _ = fs::remove_file(&db_tmp);
        let result = (|| -> Result<(), String> {
            for (path, sha) in &docs {
                let Ok(bytes) = fs::read(path) else { continue };
                let plain = self.vault.decrypt(bytes)?;
                if hash(&plain) != *sha {
                    return Err(format!("Stopped: {path} didn't read back the same."));
                }
                let sealed = new.encrypt(&plain)?;
                let tmp = format!("{path}.rekeyed");
                fs::write(&tmp, &sealed).map_err(|e| e.to_string())?;
                written.push((path.clone(), tmp));
            }
            let target = db_tmp.to_string_lossy().replace('\'', "''");
            db.execute_batch(&format!("attach database '{target}' as rekeyed key \"x'{}'\"; select sqlcipher_export('rekeyed'); detach database rekeyed;", new.db_key))
                .map_err(|e| format!("Couldn't re-lock the database: {e}"))?;
            let version: i64 = db.query_row("pragma user_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
            let check = rusqlite::Connection::open(&db_tmp).map_err(|e| e.to_string())?;
            check.execute_batch(&format!("pragma key = \"x'{}'\"; pragma user_version = {version};", new.db_key)).map_err(|e| e.to_string())?;
            for t in ["documents", "facts", "folders", "pages"] {
                let count = |c: &rusqlite::Connection| c.query_row(&format!("select count(*) from {t}"), [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string());
                if count(&db)? != count(&check)? {
                    return Err(format!("Stopped: {t} didn't copy completely."));
                }
            }
            Ok(())
        })();
        if let Err(e) = result {
            cleanup(&written, &db_tmp);
            return Err(format!("{e} Your library is unchanged."));
        }
        if let Err(e) = save_key() {
            cleanup(&written, &db_tmp);
            return Err(format!("{e} Your library is unchanged."));
        }
        for (path, tmp) in &written {
            fs::rename(tmp, path).map_err(|e| format!("{e}. A copy from before is in {}.", backup.display()))?;
        }
        fs::rename(&db_tmp, &db_path).map_err(|e| format!("{e}. A copy from before is in {}.", backup.display()))?;
        for side in ["db-wal", "db-shm"] {
            let _ = fs::remove_file(db_path.with_extension(side));
        }
        // Nothing may write to the old database from here on; the app restarts.
        std::mem::forget(db);
        Ok(())
    }
}

/// A change made in a browser, left in the cloud as a sealed `edit_…` record for the Mac to apply (then deleted).
#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", rename_all_fields = "camelCase")]
enum Edit {
    SettleFact { fact_id: String, status: String, value: Option<String> },
    RenameDocument { id: String, title: String },
    FileDocument { id: String, area: String, name: String },
    RenameFolder { area: String, from: String, to: String },
    RemoveDocument { id: String },
    /// A file added in the browser: the Mac fetches it, keeps it and reads it.
    Import { id: String, file_name: String },
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Applied {
    Done,
    /// Fetch this file from the cloud and pass it to `cloud_import`.
    Import { id: String, file_name: String },
    /// Couldn't apply (the document is gone, a name is taken…); the edit is dropped all the same.
    Skipped { reason: String },
}

impl Store {
    fn has_document(&self, id: &str) -> bool {
        self.db.lock().unwrap().query_row("select 1 from documents where id = ?1", [id], |_| Ok(())).is_ok()
    }

    /// Applies one browser edit. Problems don't stop the sync: the edit is skipped and the browser's copy is
    /// replaced by the Mac's on the next upload.
    pub fn cloud_apply(&self, sealed: &[u8]) -> Result<Applied, String> {
        let edit: Edit = match serde_json::from_slice(&self.vault.open_record(sealed)?) {
            Ok(e) => e,
            Err(e) => return Ok(Applied::Skipped { reason: format!("Unknown change: {e}") }),
        };
        let done = |r: Result<(), String>| Ok(r.map_or_else(|reason| Applied::Skipped { reason }, |_| Applied::Done));
        match edit {
            Edit::SettleFact { fact_id, status, value } => done(self.settle_fact(&fact_id, &status, value)),
            Edit::RenameDocument { id, title } if self.has_document(&id) => done(self.rename_document(&id, &title)),
            Edit::FileDocument { id, area, name } if self.has_document(&id) => done(self.file_document(&id, &area, &name).map(|_| ())),
            Edit::RenameFolder { area, from, to } => {
                let folder: Option<String> = self
                    .db
                    .lock()
                    .unwrap()
                    .query_row("select id from folders where area = ?1 collate nocase and name = ?2 collate nocase", [&area, &from], |r| r.get(0))
                    .optional()
                    .map_err(|e| e.to_string())?;
                match folder {
                    Some(f) => done(self.rename_folder(&f, &to)),
                    None => done(Err(format!("No folder {area} › {from}."))),
                }
            }
            Edit::RemoveDocument { id } if self.has_document(&id) => done(self.remove(&id)),
            Edit::Import { id, file_name } if !self.has_document(&id) => Ok(Applied::Import { id, file_name }),
            _ => done(Ok(())),
        }
    }

    /// Keeps a file added in a browser. It arrives sealed with the files key, which is how the Mac stores files, so
    /// it's checked and written as it is. The same content twice is one document: then `None`.
    pub fn cloud_import(&self, id: &str, file_name: &str, sealed: &[u8]) -> Result<Option<crate::store::Document>, String> {
        let plain = self.vault.decrypt(sealed.to_vec())?;
        if !crate::vault::is_encrypted(sealed) {
            return Err("The file wasn't locked.".into());
        }
        let sha = hash(&plain);
        if uuid::Uuid::parse_str(id).is_err() {
            return Err("Not a document id.".into());
        }
        let db = self.db.lock().unwrap();
        if db.query_row("select 1 from documents where sha256 = ?1 or id = ?2", params![sha, id], |_| Ok(())).is_ok() {
            return Ok(None);
        }
        let name = Path::new(file_name).file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
        let ext = Path::new(&name).extension().and_then(|e| e.to_str()).map(|e| format!(".{}", e.to_lowercase())).unwrap_or_default();
        let stored = self.files.join(format!("{id}{ext}"));
        fs::write(&stored, sealed).map_err(|e| e.to_string())?;
        let inserted = db.execute(
            "insert into documents (id, title, file_name, mime, size_bytes, sha256, stored_path) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, crate::store::title_from(&name), name, crate::store::mime_of(&name), plain.len() as i64, sha, stored.to_string_lossy()],
        );
        if let Err(e) = inserted {
            let _ = fs::remove_file(&stored);
            return Err(e.to_string());
        }
        // The file is in the cloud already; only the record (once read) has to go up.
        db.execute(
            "insert or replace into cloud_sync (document_id, keep, file_hash, uploaded_at) values (?1, 1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
            params![id, sha],
        )
        .map_err(|e| e.to_string())?;
        db.query_row(&format!("select {} from documents where id = ?1", crate::store::COLUMNS), [id], crate::store::row_to_document)
            .map(Some)
            .map_err(|e| e.to_string())
    }
}

pub fn opens(vault: &Vault, check: &[u8]) -> bool {
    vault.open_record(check).is_ok_and(|p| p == CHECK)
}

fn copy_dir(from: &Path, to: &Path, skip: &[&str]) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let name = entry.file_name();
        if skip.iter().any(|s| name == *s) {
            continue;
        }
        let target = to.join(&name);
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target, &[])?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;

    fn library(master: u8) -> (std::path::PathBuf, Store, String) {
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4())).join("library");
        let store = Store::open(&dir, Vault::from_master(&[master; 32])).unwrap();
        let src = dir.with_file_name("lease.txt");
        fs::write(&src, b"invented lease, Carrer del Sol 21").unwrap();
        store.import(vec![src.to_string_lossy().into()]);
        let id = store.db.lock().unwrap().query_row("select id from documents", [], |r| r.get(0)).unwrap();
        (dir, store, id)
    }

    #[test]
    fn plans_uploads_then_only_changes_and_removals() {
        let (_dir, store, id) = library(3);
        assert!(store.cloud_plan().is_err(), "not connected");
        assert!(store.cloud_marks().unwrap().is_empty());

        store.cloud_connect("uid-1", Some("you@example.com")).unwrap();
        let plan = store.cloud_plan().unwrap();
        assert_eq!(plan.upload.len(), 1);
        assert!(plan.upload[0].file);
        assert_eq!(store.cloud_marks().unwrap()[0].state, "pending");

        let sealed = store.cloud_record(&id).unwrap();
        let plain = store.vault.open_record(&sealed).unwrap();
        assert!(String::from_utf8(plain).unwrap().contains("\"title\":\"Lease\""));
        assert!(!sealed.windows(5).any(|w| w == b"Lease"), "the record is sealed");
        assert!(crate::vault::is_encrypted(&store.cloud_file(&id).unwrap()));

        let u = &plan.upload[0];
        store.cloud_uploaded(&u.id, &u.record_hash, &u.file_hash).unwrap();
        assert!(store.cloud_plan().unwrap().upload.is_empty(), "nothing changed");
        assert_eq!(store.cloud_marks().unwrap()[0].state, "cloud");

        store.rename_document(&id, "Rental contract").unwrap();
        let again = store.cloud_plan().unwrap();
        assert_eq!(again.upload.len(), 1);
        assert!(!again.upload[0].file, "the file didn't change, only the record");

        store.cloud_keep(&id, false).unwrap();
        let off = store.cloud_plan().unwrap();
        assert!(off.upload.is_empty());
        assert_eq!(off.remove, vec![id.clone()]);
        assert_eq!(store.cloud_marks().unwrap()[0].state, "local");
        store.cloud_removed(&id).unwrap();
        assert!(store.cloud_plan().unwrap().remove.is_empty());
    }

    #[test]
    fn new_documents_follow_the_default_and_removed_ones_leave_the_cloud() {
        let (dir, store, id) = library(3);
        store.cloud_connect("uid-1", None).unwrap();
        let u = store.cloud_plan().unwrap().upload.remove(0);
        store.cloud_uploaded(&u.id, &u.record_hash, &u.file_hash).unwrap();

        store.cloud_set_new_documents(false).unwrap();
        let src = dir.with_file_name("note.txt");
        fs::write(&src, b"invented note").unwrap();
        store.import(vec![src.to_string_lossy().into()]);
        assert!(store.cloud_plan().unwrap().upload.is_empty(), "a new document stays on the Mac");
        assert!(store.cloud_marks().unwrap().iter().any(|m| m.state == "local"));

        store.remove(&id).unwrap();
        assert_eq!(store.cloud_plan().unwrap().remove, vec![id.clone()]);
        store.cloud_removed(&id).unwrap();
        assert!(store.cloud_plan().unwrap().remove.is_empty());
    }

    #[test]
    fn another_account_starts_over() {
        let (_dir, store, _id) = library(3);
        store.cloud_connect("uid-1", None).unwrap();
        let u = store.cloud_plan().unwrap().upload.remove(0);
        store.cloud_uploaded(&u.id, &u.record_hash, &u.file_hash).unwrap();
        store.cloud_disconnect().unwrap();
        assert!(store.cloud_marks().unwrap().is_empty());
        store.cloud_connect("uid-1", None).unwrap();
        assert!(store.cloud_plan().unwrap().upload.is_empty(), "the same account: nothing to send again");
        store.cloud_connect("uid-2", None).unwrap();
        assert_eq!(store.cloud_plan().unwrap().upload.len(), 1, "another account gets everything");
    }

    #[test]
    fn applies_browser_edits_and_imports_browser_files() {
        let (_dir, store, id) = library(3);
        let edit = |json: &str| store.cloud_apply(&store.vault.seal_record(json.as_bytes()).unwrap()).unwrap();

        assert_eq!(edit(&format!(r#"{{"op":"rename_document","id":"{id}","title":"Rental contract"}}"#)), Applied::Done);
        assert_eq!(edit(&format!(r#"{{"op":"file_document","id":"{id}","area":"Home","name":"Rental"}}"#)), Applied::Done);
        assert_eq!(edit(r#"{"op":"rename_folder","area":"Home","from":"rental","to":"Lease"}"#), Applied::Done);
        let doc: (String, String) = store
            .db
            .lock()
            .unwrap()
            .query_row("select d.title, f.name from documents d join folders f on f.id = d.folder_id", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(doc, ("Rental contract".into(), "Lease".into()));
        assert!(matches!(edit(r#"{"op":"rename_document","id":"gone","title":"x"}"#), Applied::Done), "a removed document is no problem");
        assert!(matches!(edit(r#"{"op":"something_new"}"#), Applied::Skipped { .. }));

        let new_id = uuid::Uuid::new_v4().to_string();
        let asked = edit(&format!(r#"{{"op":"import","id":"{new_id}","fileName":"note.txt"}}"#));
        assert_eq!(asked, Applied::Import { id: new_id.clone(), file_name: "note.txt".into() });
        let sealed = store.vault.encrypt(b"invented note from a browser").unwrap();
        assert!(store.cloud_import(&new_id, "note.txt", &sealed).unwrap().is_some());
        assert_eq!(store.bytes_of(&new_id).unwrap(), b"invented note from a browser");
        assert!(store.cloud_import(&uuid::Uuid::new_v4().to_string(), "copy.txt", &sealed).unwrap().is_none(), "same content: a duplicate");
        assert!(store.cloud_import(&uuid::Uuid::new_v4().to_string(), "x.txt", b"plain").is_err(), "must arrive locked");

        store.cloud_connect("uid-1", None).unwrap();
        let plan = store.cloud_plan().unwrap();
        let imported = plan.upload.iter().find(|u| u.id == new_id).unwrap();
        assert!(!imported.file, "its file is in the cloud already");

        assert_eq!(edit(&format!(r#"{{"op":"remove_document","id":"{new_id}"}}"#)), Applied::Done);
        assert!(store.bytes_of(&new_id).is_err());
    }

    #[test]
    fn checks_keys_against_the_cloud_library() {
        let (_dir, store, _id) = library(3);
        let check = store.cloud_check().unwrap();
        assert!(store.cloud_opens(&check));
        assert!(!opens(&Vault::from_master(&[4; 32]), &check));
    }

    #[test]
    fn rekeys_the_whole_library_and_keeps_a_backup() {
        let (dir, store, id) = library(3);
        let new = Vault::from_master(&[4; 32]);
        let mut saved = false;
        store.rekey(&new, || {
            saved = true;
            Ok(())
        })
        .unwrap();
        assert!(saved);
        drop(store);

        assert!(Store::open(&dir, Vault::from_master(&[3; 32])).is_err(), "the old key no longer opens it");
        let store = Store::open(&dir, Vault::from_master(&[4; 32])).unwrap();
        assert_eq!(store.bytes_of(&id).unwrap(), b"invented lease, Carrer del Sol 21");
        let backups: Vec<_> = fs::read_dir(dir.parent().unwrap())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("backup-before-join"))
            .collect();
        assert_eq!(backups.len(), 1);
        assert!(Store::opens(&backups[0].path(), &Vault::from_master(&[3; 32])), "the backup opens with the old key");
    }

    #[test]
    fn a_refused_key_leaves_the_library_as_it_was() {
        let (dir, store, id) = library(3);
        let err = store.rekey(&Vault::from_master(&[4; 32]), || Err("The Keychain said no.".into())).unwrap_err();
        assert!(err.contains("unchanged"));
        assert_eq!(store.bytes_of(&id).unwrap(), b"invented lease, Carrer del Sol 21");
        drop(store);
        assert!(Store::open(&dir, Vault::from_master(&[3; 32])).is_ok());
        assert!(fs::read_dir(dir.join("files")).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().ends_with(".rekeyed")));
    }
}
