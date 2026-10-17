//! Ask's conversations, kept so you can go back to them. The interface owns the shape of a conversation; it is stored
//! here as JSON, next to a title and the time it last changed.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

pub const SCHEMA: &str = "
create table if not exists chats (
  id text primary key,
  title text not null,
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub updated_at: String,
}

/// Newest first.
pub fn list(db: &Connection) -> Result<Vec<Chat>, String> {
    let mut stmt = db
        .prepare("select id, title, updated_at from chats order by updated_at desc, rowid desc")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(Chat { id: r.get(0)?, title: r.get(1)?, updated_at: r.get(2)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// The conversation's JSON, or None when it was deleted.
pub fn get(db: &Connection, id: &str) -> Result<Option<String>, String> {
    db.query_row("select body from chats where id = ?1", [id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

pub fn save(db: &Connection, id: &str, title: &str, body: &str) -> Result<(), String> {
    db.execute(
        "insert into chats (id, title, body) values (?1, ?2, ?3)
         on conflict(id) do update set title = excluded.title, body = excluded.body,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
        params![id, title.trim(), body],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete(db: &Connection, id: &str) -> Result<(), String> {
    db.execute("delete from chats where id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_updates_lists_and_deletes() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(SCHEMA).unwrap();
        save(&db, "a", "When does my lease end?", "[]").unwrap();
        save(&db, "b", "What do I pay in rent?", "[]").unwrap();
        save(&db, "a", " When does my lease end? ", "[1]").unwrap();

        let all = list(&db).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all.iter().find(|c| c.id == "a").unwrap().title, "When does my lease end?");
        assert_eq!(get(&db, "a").unwrap().as_deref(), Some("[1]"));

        delete(&db, "a").unwrap();
        assert_eq!(get(&db, "a").unwrap(), None);
        assert_eq!(list(&db).unwrap().len(), 1);
    }
}
