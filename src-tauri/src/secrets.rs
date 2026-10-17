//! API keys live in the macOS Keychain, never in the library or in the interface's storage.

use keyring::Entry;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Each key is read from the Keychain at most once per launch and kept here, so macOS asks once, not on every screen.
/// A refused prompt is remembered as "no key" until the key is saved again or the app restarts.
static CACHE: Mutex<BTreeMap<String, Option<String>>> = Mutex::new(BTreeMap::new());

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
    // Held while the Keychain asks, so screens opening together wait for one answer instead of each asking.
    let mut cache = CACHE.lock().unwrap();
    if let Some(known) = cache.get(name) {
        return Ok(known.clone());
    }
    let value = read(name).unwrap_or(None);
    cache.insert(name.to_string(), value.clone());
    Ok(value)
}

fn read(name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) if !TRIED_OLD.swap(true, Ordering::SeqCst) => {
            let old = Entry::new(OLD_SERVICE, name).map_err(|e| e.to_string())?;
            match old.get_password() {
                Ok(v) => {
                    write(name, &v)?;
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
    let mut cache = CACHE.lock().unwrap();
    write(name, value)?;
    cache.insert(name.to_string(), Some(value.trim().to_string()));
    Ok(())
}

fn write(name: &str, value: &str) -> Result<(), String> {
    entry(name)?
        .set_password(value.trim())
        .map_err(|e| e.to_string())
}

pub fn remove(name: &str) -> Result<(), String> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {
            CACHE.lock().unwrap().insert(name.to_string(), None);
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}
