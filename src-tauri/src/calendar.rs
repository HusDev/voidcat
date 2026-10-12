//! Calendar storage. Dates found in approved facts are worked out by the interface each time; this keeps what can't
//! be worked out: events you add, which events are done, the papers to bring to appointments, and which reminders
//! were already shown. Events are identified by a stable key ("fact:<id>", "renew:<id>", "manual:<id>"…).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "
create table if not exists events (
  id text primary key,
  title text not null,
  date text not null,
  time text,
  place text,
  kind text not null default 'other',
  document_id text references documents(id) on delete set null,
  notes text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create table if not exists events_done (key text primary key, done_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
create table if not exists event_papers (
  id text primary key,
  event_key text not null,
  name text not null,
  document_id text references documents(id) on delete set null,
  sort integer not null default 0
);
create index if not exists event_papers_key on event_papers(event_key, sort);
create table if not exists reminders_sent (key text primary key, sent_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    #[serde(default)]
    pub id: String,
    pub title: String,
    /// YYYY-MM-DD
    pub date: String,
    /// HH:MM, local time
    pub time: Option<String>,
    pub place: Option<String>,
    /// appointment | deadline | expires | payment | contract | work | other
    pub kind: String,
    pub document_id: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Paper {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub document_id: Option<String>,
}

fn valid_date(d: &str) -> bool {
    d.len() == 10 && d.as_bytes()[4] == b'-' && d.as_bytes()[7] == b'-' && d.chars().filter(|c| c.is_ascii_digit()).count() == 8
}

fn valid_time(t: &str) -> bool {
    t.len() == 5 && t.as_bytes()[2] == b':' && t.chars().filter(|c| c.is_ascii_digit()).count() == 4
}

pub fn add_event(db: &Connection, e: Event) -> Result<String, String> {
    if e.title.trim().is_empty() || !valid_date(&e.date) || e.time.as_deref().is_some_and(|t| !valid_time(t)) {
        return Err("An event needs a title and a date (and a time like 10:20).".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "insert into events (id, title, date, time, place, kind, document_id, notes) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, e.title.trim(), e.date, e.time, e.place, e.kind, e.document_id, e.notes],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn events(db: &Connection) -> Result<Vec<Event>, String> {
    let mut stmt = db.prepare("select id, title, date, time, place, kind, document_id, notes from events order by date, time").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Event { id: r.get(0)?, title: r.get(1)?, date: r.get(2)?, time: r.get(3)?, place: r.get(4)?, kind: r.get(5)?, document_id: r.get(6)?, notes: r.get(7)? })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn remove_event(db: &Connection, id: &str) -> Result<(), String> {
    db.execute("delete from event_papers where event_key = ?1", [format!("manual:{id}")]).map_err(|e| e.to_string())?;
    db.execute("delete from events where id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_done(db: &Connection, key: &str, done: bool) -> Result<(), String> {
    if done {
        db.execute("insert or ignore into events_done (key) values (?1)", [key])
    } else {
        db.execute("delete from events_done where key = ?1", [key])
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn done_keys(db: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = db.prepare("select key from events_done").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn papers(db: &Connection, key: &str) -> Result<Vec<Paper>, String> {
    let mut stmt = db.prepare("select id, name, document_id from event_papers where event_key = ?1 order by sort").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([key], |r| Ok(Paper { id: r.get(0)?, name: r.get(1)?, document_id: r.get(2)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Replaces an appointment's checklist.
pub fn set_papers(db: &mut Connection, key: &str, list: Vec<Paper>) -> Result<(), String> {
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute("delete from event_papers where event_key = ?1", [key]).map_err(|e| e.to_string())?;
    for (i, p) in list.iter().enumerate() {
        if p.name.trim().is_empty() {
            continue;
        }
        tx.execute(
            "insert into event_papers (id, event_key, name, document_id, sort) values (?1, ?2, ?3, ?4, ?5)",
            params![uuid::Uuid::new_v4().to_string(), key, p.name.trim(), p.document_id, i as i64],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Records that a reminder was shown. Returns false if it already was, so it's never shown twice.
pub fn claim_reminder(db: &Connection, key: &str) -> Result<bool, String> {
    let known: Option<String> = db.query_row("select key from reminders_sent where key = ?1", [key], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    if known.is_some() {
        return Ok(false);
    }
    db.execute("insert into reminders_sent (key) values (?1)", [key]).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("create table documents (id text primary key);").unwrap();
        db.execute_batch(SCHEMA).unwrap();
        db
    }

    #[test]
    fn events_papers_and_reminders() {
        let mut db = db();
        let bad = Event { id: String::new(), title: "X".into(), date: "4/11/2026".into(), time: None, place: None, kind: "other".into(), document_id: None, notes: None };
        assert!(add_event(&db, bad).is_err());
        let id = add_event(
            &db,
            Event { id: String::new(), title: "Padrón".into(), date: "2026-11-04".into(), time: Some("10:20".into()), place: Some("OAC".into()), kind: "appointment".into(), document_id: None, notes: None },
        )
        .unwrap();
        assert_eq!(events(&db).unwrap()[0].time.as_deref(), Some("10:20"));

        let key = format!("manual:{id}");
        set_papers(&mut db, &key, vec![Paper { id: String::new(), name: "Passport".into(), document_id: None }, Paper { id: String::new(), name: " ".into(), document_id: None }]).unwrap();
        assert_eq!(papers(&db, &key).unwrap().len(), 1);

        set_done(&db, &key, true).unwrap();
        assert_eq!(done_keys(&db).unwrap(), vec![key.clone()]);
        set_done(&db, &key, false).unwrap();
        assert!(done_keys(&db).unwrap().is_empty());

        assert!(claim_reminder(&db, "manual:x@1d").unwrap());
        assert!(!claim_reminder(&db, "manual:x@1d").unwrap());

        remove_event(&db, &id).unwrap();
        assert!(events(&db).unwrap().is_empty());
        assert!(papers(&db, &key).unwrap().is_empty());
    }
}
