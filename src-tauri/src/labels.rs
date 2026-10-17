//! Labels on documents: expired, ended, possible duplicate, not signed, incomplete, not useful, or your own "needs
//! review". Automatic ones are worked out again from time to time; one you dismiss stays dismissed, so it never comes
//! back. Labels you set yourself are only changed by you.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "
create table if not exists document_labels (
  document_id text not null references documents(id) on delete cascade,
  kind text not null,
  note text,
  related_id text,
  source text not null default 'auto',
  dismissed integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  primary key (document_id, kind)
);
create table if not exists label_checks (
  document_id text primary key references documents(id) on delete cascade,
  checked_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
";

const KINDS: [&str; 7] = ["expired", "ended", "duplicate", "unsigned", "incomplete", "not_useful", "review"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub document_id: String,
    pub kind: String,
    pub note: Option<String>,
    pub related_id: Option<String>,
    pub source: String,
    pub dismissed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewLabel {
    pub document_id: String,
    pub kind: String,
    pub note: Option<String>,
    pub related_id: Option<String>,
}

fn known(kind: &str) -> Result<(), String> {
    KINDS.contains(&kind).then_some(()).ok_or_else(|| format!("Unknown label: {kind}"))
}

pub fn list(db: &Connection) -> Result<Vec<Label>, String> {
    let mut stmt = db
        .prepare("select document_id, kind, note, related_id, source, dismissed from document_labels order by created_at")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Label { document_id: r.get(0)?, kind: r.get(1)?, note: r.get(2)?, related_id: r.get(3)?, source: r.get(4)?, dismissed: r.get::<_, i64>(5)? == 1 })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Writes automatic labels of the given kinds afresh: earlier ones of those kinds go (except dismissed ones, which stay
/// to keep them from coming back), new ones are added unless you dismissed the same label before. `only` limits it to
/// one document.
pub fn replace_auto(db: &mut Connection, kinds: &[String], labels: Vec<NewLabel>, only: Option<&str>) -> Result<(), String> {
    for k in kinds {
        known(k)?;
    }
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for k in kinds {
        tx.execute(
            "delete from document_labels where kind = ?1 and source = 'auto' and dismissed = 0 and (?2 is null or document_id = ?2)",
            params![k, only],
        )
        .map_err(|e| e.to_string())?;
    }
    for l in labels {
        if !kinds.contains(&l.kind) || only.is_some_and(|d| d != l.document_id) {
            continue;
        }
        tx.execute(
            "insert into document_labels (document_id, kind, note, related_id, source) values (?1, ?2, ?3, ?4, 'auto') on conflict do nothing",
            params![l.document_id, l.kind, l.note, l.related_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(d) = only {
        tx.execute("insert or replace into label_checks (document_id) values (?1)", [d]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// A label you add yourself (it replaces an automatic one of the same kind, dismissed or not).
pub fn set(db: &Connection, document_id: &str, kind: &str, note: Option<String>) -> Result<(), String> {
    known(kind)?;
    db.execute(
        "insert into document_labels (document_id, kind, note, source) values (?1, ?2, ?3, 'user')
         on conflict(document_id, kind) do update set note = excluded.note, source = 'user', dismissed = 0",
        params![document_id, kind, note],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Takes a label off: yours is deleted, an automatic one is dismissed so it doesn't come back.
pub fn remove(db: &Connection, document_id: &str, kind: &str) -> Result<(), String> {
    db.execute("delete from document_labels where document_id = ?1 and kind = ?2 and source = 'user'", params![document_id, kind])
        .map_err(|e| e.to_string())?;
    db.execute("update document_labels set dismissed = 1 where document_id = ?1 and kind = ?2", params![document_id, kind])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Forgets the model's checks and its automatic labels of these kinds (not dismissed ones), so documents are checked again.
pub fn reset_checks(db: &Connection, kinds: &[String]) -> Result<(), String> {
    for k in kinds {
        known(k)?;
        db.execute("delete from document_labels where kind = ?1 and source = 'auto' and dismissed = 0", [k]).map_err(|e| e.to_string())?;
    }
    db.execute("delete from label_checks", []).map_err(|e| e.to_string())?;
    Ok(())
}

/// Read documents the model hasn't checked yet.
pub fn unchecked(db: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = db
        .prepare("select id from documents d where status != 'new' and not exists (select 1 from label_checks c where c.document_id = d.id)")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("create table documents (id text primary key, status text not null default 'read');").unwrap();
        db.execute_batch(SCHEMA).unwrap();
        db.execute_batch("insert into documents (id) values ('a'), ('b');").unwrap();
        db
    }
    fn label(doc: &str, kind: &str) -> NewLabel {
        NewLabel { document_id: doc.into(), kind: kind.into(), note: Some("Ended 31 Aug 2025".into()), related_id: None }
    }
    #[test]
    fn dismissed_labels_stay_away_and_yours_are_kept() {
        let mut db = db();
        let kinds = vec!["ended".to_string()];
        replace_auto(&mut db, &kinds, vec![label("a", "ended"), label("b", "ended")], None).unwrap();
        assert_eq!(list(&db).unwrap().len(), 2);

        remove(&db, "a", "ended").unwrap();
        replace_auto(&mut db, &kinds, vec![label("a", "ended"), label("b", "ended")], None).unwrap();
        let all = list(&db).unwrap();
        assert!(all.iter().find(|l| l.document_id == "a").unwrap().dismissed, "a dismissed label doesn't come back");

        // No longer ended: the automatic label goes.
        replace_auto(&mut db, &kinds, vec![], None).unwrap();
        assert!(list(&db).unwrap().iter().all(|l| l.document_id != "b"));

        set(&db, "b", "review", Some("Check the dates".into())).unwrap();
        replace_auto(&mut db, &["review".to_string()], vec![], None).unwrap();
        assert!(list(&db).unwrap().iter().any(|l| l.kind == "review" && l.source == "user"), "your labels are only changed by you");
        assert!(set(&db, "b", "nonsense", None).is_err());
    }

    #[test]
    fn a_check_marks_the_document_checked() {
        let mut db = db();
        assert_eq!(unchecked(&db).unwrap().len(), 2);
        replace_auto(&mut db, &["unsigned".to_string()], vec![label("a", "unsigned")], Some("a")).unwrap();
        assert_eq!(unchecked(&db).unwrap(), vec!["b".to_string()]);
    }
}
