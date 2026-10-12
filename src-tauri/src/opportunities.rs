//! Opportunities: advantages a scan found for the user (tax reliefs, residency milestones, money, work, housing).
//! Each idea has a stable key chosen by the model, so a later scan updates it instead of adding a copy. What you
//! decided (kept, done, dismissed) survives later scans, and dismissed ideas never come back.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "
create table if not exists opportunities (
  key text primary key,
  area text not null,
  title text not null,
  why text not null,
  value text,
  effort text not null default 'medium',
  deadline text,
  deadline_date text,
  next_step text not null,
  fit text not null default 'maybe',
  sources text not null default '[]',
  status text not null default 'new',
  found_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  scanned_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub title: String,
    /// A web page (https://…) or a document in the library ("doc:<id>").
    pub url: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Opportunity {
    pub key: String,
    /// tax | residency | work | money | home | benefits | other
    pub area: String,
    pub title: String,
    pub why: String,
    pub value: Option<String>,
    /// low | medium | high
    pub effort: String,
    /// As written, e.g. "Before the first vesting".
    pub deadline: Option<String>,
    /// YYYY-MM-DD when the deadline is a real date.
    pub deadline_date: Option<String>,
    pub next_step: String,
    /// yes | maybe | no
    pub fit: String,
    pub sources: Vec<Source>,
    /// new | kept | done | dismissed
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub scanned_at: String,
}

const STATUSES: [&str; 4] = ["new", "kept", "done", "dismissed"];

pub fn list(db: &Connection) -> Result<Vec<Opportunity>, String> {
    let mut stmt = db
        .prepare(
            "select key, area, title, why, value, effort, deadline, deadline_date, next_step, fit, sources, status, scanned_at
             from opportunities
             order by case fit when 'yes' then 0 when 'maybe' then 1 else 2 end, coalesce(deadline_date, '9999'), found_at",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let sources: String = r.get(10)?;
            Ok(Opportunity {
                key: r.get(0)?,
                area: r.get(1)?,
                title: r.get(2)?,
                why: r.get(3)?,
                value: r.get(4)?,
                effort: r.get(5)?,
                deadline: r.get(6)?,
                deadline_date: r.get(7)?,
                next_step: r.get(8)?,
                fit: r.get(9)?,
                sources: serde_json::from_str(&sources).unwrap_or_default(),
                status: r.get(11)?,
                scanned_at: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Saves a scan's results. Known ideas are updated but keep your decision; dismissed ones are left alone.
pub fn save_scan(db: &mut Connection, found: Vec<Opportunity>) -> Result<(), String> {
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for o in found {
        if o.key.trim().is_empty() || o.title.trim().is_empty() {
            continue;
        }
        let sources = serde_json::to_string(&o.sources).map_err(|e| e.to_string())?;
        tx.execute(
            "insert into opportunities (key, area, title, why, value, effort, deadline, deadline_date, next_step, fit, sources)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             on conflict(key) do update set
               area = excluded.area, title = excluded.title, why = excluded.why, value = excluded.value,
               effort = excluded.effort, deadline = excluded.deadline, deadline_date = excluded.deadline_date,
               next_step = excluded.next_step, fit = excluded.fit, sources = excluded.sources,
               scanned_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             where opportunities.status != 'dismissed'",
            params![o.key.trim(), o.area, o.title.trim(), o.why, o.value, o.effort, o.deadline, o.deadline_date, o.next_step, o.fit, sources],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn set_status(db: &Connection, key: &str, status: &str) -> Result<(), String> {
    if !STATUSES.contains(&status) {
        return Err(format!("Unknown status: {status}"));
    }
    db.execute("update opportunities set status = ?2 where key = ?1", params![key, status]).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn idea(key: &str, title: &str) -> Opportunity {
        Opportunity {
            key: key.into(),
            area: "tax".into(),
            title: title.into(),
            why: "Because.".into(),
            value: Some("≈ €450 a year".into()),
            effort: "low".into(),
            deadline: Some("By 31 Dec".into()),
            deadline_date: Some("2026-12-31".into()),
            next_step: "Compare plans.".into(),
            fit: "yes".into(),
            sources: vec![Source { title: "Payslip".into(), url: "doc:1".into() }],
            status: String::new(),
            scanned_at: String::new(),
        }
    }

    #[test]
    fn scans_keep_decisions_and_dismissed_stay_dismissed() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(SCHEMA).unwrap();
        save_scan(&mut db, vec![idea("pension", "Pension plan"), idea("deposit", "Deposit"), idea(" ", "No key")]).unwrap();
        assert_eq!(list(&db).unwrap().len(), 2);

        set_status(&db, "pension", "kept").unwrap();
        set_status(&db, "deposit", "dismissed").unwrap();
        assert!(set_status(&db, "deposit", "maybe").is_err());

        save_scan(&mut db, vec![idea("pension", "Pension plan, updated"), idea("deposit", "Deposit, again")]).unwrap();
        let all = list(&db).unwrap();
        let pension = all.iter().find(|o| o.key == "pension").unwrap();
        assert_eq!((pension.title.as_str(), pension.status.as_str()), ("Pension plan, updated", "kept"));
        assert_eq!(pension.sources[0].url, "doc:1");
        let deposit = all.iter().find(|o| o.key == "deposit").unwrap();
        assert_eq!((deposit.title.as_str(), deposit.status.as_str()), ("Deposit", "dismissed"));
    }
}
