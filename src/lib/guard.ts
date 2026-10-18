import { PATTERNS } from "./privacy";

/**
 * The privacy guard that runs in CI: finds personal details in changed lines before they reach the public repo.
 * - Patterns: emails, IBANs and ID numbers (the same ones the privacy layer masks). Invented test values are listed
 *   in `.privacy-allow`.
 * - Watch list: SHA-256 hashes of the owner's private words (a street, a name), kept in a CI variable so the real
 *   values never appear in the repo. Every 1-4 word run of a changed line is hashed and compared.
 */

export type Leak = { kind: string; value: string };

const KINDS = new Set(["EMAIL", "IBAN", "ID"]);
// Example domains, GitLab's noreply addresses, and Google Cloud service accounts (robots, never a person).
const SAFE_EMAIL = /@(?:example\.(?:com|org|net)|[\w.-]+\.invalid|users\.noreply\.gitlab\.com|[\w-]+\.iam\.gserviceaccount\.com|developer\.gserviceaccount\.com)$|^noreply@/i;
const FILE_NAME = /\.(?:png|jpe?g|svg|gif|webp|icns|ico|json|ts|tsx|js|css|md)$/i;

/** Lower case, accents off, punctuation to spaces: "Calle Robles, 214" → "calle robles 214". */
export const normalise = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export async function sha256(s: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash for the watch list, from a value as the owner would type it. */
export const watchHash = (value: string) => sha256(normalise(value));

/** Reads `.privacy-allow` or a watch list: one entry per line, `#` starts a comment. */
export const parseList = (text: string) =>
  new Set(
    text
      .split(/[\n,]/)
      .map((l) => l.replace(/#.*/, "").trim())
      .filter(Boolean),
  );

/** Personal details in one line of text. */
export async function findLeaks(line: string, allow: Set<string>, watch: Set<string>): Promise<Leak[]> {
  const leaks: Leak[] = [];
  for (const [kind, re] of PATTERNS) {
    if (!KINDS.has(kind)) continue;
    // matchAll works on its own copy of the pattern, so the shared one is never changed.
    for (const m of line.matchAll(re)) {
      const value = m[0];
      if (allow.has(value)) continue;
      if (kind === "EMAIL" && (SAFE_EMAIL.test(value) || FILE_NAME.test(value))) continue;
      if (!leaks.some((l) => l.value === value)) leaks.push({ kind, value });
    }
  }
  if (watch.size) {
    const words = normalise(line).split(" ").filter(Boolean);
    for (let n = 1; n <= 4; n++)
      for (let i = 0; i + n <= words.length; i++) {
        const run = words.slice(i, i + n).join(" ");
        if (watch.has(await sha256(run)) && !leaks.some((l) => l.value === run)) leaks.push({ kind: "WATCHED", value: run });
      }
  }
  return leaks;
}

/** Shows enough to find the value without printing it in a public CI log: "carla@mail.com" → "ca••••••••••••". */
export const redact = (s: string) => s.slice(0, 2) + "•".repeat(Math.max(s.length - 2, 3));

/** The added lines of a unified diff, with their file and line number. */
export function addedLines(diff: string) {
  const out: { file: string; line: number; text: string }[] = [];
  let file = "";
  let n = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) file = l.replace(/^\+\+\+ (?:b\/)?/, "");
    else if (l.startsWith("@@")) n = Number(l.match(/\+(\d+)/)?.[1] ?? 0);
    else if (l.startsWith("+")) out.push({ file, line: n++, text: l.slice(1) });
    else if (!l.startsWith("-")) n++;
  }
  return out;
}
