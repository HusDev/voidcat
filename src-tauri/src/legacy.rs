//! One-time moves from the app's first name, SafeBox, to Voidcat: the library folder and database file, the Keychain
//! key, and the MCP entry in other apps' settings. Each step runs only when the old thing exists and the new one doesn't,
//! so it is safe to run on every start.

use std::fs;
use std::path::Path;

const OLD_DIR: &str = "dev.hus.safebox";
const OLD_DB: &str = "safebox.db";
pub const DB: &str = "voidcat.db";

/// Moves `…/dev.hus.safebox` into `dir` (`…/dev.hus.voidcat`) and renames the database with its WAL files.
pub fn move_library(dir: &Path) -> Result<(), String> {
    let old = dir.parent().ok_or("No parent folder")?.join(OLD_DIR);
    if old.join(OLD_DB).exists() && !dir.join(DB).exists() && !dir.join(OLD_DB).exists() {
        if !dir.exists() {
            fs::rename(&old, dir).map_err(|e| format!("Could not move the library: {e}"))?;
        } else {
            for item in fs::read_dir(&old).map_err(|e| e.to_string())? {
                let item = item.map_err(|e| e.to_string())?;
                let to = dir.join(item.file_name());
                if !to.exists() {
                    fs::rename(item.path(), to).map_err(|e| format!("Could not move the library: {e}"))?;
                }
            }
            let _ = fs::remove_dir(&old); // only if it's empty now
        }
    }
    for suffix in ["", "-wal", "-shm"] {
        let from = dir.join(format!("{OLD_DB}{suffix}"));
        let to = dir.join(format!("{DB}{suffix}"));
        if from.exists() && !to.exists() {
            fs::rename(from, to).map_err(|e| format!("Could not rename the library file: {e}"))?;
        }
    }
    Ok(())
}

/// Points documents filed under the old folder at the same files in the new one.
pub fn fix_paths(db: &rusqlite::Connection, dir: &Path) -> rusqlite::Result<usize> {
    let Some(parent) = dir.parent() else { return Ok(0) };
    let old = format!("{}/", parent.join(OLD_DIR).display());
    let new = format!("{}/", dir.display());
    db.execute(
        "update documents set stored_path = ?2 || substr(stored_path, length(?1) + 1) where substr(stored_path, 1, length(?1)) = ?1",
        rusqlite::params![old, new],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moves_the_old_library_once() {
        let root = std::env::temp_dir().join(format!("voidcat-legacy-{}", uuid::Uuid::new_v4()));
        let old = root.join(OLD_DIR);
        fs::create_dir_all(old.join("files")).unwrap();
        fs::write(old.join(OLD_DB), "db").unwrap();
        fs::write(old.join("safebox.db-wal"), "wal").unwrap();
        fs::write(old.join("files/a.pdf"), "pdf").unwrap();
        let new = root.join("dev.hus.voidcat");

        move_library(&new).unwrap();
        assert_eq!(fs::read_to_string(new.join(DB)).unwrap(), "db");
        assert_eq!(fs::read_to_string(new.join("voidcat.db-wal")).unwrap(), "wal");
        assert!(new.join("files/a.pdf").exists());
        assert!(!old.exists());

        // A second run, or a new library next to a stray old folder, changes nothing.
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join(OLD_DB), "other").unwrap();
        move_library(&new).unwrap();
        assert_eq!(fs::read_to_string(new.join(DB)).unwrap(), "db");

        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("create table documents (stored_path text)").unwrap();
        let old_file = format!("{}/files/a.pdf", old.display());
        db.execute("insert into documents values (?1), ('/elsewhere/b.pdf')", [&old_file]).unwrap();
        assert_eq!(fix_paths(&db, &new).unwrap(), 1);
        let path: String = db.query_row("select stored_path from documents limit 1", [], |r| r.get(0)).unwrap();
        assert_eq!(path, format!("{}/files/a.pdf", new.display()));
        fs::remove_dir_all(root).unwrap();
    }
}
