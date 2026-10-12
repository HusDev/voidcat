//! Other apps that use the library through SafeBox's MCP server (`mcp/server.ts`, shipped as the `safebox-mcp`
//! binary). The server records each app the first time it calls, in `ai_apps`; here you set what each may see, and
//! SafeBox adds itself to Claude Desktop's or Cursor's MCP settings when you ask.

use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const SCHEMA: &str = "
create table if not exists ai_apps (
  name text primary key,
  level text not null default 'facts',
  first_seen text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_used text,
  calls integer not null default 0
);
";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct App {
    pub name: String,
    /// off | facts | search
    pub level: String,
    pub first_seen: String,
    pub last_used: Option<String>,
    pub calls: i64,
}

pub fn list(db: &Connection) -> Result<Vec<App>, String> {
    let mut stmt = db
        .prepare("select name, level, first_seen, last_used, calls from ai_apps order by coalesce(last_used, first_seen) desc")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(App { name: r.get(0)?, level: r.get(1)?, first_seen: r.get(2)?, last_used: r.get(3)?, calls: r.get(4)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn set_level(db: &Connection, name: &str, level: &str) -> Result<(), String> {
    if !["off", "facts", "search"].contains(&level) {
        return Err(format!("Unknown access level: {level}"));
    }
    db.execute(
        "insert into ai_apps (name, level) values (?1, ?2) on conflict(name) do update set level = excluded.level",
        params![name, level],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove(db: &Connection, name: &str) -> Result<(), String> {
    db.execute("delete from ai_apps where name = ?1", [name]).map_err(|e| e.to_string())?;
    Ok(())
}

/// The MCP server binary, next to the app's own executable (Tauri puts sidecars there, in dev and in the bundle).
pub fn server_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let path = exe.parent().ok_or("No app folder")?.join("safebox-mcp");
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("The MCP server is missing at {}. Run `bun run build:mcp`.", path.display()))
    }
}

/// Where each supported app keeps its MCP servers.
fn config_path(app: &str) -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "No home folder")?;
    match app {
        "claude-desktop" => Ok(Path::new(&home).join("Library/Application Support/Claude/claude_desktop_config.json")),
        "cursor" => Ok(Path::new(&home).join(".cursor/mcp.json")),
        _ => Err(format!("SafeBox can't set up {app} by itself.")),
    }
}

/// Whether the app's settings already start SafeBox's server.
pub fn is_connected(app: &str) -> bool {
    config_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .is_some_and(|v| v.pointer("/mcpServers/safebox").is_some())
}

/// Adds (or removes) SafeBox in the app's MCP settings, keeping everything else in the file and a backup next to it.
pub fn connect(app: &str, on: bool) -> Result<(), String> {
    let path = config_path(app)?;
    let mut config: Value = match std::fs::read_to_string(&path) {
        Ok(s) if !s.trim().is_empty() => serde_json::from_str(&s).map_err(|e| format!("Could not read {}: {e}", path.display()))?,
        _ => json!({}),
    };
    set_server(&mut config, on.then(|| server_path()).transpose()?.as_deref())?;
    if path.exists() {
        std::fs::copy(&path, path.with_extension("json.safebox-backup")).map_err(|e| e.to_string())?;
    } else if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, text + "\n").map_err(|e| e.to_string())
}

fn set_server(config: &mut Value, server: Option<&Path>) -> Result<(), String> {
    let root = config.as_object_mut().ok_or("The settings file isn't a JSON object.")?;
    let servers = root.entry("mcpServers").or_insert_with(|| json!({}));
    let servers = servers.as_object_mut().ok_or("mcpServers isn't a JSON object.")?;
    match server {
        Some(p) => {
            servers.insert("safebox".into(), json!({ "command": p.to_string_lossy() }));
        }
        None => {
            servers.remove("safebox");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_and_settings() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(SCHEMA).unwrap();
        db.execute("insert into ai_apps (name) values ('claude-ai')", []).unwrap();
        assert_eq!(list(&db).unwrap()[0].level, "facts");
        set_level(&db, "claude-ai", "search").unwrap();
        assert!(set_level(&db, "claude-ai", "all").is_err());
        assert_eq!(list(&db).unwrap()[0].level, "search");

        let mut config = json!({ "preferences": { "x": 1 }, "mcpServers": { "other": { "command": "o" } } });
        set_server(&mut config, Some(Path::new("/Applications/SafeBox.app/Contents/MacOS/safebox-mcp"))).unwrap();
        assert_eq!(config["mcpServers"]["safebox"]["command"], "/Applications/SafeBox.app/Contents/MacOS/safebox-mcp");
        assert_eq!(config["mcpServers"]["other"]["command"], "o");
        set_server(&mut config, None).unwrap();
        assert!(config["mcpServers"].get("safebox").is_none());
        assert_eq!(config["preferences"]["x"], 1);
    }
}
