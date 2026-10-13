/**
 * Privacy guard (CI "govern" stage): fails when changed lines add personal details.
 *
 *   bun scripts/privacy-guard.ts            check lines added since the base (MR base, previous push, or HEAD~1)
 *   bun scripts/privacy-guard.ts --all      check every tracked file
 *   bun scripts/privacy-guard.ts --hash "Calle Robles 214"   print the watch-list hash for a private value
 *
 * Watch list: hashes in the PRIVACY_WATCH CI variable (comma or newline separated). Allow list: `.privacy-allow`.
 */
import { $ } from "bun";
import { addedLines, findLeaks, parseList, redact, watchHash } from "../src/lib/guard";

const SKIP = /(^|\/)(bun\.lock|Cargo\.lock|\.privacy-allow)$|\.(png|jpe?g|gif|webp|icns|ico|woff2?|pdf)$/;
const ZERO = /^0+$/;

const args = process.argv.slice(2);
if (args[0] === "--hash") {
  for (const v of args.slice(1)) console.log(await watchHash(v));
  process.exit(0);
}

const allow = parseList(await Bun.file(".privacy-allow").text().catch(() => ""));
const watch = parseList(process.env.PRIVACY_WATCH ?? "");

let lines: { file: string; line: number; text: string }[];
if (args[0] === "--all") {
  lines = [];
  for (const file of (await $`git ls-files`.text()).split("\n").filter((f) => f && !SKIP.test(f))) {
    const text = await Bun.file(file).text().catch(() => "");
    text.split("\n").forEach((t, i) => lines.push({ file, line: i + 1, text: t }));
  }
} else {
  const env = process.env;
  const before = env.CI_COMMIT_BEFORE_SHA && !ZERO.test(env.CI_COMMIT_BEFORE_SHA) ? env.CI_COMMIT_BEFORE_SHA : undefined;
  const base = env.CI_MERGE_REQUEST_DIFF_BASE_SHA ?? before ?? "HEAD~1";
  lines = addedLines(await $`git diff --unified=0 ${base} HEAD`.text()).filter((l) => !SKIP.test(l.file));
  console.log(`Checking ${lines.length} added lines since ${base.slice(0, 8)}.`);
}

let found = 0;
for (const l of lines)
  for (const leak of await findLeaks(l.text, allow, watch)) {
    found++;
    console.log(`${l.file}:${l.line}  ${leak.kind}  ${redact(leak.value)}`);
  }

console.log(watch.size ? `Watch list: ${watch.size} entries.` : "Watch list: empty (set PRIVACY_WATCH to add private words).");
if (found) {
  console.log(`\n${found} possible personal detail(s). Replace them with invented values, or add invented ones to .privacy-allow.`);
  process.exit(1);
}
console.log("No personal details found.");
