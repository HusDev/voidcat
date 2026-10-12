# SafeBox — status and next steps

Read this with `PREFERENCES.md` (his decisions) and `CLAUDE.md` (the code map) at the start of a session. Last updated 12 Oct 2026.

## The product
**SafeBox** (working name): a desktop app for smart, private storage of your life's documents. You drop documents in. It reads them on your Mac, files them into folders, and pulls out facts for you to approve. Any AI can use that knowledge, but personal details are masked before anything leaves.

- **Tagline:** "Drop your life in. Any AI can use it. None of them can take it."
- **First target users:** people whose paperwork spans countries (immigrants, expats, international workers).
- **Design canvas (all screens, private artifact):** https://claude.ai/artifact/97fHrNDyKQs6Q6DQ7cmB1Z (local copy in the Claude scratchpad; the published version is the reference)
- **Repo:** https://gitlab.com/hus.dev/safebox (private for now; must be public + MIT for the GitLab Transcend hackathon)
- **Owner:** Hussein (husdev). Separate from Hus, his private app in `~/lab/hus`. Never copy Hus's personal data into this repo.

## Built (all pushed to `main`)
1. **Desktop app:** Tauri 2 + React + Tailwind; Library, Ask, Calendar, Facts to approve, Connected AIs.
2. **Library:**
   - drag-and-drop or file picker; SQLite and files in `~/Library/Application Support/dev.hus.safebox/`;
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

## Next, in order
1. **Phase 3 — Opportunities** (designed on the canvas, screen 9):
   - Rust table `opportunities` (key, area, title, why, value, effort, deadline, next_step, fit yes/maybe/no, sources, status new/kept/done/dismissed).
   - Scan sends **masked** approved facts plus document titles/types to OpenRouter with ZDR, using `generateObject` + Zod. Show "what will be sent" first. The optional web-search toggle must say ZDR doesn't cover web search.
   - Cards with Keep / Add to calendar (creates a manual event) / Done / Dismiss; dismissed ideas stay dismissed on later scans. Sidebar link + `/opportunities` route.
   - Port the logic from Hus: `~/lab/hus/app/lib/ai.server.ts` `findOpportunities`, `~/lab/hus/app/routes/opportunities.tsx`.
2. **MCP server:** Claude Desktop, ChatGPT and Cursor search the library with masking; per-app access levels (Connected AIs).
3. **GitLab hackathon work:**
   - repo public + MIT;
   - CI stages (verify exists in `.gitlab-ci.yml`) plus GitLab Duo agents and flows for review, security, tests and release;
   - demo video under 3 min. The project story draft is in the conversation history; ask Hussein.
4. **OpenAI privacy-filter model** (Transformers.js/ONNX) to catch names the rules miss.
5. **Encrypt the library** (SQLCipher); only then may the UI say "encrypted".
6. **Polish:**
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
- **Restart the dev app** after `bun add` (a stale React copy causes "Invalid hook call") and after Rust changes: kill `target/debug/safebox`, `tauri dev`, and port 1420, then `bun run tauri dev` in the background.
- Rust toolchain lives in `~/.cargo/bin` (prepend it to PATH).
- `useEffect(() => el.scrollIntoView(...))` returns a promise in new browsers and crashes React: always use braces.
- Never `scrollIntoView` inside a scrolled page to highlight text; scroll the container instead (it made the inbox jump).
- Model prompts: don't give concrete example names or addresses; the local model copies them ("Lease Provença 210" incident).
- `keyring` must be v3 with `apple-native` (v4 has a different API).
- The browser preview (`bun run dev`, http://localhost:1420) has no library (`hasLibrary` false); use it only for layout checks (puppeteer scripts in the Claude scratchpad).
- The library DB is real user data: never reset it. Migrations add columns in `store.rs` `migrate()`; new tables use `create table if not exists`.
