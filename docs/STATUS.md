# Voidcat — status and next steps

Read this with `PREFERENCES.md` (his decisions) and `CLAUDE.md` (the code map) at the start of a session. Last updated 12 Oct 2026 (Voidcat rebrand).

## The product
**Voidcat** (first called SafeBox; name not final): a desktop app for smart, private storage of your life's documents. You drop documents in. It reads them on your Mac, files them into folders, and pulls out facts for you to approve. Any AI can use that knowledge, but personal details are masked before anything leaves.

- **Tagline:** "Drop your life in. Any AI can use it. None of them can take it."
- **First target users:** people whose paperwork spans countries (immigrants, expats, international workers).
- **Design canvas (all screens, private artifact):** https://claude.ai/artifact/97fHrNDyKQs6Q6DQ7cmB1Z (local copy in the Claude scratchpad; the published version is the reference)
- **Repo:** https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/8599176/showcase (remote `showcase`, where work happens; must be public + MIT for the hackathon). Private copy: https://gitlab.com/hus.dev/voidcat (remote `origin`), pushed to later.
- **Owner:** Hussein (husdev). Separate from Hus, his private app in `~/lab/hus`. Never copy Hus's personal data into this repo.

## Built (all pushed to `main`)
1. **Desktop app:** Tauri 2 + React + Tailwind; Library, Ask, Calendar, Facts to approve, Connected AIs.
2. **Library:**
   - drag-and-drop or file picker; SQLite and files in `~/Library/Application Support/dev.hus.voidcat/`;
   - duplicates detected by sha256; open, remove, move;
   - full-text search inside pages (accents ignored).
3. **Reading:** PDF text (unpdf); photos and scanned PDFs read by **Apple Vision OCR** on the Mac (Spanish, English, Arabic).
4. **Filing and facts:**
   - the **local model** (Ollama `qwen3.5:9b`) gives each document a title, area and type, and extracts facts with page numbers;
   - facts wait in **Facts to approve**, with the source page highlighted; Markdown documents render as pages.
5. **Folders (phase 1):**
   - two levels (Area › Folder); the classifier matches an existing folder or proposes a new one;
   - files automatically when the folder exists and confidence is high; otherwise the document waits in "to file" with **File here / Create and file / Rename / Other folder…**;
   - sidebar folder tree.
6. **Privacy layer:**
   - reversible placeholders `[PERSON_1]`, `[ID_2]`, `[DATE_1]`;
   - masks approved facts plus their short forms (street + number, first name + surname), then patterns (NIE/DNI, IBAN, passport, email, phone, dates);
   - dates get relative notes; amounts are kept.
7. **Ask:**
   - a conversation with OpenRouter (`zdr: true`, `data_collection: "deny"`); the key is in the macOS Keychain; default model `anthropic/claude-sonnet-5.5`;
   - asks for review only when something private would be sent; shows "What was sent" and sources.
8. **Hide private details** (⌘⇧H): placeholders across the app, source pages blurred — for screen recording.
9. **Calendar (phase 2):**
   - dates come from approved facts, plus worked-out renewals (60 days before ID/permit expiry), monthly rent days ("del 1 al 5 de cada mes") and manual events;
   - papers-to-bring checklist via the local model;
   - Mac notifications while the app is open; `.ics` export.
10. **Opportunities (phase 3):**
   - a scan sends masked approved facts plus document titles/types (never page text) to OpenRouter with ZDR; you see what will be sent and a cost estimate first;
   - optional "check current rules on the web" (off by default; says plainly it's outside ZDR);
   - cards with Keep / Add to calendar / Done / Dismiss; later scans keep your decisions and never bring dismissed ideas back.
11. **MCP server:**
   - Claude Desktop, Cursor and Claude Code can list documents, read approved facts and see upcoming dates, all masked;
   - searching and reading pages need the higher level; each app starts at "masked facts and dates" and you change it in Connected AIs;
   - one click adds Voidcat to Claude Desktop or Cursor; Claude Code gets a command to copy. ChatGPT isn't supported (it needs an internet server).
12. **Voidcat rebrand:** line-cat logo and app icon, violet accent, Outfit headings, light and dark themes that follow the Mac (sidebar dark in both), name Voidcat in the window and the interface. Canvas: https://claude.ai/artifact/97fHrNDyKQs6Q6DQ7cmB1Z (dark and light rows).
13. **Renamed to Voidcat everywhere in the app:** package, identifier `dev.hus.voidcat`, database `voidcat.db`, Keychain service, MCP server and its entry in other apps. The old library folder, key and MCP entry move over automatically on first start (`legacy.rs`; it also rewrites each document's saved file path). Backup taken before the rename: `~/Library/Application Support/dev.hus.safebox.backup-2026-10-12`. The local folder is `~/lab/voidcat` and the GitLab project `hus.dev/voidcat` (renamed from safebox; GitLab redirects the old URL).
14. **Contacts:** people and organisations found in each document by the local model (after filing, or "Find contacts" for older documents), merged across documents, with role, area, phone, email, address, ID and where they appear; edit, "This is me", hide. People's details are hidden from every AI like approved facts.
15. **Me:** a profile built on this Mac from approved facts (identity, residency, home, work & money, education, health), each value with its source document; "Needs you" for conflicting values (your choice is remembered) and missing details; a timeline.

## Next, in order
1. **GitLab hackathon work** (Supervised autonomy, all nine stages; full plan in ~/.claude/plans/sprightly-sparking-tiger.md):
   - Phase 1, pipeline stages: verify (+ Rust tests), secure (SAST, secret detection, dependency scanning), govern (`scripts/privacy-guard.ts`), package (MCP binaries for Apple silicon and Intel), release (on `v*` tags: generic packages + GitLab release from `CHANGELOG.md`);
   - Phase 2, Duo groundwork: `.gitlab/duo/agent-config.yml`, `AGENTS.md`, `.gitlab/duo/mr-review-instructions.yaml`;
   - Phase 3, foundational flows on (Code Review, Developer, Fix CI/CD Pipeline, Security Review, SAST flows);
   - Phase 4, custom flows in the AI Catalog (sources in `.gitlab/duo/flows/`): Triage, Privacy Guard, Pipeline Doctor, Health Reporter, Release;
   - Phase 5, Observability, README automation section, a full run for the demo video (under 3 min, invented data only).
2. **OpenAI privacy-filter model** (Transformers.js/ONNX) to catch names the rules miss.
3. **Encrypt the library** (SQLCipher); only then may the UI say "encrypted".
4. **Polish:**
   - a Rename-folder button in the folder view;
   - background reminders when the app is closed;
   - `docType` sometimes gets the folder name (seen once): tighten the schema description.

## How Hussein likes to work
- Short answers; challenge with evidence instead of folding.
- Record every decision in `PREFERENCES.md` (dated change log).
- Build one phase at a time. After each step: type check, lint, tests, then **commit and push** (he expects pushes) and restart the dev app so he can try it.
- Show designs on the artifact canvas before building big screens.
- Explain in plain words; no jargon in the UI.

## Gotchas
- **Restart the dev app** after `bun add` (a stale React copy causes "Invalid hook call") and after Rust changes: kill `target/debug/voidcat`, `tauri dev`, and port 1420, then `bun run tauri dev` in the background.
- Run `bun run build:mcp` before `cargo test` or a fresh `tauri dev` if `src-tauri/binaries/` is empty (Tauri checks the sidecar exists). After changing `mcp/server.ts` or `src/lib/mcp.ts`, rebuild it; apps pick it up the next time they start the server.
- Documents store absolute file paths (`documents.stored_path`): any change to the data folder must rewrite them (see `legacy::fix_paths`).
- Rust toolchain lives in `~/.cargo/bin` (prepend it to PATH).
- `useEffect(() => el.scrollIntoView(...))` returns a promise in new browsers and crashes React: always use braces.
- Never `scrollIntoView` inside a scrolled page to highlight text; scroll the container instead (it made the inbox jump).
- Model prompts: don't give concrete example names or addresses; the local model copies them ("Lease Provença 210" incident).
- `keyring` must be v3 with `apple-native` (v4 has a different API).
- The browser preview (`bun run dev`, http://localhost:1420) has no library (`hasLibrary` false); use it only for layout checks (puppeteer scripts in the Claude scratchpad).
- The library DB is real user data: never reset it. Migrations add columns in `store.rs` `migrate()`; new tables use `create table if not exists`.

## Security findings reviewed (13 Oct 2026, MR !1)
- **Zod 4.6.6, CVE-2023-54404 (high):** the advisory covers "through 4.6.5", so 4.6.6 is outside it; the scanner's data lags. Not upgraded to 4.6.7 because it was one day old (supply-chain caution). Recheck later and bump.
- **glib 0.18.5, RUSTSEC-2024-0429 (medium):** comes from Tauri's Linux (GTK) dependencies; the macOS app doesn't build it, and Tauri pins this version. Not applicable.
- **6 × "regular expression with non-literal value" (SAST, medium):** false positives. Patterns come from fixed lists or from values passed through `escape()`. Marked with `nosemgrep` comments that give the reason.
- **Licenses:** 301 npm packages and 502 crates, all permissive or weak copyleft (MPL-2.0 files used unmodified, OFL fonts, an LGPL option where MIT is also offered). Nothing conflicts with MIT. `src-tauri/Cargo.toml` now declares `license = "MIT"`.
