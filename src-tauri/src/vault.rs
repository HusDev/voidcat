//! The library's encryption. One random master key lives in the macOS Keychain (its own entry, never readable from
//! the interface); from it come the database key (SQLCipher) and the files key (AES-256-GCM for each stored document).

use aes_gcm::aead::{Aead, Generate, KeyInit, Nonce};
use aes_gcm::{Aes256Gcm, Key};
use keyring::Entry;
use sha2::{Digest, Sha256};
use std::path::Path;

const SERVICE: &str = "dev.hus.voidcat";
const ENTRY: &str = "library-key";
/// Every encrypted file starts with this, then a 12-byte nonce, then the ciphertext and its tag.
const MAGIC: &[u8] = b"VCAT\x01\x00";
const NONCE: usize = 12;

pub struct Vault {
    master: [u8; 32],
    files: Aes256Gcm,
    /// For SQLCipher's `pragma key = "x'…'"`: 32 bytes as hex, used as the raw key.
    pub db_key: String,
}

impl Vault {
    pub fn from_master(master: &[u8; 32]) -> Self {
        let derive = |what: &[u8]| Sha256::new().chain_update(b"voidcat:").chain_update(what).chain_update(master).finalize();
        let files_key = derive(b"files");
        Vault {
            master: *master,
            files: Aes256Gcm::new_from_slice(&files_key).expect("a 32-byte key"),
            db_key: hex::encode(derive(b"database")),
        }
    }

    /// The library's key from the Keychain, or a new one for a library that isn't encrypted yet. Never makes a new
    /// key for a database that is already encrypted: that would lock the library for good (`Load::Missing` instead,
    /// and the app asks for the recovery key).
    pub fn load(db_path: &Path) -> Result<Self, Load> {
        Self::load_inner(db_path).map_err(|e| if e == MISSING { Load::Missing } else { Load::Failed(e) })
    }

    fn load_inner(db_path: &Path) -> Result<Self, String> {
        let entry = Entry::new(SERVICE, ENTRY).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(hex_key) => {
                let bytes = hex::decode(hex_key.trim()).map_err(|_| "The library key in the Keychain is damaged.".to_string())?;
                let master: [u8; 32] = bytes.try_into().map_err(|_| "The library key in the Keychain is damaged.".to_string())?;
                Ok(Self::from_master(&master))
            }
            Err(keyring::Error::NoEntry) => {
                if is_encrypted_db(db_path) {
                    return Err(MISSING.into());
                }
                let master: [u8; 32] = Key::<Aes256Gcm>::generate().into();
                entry.set_password(&hex::encode(master)).map_err(|e| format!("Couldn't save the library key in the Keychain: {e}"))?;
                // Read it back, so a key that didn't really save is noticed before anything is encrypted with it.
                match entry.get_password() {
                    Ok(saved) if saved == hex::encode(master) => Ok(Self::from_master(&master)),
                    _ => Err("Couldn't save the library key in the Keychain.".into()),
                }
            }
            Err(e) => Err(format!("Voidcat needs its key from the Keychain to open your library. Allow access and open Voidcat again. ({e})")),
        }
    }

    /// Puts this key in the Keychain (after the recovery key opened the library).
    pub fn save(&self) -> Result<(), String> {
        let entry = Entry::new(SERVICE, ENTRY).map_err(|e| e.to_string())?;
        entry.set_password(&hex::encode(self.master)).map_err(|e| format!("Couldn't save the library key in the Keychain: {e}"))
    }

    /// The key as something a person can write down: 52 letters and digits in groups of four.
    pub fn recovery_code(&self) -> String {
        let code = base32(&self.master);
        code.as_bytes().chunks(4).map(|c| String::from_utf8_lossy(c).into_owned()).collect::<Vec<_>>().join("-")
    }

    /// Reads a recovery code back, forgiving case, spaces, dashes and the look-alikes 0/O, 1/I, 8/B.
    pub fn from_recovery_code(code: &str) -> Result<Self, String> {
        let bytes = unbase32(code).ok_or("That doesn't look like a recovery key: check it and try again.")?;
        let master: [u8; 32] = bytes.try_into().map_err(|_| "That recovery key is too short or too long.".to_string())?;
        Ok(Self::from_master(&master))
    }

    pub fn encrypt(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
        let nonce = Nonce::<Aes256Gcm>::generate();
        let sealed = self.files.encrypt(&nonce, plain).map_err(|_| "Couldn't encrypt the file.".to_string())?;
        let mut out = Vec::with_capacity(MAGIC.len() + NONCE + sealed.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&sealed);
        Ok(out)
    }

    /// A stored file's contents. Files from before encryption are returned as they are.
    pub fn decrypt(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        if !is_encrypted(&data) {
            return Ok(data);
        }
        let rest = &data[MAGIC.len()..];
        if rest.len() < NONCE {
            return Err("This file is damaged.".into());
        }
        let nonce = Nonce::<Aes256Gcm>::try_from(&rest[..NONCE]).map_err(|_| "This file is damaged.".to_string())?;
        self.files
            .decrypt(&nonce, &rest[NONCE..])
            .map_err(|_| "This file is damaged or was changed outside Voidcat.".to_string())
    }
}

/// Why the key couldn't be loaded.
pub enum Load {
    /// The library is encrypted but its key isn't in the Keychain: ask for the recovery key.
    Missing,
    /// The Keychain refused or failed: say why.
    Failed(String),
}

const MISSING: &str = "missing";
const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

fn base32(bytes: &[u8]) -> String {
    let (mut out, mut buffer, mut bits) = (String::new(), 0u32, 0);
    for &b in bytes {
        buffer = (buffer << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(ALPHABET[((buffer >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    out
}

fn unbase32(code: &str) -> Option<Vec<u8>> {
    let (mut out, mut buffer, mut bits) = (Vec::new(), 0u32, 0);
    for c in code.chars().filter(|c| c.is_ascii_alphanumeric()) {
        let c = match c.to_ascii_uppercase() {
            '0' => 'O',
            '1' => 'I',
            '8' => 'B',
            c => c,
        };
        let v = ALPHABET.iter().position(|&a| a as char == c)? as u32;
        buffer = (buffer << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Some(out)
}

pub fn is_encrypted(data: &[u8]) -> bool {
    data.starts_with(MAGIC)
}

/// A plain SQLite file starts with "SQLite format 3"; an SQLCipher one looks like noise. A missing or empty file is
/// neither: a new library.
pub fn is_encrypted_db(path: &Path) -> bool {
    match std::fs::read(path) {
        Ok(b) if b.len() >= 16 => !b.starts_with(b"SQLite format 3\0"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_round_trip_and_detect_changes() {
        let v = Vault::from_master(&[7; 32]);
        let sealed = v.encrypt(b"rental contract").unwrap();
        assert!(is_encrypted(&sealed));
        assert!(!sealed.windows(6).any(|w| w == b"rental"));
        assert_eq!(v.decrypt(sealed.clone()).unwrap(), b"rental contract");

        let mut changed = sealed;
        let last = changed.len() - 1;
        changed[last] ^= 1;
        assert!(v.decrypt(changed).is_err());
        assert!(Vault::from_master(&[8; 32]).decrypt(v.encrypt(b"x").unwrap()).is_err());
    }

    #[test]
    fn files_from_before_encryption_still_read() {
        let v = Vault::from_master(&[7; 32]);
        assert_eq!(v.decrypt(b"%PDF-1.4".to_vec()).unwrap(), b"%PDF-1.4");
    }

    #[test]
    fn recovery_code_round_trips() {
        let mut master = [0u8; 32];
        for (i, b) in master.iter_mut().enumerate() {
            *b = (i * 37 + 11) as u8;
        }
        let v = Vault::from_master(&master);
        let code = v.recovery_code();
        assert_eq!(code.len(), 52 + 12, "13 groups of 4 with dashes");
        let typed = code.to_lowercase().replace('-', " ").replace('o', "0").replace('i', "1");
        assert_eq!(Vault::from_recovery_code(&typed).unwrap().db_key, v.db_key);
        assert!(Vault::from_recovery_code("not a code!").is_err());
        assert!(Vault::from_recovery_code("ABCD-EFGH").is_err());
    }

    /// The same values are checked in `src/cloud/vault.test.ts`: the Mac and the browser must derive the same keys
    /// and write the same recovery key, or a library couldn't move between them.
    #[test]
    fn matches_the_browser_vault() {
        let v = Vault::from_master(&[7; 32]);
        assert_eq!(v.db_key, "11776c2d26779b5eb27bde41c7199f4b0559b1627484b492e82ababb918f4307");
        assert_eq!(v.recovery_code(), "A4DQ-OBYH-A4DQ-OBYH-A4DQ-OBYH-A4DQ-OBYH-A4DQ-OBYH-A4DQ-OBYH-A4DQ");
    }

    #[test]
    fn database_and_files_get_different_keys() {
        let v = Vault::from_master(&[7; 32]);
        assert_eq!(v.db_key.len(), 64);
        assert_ne!(v.db_key, hex::encode([7u8; 32]));
    }
}
