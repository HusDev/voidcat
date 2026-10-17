//! The MCP server (a separate program that Claude Desktop, Cursor or Claude Code start) can't open the encrypted
//! library, so it asks the running app over a Unix socket in the library folder that only this user can open. One
//! JSON request per connection, one JSON answer. The library's key never leaves the app; what is sent back is masked
//! by the MCP server before any AI sees it, as before.

use crate::store::Store;
use rusqlite::{Connection, Row};
use serde_json::{Map, Value, json};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use tauri::{AppHandle, Manager};

pub const SOCKET: &str = "mcp.sock";

pub fn start(app: AppHandle, dir: &Path) -> Result<(), String> {
    let path = dir.join(SOCKET);
    let _ = fs::remove_file(&path);
    let listener = UnixListener::bind(&path).map_err(|e| format!("MCP socket: {e}"))?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = serve(&app, stream);
            });
        }
    });
    Ok(())
}

fn serve(app: &AppHandle, stream: UnixStream) -> std::io::Result<()> {
    let mut line = String::new();
    BufReader::new(stream.try_clone()?).read_line(&mut line)?;
    let request: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
    let store = app.state::<Store>();
    let answer = {
        let db = store.db.lock().unwrap();
        match handle(&db, &request) {
            Ok(v) => json!({ "ok": v }),
            Err(e) => json!({ "error": e }),
        }
    };
    let mut out = stream;
    writeln!(out, "{answer}")
}

/// Rows as JSON objects keyed by column name (the SQL gives the names the MCP server expects).
fn rows(db: &Connection, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<Value, String> {
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();
    let to_json = |r: &Row| {
        let mut m = Map::new();
        for (i, n) in names.iter().enumerate() {
            let v = match r.get_ref(i)? {
                rusqlite::types::ValueRef::Null => Value::Null,
                rusqlite::types::ValueRef::Integer(x) => json!(x),
                rusqlite::types::ValueRef::Real(x) => json!(x),
                rusqlite::types::ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
                rusqlite::types::ValueRef::Blob(_) => Value::Null,
            };
            m.insert(n.clone(), v);
        }
        Ok(Value::Object(m))
    };
    let out = stmt.query_map(params, to_json).map_err(|e| e.to_string())?;
    Ok(Value::Array(out.collect::<Result<_, _>>().map_err(|e| e.to_string())?))
}

fn handle(db: &Connection, req: &Value) -> Result<Value, String> {
    match req["method"].as_str() {
        // Records that an app used Voidcat, and answers its access level (set in Connected AIs).
        Some("hello") => {
            let name = req["name"].as_str().unwrap_or("unknown");
            db.execute("insert into ai_apps (name) values (?1) on conflict(name) do nothing", [name]).map_err(|e| e.to_string())?;
            db.execute("update ai_apps set last_used = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), calls = calls + 1 where name = ?1", [name])
                .map_err(|e| e.to_string())?;
            let level: String = db.query_row("select level from ai_apps where name = ?1", [name], |r| r.get(0)).map_err(|e| e.to_string())?;
            Ok(json!(level))
        }
        Some("snapshot") => Ok(json!({
            "documents": rows(db, "select id, title, area, doc_type as docType, page_count as pageCount,
                (select f.area || ' › ' || f.name from folders f where f.id = documents.folder_id) as folderName
                from documents order by added_at desc", &[])?,
            "facts": rows(db, "select f.id, f.document_id as documentId, d.title as documentTitle, d.mime as documentMime, f.label, f.value, f.page, f.status
                from facts f join documents d on d.id = f.document_id where f.status = 'approved' order by d.title, f.created_at", &[])?,
            "events": rows(db, "select id, title, date, time, place, kind, document_id as documentId, notes from events order by date", &[])?,
            "contacts": rows(db, "select name, phone, email, address, id_number as idNumber from contacts where kind = 'person' and hidden = 0", &[])?,
        })),
        Some("search") => {
            let words: Vec<String> = req["query"]
                .as_str()
                .unwrap_or("")
                .split(|c: char| !c.is_alphanumeric())
                .filter(|w| w.chars().count() > 2)
                .map(|w| format!("\"{w}\"*"))
                .collect();
            if words.is_empty() {
                return Ok(json!([]));
            }
            rows(
                db,
                "select p.document_id as documentId, d.title, p.page, snippet(pages, 2, '[[', ']]', ' … ', 24) as snippet
                 from pages p join documents d on d.id = p.document_id where pages match ?1 order by rank limit 12",
                &[&words.join(" OR ")],
            )
        }
        Some("page") => {
            let id = req["documentId"].as_str().unwrap_or("");
            let page = req["page"].as_i64().unwrap_or(0);
            let text: Option<String> =
                db.query_row("select text from pages where document_id = ?1 and page = ?2", rusqlite::params![id, page], |r| r.get(0)).ok();
            Ok(json!(text))
        }
        _ => Err("Unknown request.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answers_levels_snapshots_search_and_pages() {
        let dir = std::env::temp_dir().join(format!("voidcat-mcp-{}", uuid::Uuid::new_v4()));
        let store = Store::open(&dir, crate::vault::Vault::from_master(&[5; 32])).unwrap();
        let db = store.db.lock().unwrap();
        db.execute("insert into documents (id, title, file_name, mime, size_bytes, sha256, stored_path) values ('d1', 'Lease', 'l.pdf', 'application/pdf', 1, 'x', '/nowhere')", []).unwrap();
        db.execute("insert into pages (document_id, page, text) values ('d1', 1, 'contrato de arrendamiento')", []).unwrap();

        assert_eq!(handle(&db, &json!({"method": "hello", "name": "Test app"})).unwrap(), json!("facts"));
        let snap = handle(&db, &json!({"method": "snapshot"})).unwrap();
        assert_eq!(snap["documents"][0]["title"], "Lease");
        assert_eq!(handle(&db, &json!({"method": "search", "query": "arrendamiento"})).unwrap()[0]["documentId"], "d1");
        assert_eq!(handle(&db, &json!({"method": "page", "documentId": "d1", "page": 1})).unwrap(), json!("contrato de arrendamiento"));
        assert!(handle(&db, &json!({"method": "drop tables"})).is_err());
    }
}
