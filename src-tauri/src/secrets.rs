//! API keys live in the macOS Keychain, never in the library or in the interface's storage.

use keyring::Entry;
use std::sync::atomic::{AtomicBool, Ordering};

/// macOS asks before Voidcat may read a key saved under the old name; ask at most once per launch.
static TRIED_OLD: AtomicBool = AtomicBool::new(false);

const SERVICE: &str = "dev.hus.voidcat";
/// Where keys were kept under the app's first name; moved to SERVICE the first time they are read.
const OLD_SERVICE: &str = "dev.hus.safebox";
/// The only secrets Voidcat keeps.
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
        Err(keyring::Error::NoEntry) if !TRIED_OLD.swap(true, Ordering::SeqCst) => {
            let old = Entry::new(OLD_SERVICE, name).map_err(|e| e.to_string())?;
            match old.get_password() {
                Ok(v) => {
                    set(name, &v)?;
                    let _ = old.delete_credential();
                    Ok(Some(v))
                }
                // Not there, or the user said no: carry on without a key.
                Err(_) => Ok(None),
            }
        }
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
