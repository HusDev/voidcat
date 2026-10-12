//! Contacts and the owner's profile ("Me").
//!
//! Contacts are the people and organisations the local model finds in each document. The same contact found in several
//! documents is merged (same email, or the same name), and what you edit by hand is never overwritten by a later scan.
//! Contacts marked as you ("This is me") or hidden stay out of the list and out of later scans.
//!
//! The profile is built by the interface from approved facts and kept here as JSON, with the choices you made when two
//! documents disagreed.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "
create table if not exists contacts (
  id text primary key,
  name text not null,
  kind text not null default 'person',
  role text,
  category text not null default 'other',
  organisation text,
  phone text,
  email text,
  address text,
  id_number text,
  edited integer not null default 0,
  is_me integer not null default 0,
  hidden integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create table if not exists contact_mentions (
  contact_id text not null references contacts(id) on delete cascade,
  document_id text not null references documents(id) on delete cascade,
  pages text not null default '[]',
  primary key (contact_id, document_id)
);
create table if not exists contacts_scanned (
  document_id text primary key references documents(id) on delete cascade,
  scanned_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create table if not exists profile (
  id integer primary key check (id = 1),
  json text not null,
  built_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create table if not exists profile_choices (key text primary key, fact_id text not null);
";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub name: String,
    pub kind: String,
    pub role: Option<String>,
    pub category: String,
    pub organisation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub id_number: Option<String>,
    #[serde(default)]
    pub pages: Vec<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub document_id: String,
    pub title: String,
    pub pages: Vec<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub role: Option<String>,
    pub category: String,
    pub organisation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub id_number: Option<String>,
    pub edited: bool,
    pub mentions: Vec<Mention>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edit {
    pub name: String,
    pub role: Option<String>,
    pub category: String,
    pub organisation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub id_number: Option<String>,
}

const CATEGORIES: [&str; 7] = ["home", "work", "government", "health", "money", "legal", "other"];

/// Lower case, letters and digits only: "Ruiz Martín, Carla " and "RUIZ MARTÍN CARLA" compare by their words.
fn key(name: &str) -> String {
    let mut words: Vec<String> = name
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect();
    words.sort();
    words.join(" ")
}

fn clean(v: Option<String>) -> Option<String> {
    v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// The contact a newly found one is the same as: same email, else the same name (words in any order).
fn find_match(db: &Connection, f: &Found) -> rusqlite::Result<Option<(String, bool, bool)>> {
    if let Some(email) = clean(f.email.clone()) {
        let hit = db
            .query_row("select id, is_me, hidden from contacts where lower(email) = lower(?1)", [&email], |r| {
                Ok((r.get(0)?, r.get::<_, i64>(1)? == 1, r.get::<_, i64>(2)? == 1))
            })
            .optional()?;
        if hit.is_some() {
            return Ok(hit);
        }
    }
    let wanted = key(&f.name);
    let mut stmt = db.prepare("select id, name, is_me, hidden from contacts")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)? == 1, r.get::<_, i64>(3)? == 1)))?;
    for row in rows {
        let (id, name, me, hidden) = row?;
        if key(&name) == wanted {
            return Ok(Some((id, me, hidden)));
        }
    }
    Ok(None)
}

/// Saves the contacts found in one document: merges them into known contacts and records where each appears.
pub fn save_found(db: &mut Connection, document_id: &str, found: Vec<Found>) -> Result<(), String> {
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute("delete from contact_mentions where document_id = ?1", [document_id]).map_err(|e| e.to_string())?;
    for f in found {
        let name = f.name.trim().to_string();
        if key(&name).is_empty() {
            continue;
        }
        let category = if CATEGORIES.contains(&f.category.as_str()) { f.category.clone() } else { "other".into() };
        let kind = if f.kind == "organisation" { "organisation" } else { "person" };
        let id = match find_match(&tx, &f).map_err(|e| e.to_string())? {
            Some((_, true, _)) => continue, // that's the owner
            Some((id, _, _)) => {
                // Fill what's missing; never touch a contact edited by hand.
                tx.execute(
                    "update contacts set role = coalesce(role, ?2), organisation = coalesce(organisation, ?3), phone = coalesce(phone, ?4),
                       email = coalesce(email, ?5), address = coalesce(address, ?6), id_number = coalesce(id_number, ?7)
                     where id = ?1 and edited = 0",
                    params![id, clean(f.role), clean(f.organisation), clean(f.phone), clean(f.email), clean(f.address), clean(f.id_number)],
                )
                .map_err(|e| e.to_string())?;
                id
            }
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    "insert into contacts (id, name, kind, role, category, organisation, phone, email, address, id_number)
                     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![id, name, kind, clean(f.role), category, clean(f.organisation), clean(f.phone), clean(f.email), clean(f.address), clean(f.id_number)],
                )
                .map_err(|e| e.to_string())?;
                id
            }
        };
        let mut pages = f.pages.clone();
        pages.sort_unstable();
        pages.dedup();
        tx.execute(
            "insert into contact_mentions (contact_id, document_id, pages) values (?1, ?2, ?3)
             on conflict(contact_id, document_id) do update set pages = excluded.pages",
            params![id, document_id, serde_json::to_string(&pages).unwrap_or_else(|_| "[]".into())],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute("insert or replace into contacts_scanned (document_id) values (?1)", [document_id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// Contacts to show: not you, not hidden, and still in at least one document (or edited by hand).
pub fn list(db: &Connection) -> Result<Vec<Contact>, String> {
    let mut stmt = db
        .prepare(
            "select id, name, kind, role, category, organisation, phone, email, address, id_number, edited from contacts c
             where is_me = 0 and hidden = 0 and (edited = 1 or exists (select 1 from contact_mentions m where m.contact_id = c.id))
             order by lower(name)",
        )
        .map_err(|e| e.to_string())?;
    let mut contacts = stmt
        .query_map([], |r| {
            Ok(Contact {
                id: r.get(0)?,
                name: r.get(1)?,
                kind: r.get(2)?,
                role: r.get(3)?,
                category: r.get(4)?,
                organisation: r.get(5)?,
                phone: r.get(6)?,
                email: r.get(7)?,
                address: r.get(8)?,
                id_number: r.get(9)?,
                edited: r.get::<_, i64>(10)? == 1,
                mentions: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut m = db
        .prepare("select m.document_id, d.title, m.pages from contact_mentions m join documents d on d.id = m.document_id where m.contact_id = ?1 order by d.added_at desc")
        .map_err(|e| e.to_string())?;
    for c in &mut contacts {
        c.mentions = m
            .query_map([&c.id], |r| {
                let pages: String = r.get(2)?;
                Ok(Mention { document_id: r.get(0)?, title: r.get(1)?, pages: serde_json::from_str(&pages).unwrap_or_default() })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
    }
    Ok(contacts)
}

pub fn edit(db: &Connection, id: &str, e: Edit) -> Result<(), String> {
    if key(&e.name).is_empty() {
        return Err("A contact needs a name.".into());
    }
    let category = if CATEGORIES.contains(&e.category.as_str()) { e.category } else { "other".into() };
    db.execute(
        "update contacts set name = ?2, role = ?3, category = ?4, organisation = ?5, phone = ?6, email = ?7, address = ?8, id_number = ?9, edited = 1 where id = ?1",
        params![id, e.name.trim(), clean(e.role), category, clean(e.organisation), clean(e.phone), clean(e.email), clean(e.address), clean(e.id_number)],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// "This is me" (the owner, kept out of contacts) or "Hide" (not a contact worth keeping).
pub fn set_flag(db: &Connection, id: &str, flag: &str) -> Result<(), String> {
    let sql = match flag {
        "me" => "update contacts set is_me = 1 where id = ?1",
        "hidden" => "update contacts set hidden = 1 where id = ?1",
        _ => return Err(format!("Unknown flag: {flag}")),
    };
    db.execute(sql, [id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Names the owner goes by, so scans leave them out of contacts.
pub fn owner_names(db: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = db.prepare("select name from contacts where is_me = 1").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Read documents not scanned for contacts yet.
pub fn unscanned(db: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = db
        .prepare("select id from documents where status = 'filed' and id not in (select document_id from contacts_scanned) order by added_at")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn profile(db: &Connection) -> Result<Option<(String, String)>, String> {
    db.query_row("select json, built_at from profile where id = 1", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(|e| e.to_string())
}

pub fn save_profile(db: &Connection, json: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(json).map_err(|e| format!("Not a profile: {e}"))?;
    db.execute(
        "insert into profile (id, json) values (1, ?1) on conflict(id) do update set json = excluded.json, built_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
        [json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn choices(db: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = db.prepare("select key, fact_id from profile_choices").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn choose(db: &Connection, key: &str, fact_id: &str) -> Result<(), String> {
    db.execute("insert or replace into profile_choices (key, fact_id) values (?1, ?2)", [key, fact_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found(name: &str, email: Option<&str>, phone: Option<&str>) -> Found {
        Found {
            name: name.into(),
            kind: "person".into(),
            role: Some("Landlord".into()),
            category: "home".into(),
            organisation: None,
            phone: phone.map(Into::into),
            email: email.map(Into::into),
            address: None,
            id_number: None,
            pages: vec![2, 1, 2],
        }
    }

    #[test]
    fn merges_keeps_edits_and_skips_the_owner() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("pragma foreign_keys = on; create table documents (id text primary key, title text, status text, added_at text);").unwrap();
        db.execute_batch("insert into documents values ('d1', 'Lease', 'filed', '1'), ('d2', 'Receipt', 'filed', '2'), ('d3', 'Payslip', 'filed', '3');").unwrap();
        db.execute_batch(SCHEMA).unwrap();
        assert_eq!(unscanned(&db).unwrap().len(), 3);

        save_found(&mut db, "d1", vec![found("Carla Ruiz Martín", None, None), found("Omar Haddad", None, None), found("  ", None, None)]).unwrap();
        // Same person, written surname first, with a phone this time.
        save_found(&mut db, "d2", vec![found("RUIZ MARTÍN, Carla", None, Some("+34 600 000 000"))]).unwrap();
        let all = list(&db).unwrap();
        assert_eq!(all.len(), 2);
        let carla = all.iter().find(|c| c.name.starts_with("Carla")).unwrap();
        assert_eq!(carla.phone.as_deref(), Some("+34 600 000 000"));
        assert_eq!(carla.mentions.len(), 2);
        assert_eq!(carla.mentions.iter().find(|m| m.document_id == "d1").unwrap().pages, vec![1, 2]);

        // The owner leaves the list and is skipped from then on.
        let omar = all.iter().find(|c| c.name == "Omar Haddad").unwrap().id.clone();
        set_flag(&db, &omar, "me").unwrap();
        save_found(&mut db, "d3", vec![found("Omar Haddad", None, None)]).unwrap();
        assert_eq!(list(&db).unwrap().len(), 1);
        assert_eq!(owner_names(&db).unwrap(), vec!["Omar Haddad".to_string()]);

        // Hand edits survive a rescan.
        let id = carla.id.clone();
        edit(&db, &id, Edit { name: "Carla Ruiz".into(), role: Some("Landlord".into()), category: "home".into(), organisation: None, phone: Some("+34 611".into()), email: None, address: None, id_number: None }).unwrap();
        save_found(&mut db, "d2", vec![found("Carla Ruiz", None, Some("+34 699"))]).unwrap();
        assert_eq!(list(&db).unwrap()[0].phone.as_deref(), Some("+34 611"));
        assert!(unscanned(&db).unwrap().is_empty());

        // Removing a document removes where contacts appear.
        db.execute("delete from documents where id = 'd2'", []).unwrap();
        assert_eq!(list(&db).unwrap()[0].mentions.len(), 1);

        save_profile(&db, r#"{"fields":[]}"#).unwrap();
        assert!(save_profile(&db, "nope").is_err());
        choose(&db, "Address", "f1").unwrap();
        assert_eq!(choices(&db).unwrap(), vec![("Address".to_string(), "f1".to_string())]);
    }
}
