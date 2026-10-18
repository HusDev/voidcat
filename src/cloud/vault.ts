/**
 * The browser's half of Voidcat's encryption, matching `src-tauri/src/vault.rs` exactly: one random 32-byte master
 * key, from which SHA-256("voidcat:" + purpose + master) derives a key per purpose. The recovery key is the master
 * in base32, so a library moves between the Mac and the browser with it. Records and files are sealed with AES-256-GCM
 * in the Mac's file format: "VCAT\x01\x00", a 12-byte nonce, then the ciphertext and tag.
 */

const MAGIC = new Uint8Array([0x56, 0x43, 0x41, 0x54, 0x01, 0x00]);
const NONCE = 12;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type Keys = {
  /** Locks each synced record (a document, a fact, a folder…). */
  records: CryptoKey;
  /** Locks stored document files; the same key the Mac uses for its files. */
  files: CryptoKey;
  /** Hex, for checks against the Mac's derivation. Never stored or sent. */
  databaseHex?: string;
};

const encode = (s: string) => new TextEncoder().encode(s);
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function derive(master: Uint8Array, purpose: string) {
  const input = new Uint8Array([...encode("voidcat:"), ...encode(purpose), ...master]);
  return crypto.subtle.digest("SHA-256", input);
}

/** The keys a master key opens. They can't be exported again, so a stored copy can't be read out of the browser. */
export async function keysFrom(master: Uint8Array, withHex = false): Promise<Keys> {
  const aes = async (purpose: string) =>
    crypto.subtle.importKey("raw", await derive(master, purpose), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return {
    records: await aes("records"),
    files: await aes("files"),
    databaseHex: withHex ? toHex(await derive(master, "database")) : undefined,
  };
}

export const newMaster = () => crypto.getRandomValues(new Uint8Array(32));

/** 52 letters and digits in groups of four, as on the Mac. */
export function recoveryCode(master: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of master) {
    buffer = ((buffer << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)?.join("-") ?? out;
}

/** Reads a recovery key back, forgiving case, spaces, dashes and the look-alikes 0/O, 1/I, 8/B. */
export function masterFromCode(code: string): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let c of code.replace(/[^a-z0-9]/gi, "").toUpperCase()) {
    c = c === "0" ? "O" : c === "1" ? "I" : c === "8" ? "B" : c;
    const v = ALPHABET.indexOf(c);
    if (v < 0) return null;
    buffer = ((buffer << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out.length === 32 ? new Uint8Array(out) : null;
}

export async function seal(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new Uint8Array(plain)));
  const out = new Uint8Array(MAGIC.length + NONCE + sealed.length);
  out.set(MAGIC);
  out.set(nonce, MAGIC.length);
  out.set(sealed, MAGIC.length + NONCE);
  return out;
}

export const isSealed = (data: Uint8Array) => MAGIC.every((b, i) => data[i] === b);

/** Opens sealed data; throws if it was changed or locked with another key. */
export async function open(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  if (!isSealed(data) || data.length < MAGIC.length + NONCE) throw new Error("This item is damaged.");
  const nonce = data.slice(MAGIC.length, MAGIC.length + NONCE);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, data.slice(MAGIC.length + NONCE)));
  } catch {
    throw new Error("This item is damaged or was locked with another key.");
  }
}

export const sealText = async (key: CryptoKey, text: string) => seal(key, encode(text));
export const openText = async (key: CryptoKey, data: Uint8Array) => new TextDecoder().decode(await open(key, data));
