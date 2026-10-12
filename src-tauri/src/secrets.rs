//! API keys live in the macOS Keychain, never in the library or in the interface's storage.

use keyring::Entry;

const SERVICE: &str = "dev.hus.safebox";
/// The only secrets SafeBox keeps.
const NAMES: [&str; 1] = ["openrouter"];

fn entry(name: &str) -> Result<Entry, String> {
    if !NAMES.contains(&name) {
        return Err("Unknown secret.".into());
    }
    Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

pub fn get(name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn set(name: &str, value: &str) -> Result<(), String> {
    entry(name)?
        .set_password(value.trim())
        .map_err(|e| e.to_string())
}

pub fn remove(name: &str) -> Result<(), String> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
