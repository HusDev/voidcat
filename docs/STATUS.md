# Voidcat — status and next steps

Read this with `PREFERENCES.md` (his decisions) and `CLAUDE.md` (the code map) at the start of a session. Last updated 17 Oct 2026.

## The product
**Voidcat** (final name; first called SafeBox): a desktop app for smart, private storage of your life's documents. You drop documents in. It reads them on your Mac, files them into folders, and pulls out facts for you to approve. Any AI can use that knowledge, but personal details are masked before anything leaves.

- **Tagline:** "Drop your life in. Any AI can use it. None of them can take it."
- **First target users:** people whose paperwork spans countries (immigrants, expats, international workers).
- **Design canvas (all screens, private artifact):** https://claude.ai/artifact/97fHrNDyKQs6Q6DQ7cmB1Z (local copy in the Claude scratchpad; the published version is the reference)
- **Repo:** https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/8599176/showcase (remote `showcase`, where work happens; must be public + MIT for the hackathon). Private copy: https://gitlab.com/hus.dev/voidcat (remote `origin`), pushed to later.
- **Owner:** Hussein (husdev). Separate from Hus, his private app in `~/lab/hus`. Never copy Hus's personal data into this repo.

## Built
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
12. **Voidcat rebrand:** line-cat logo and app icon (white cat with gold eyes since 17 Oct; violet before), black-and-white actions, Outfit headings, light and dark themes that follow the Mac (sidebar dark in both), name Voidcat in the window and the interface. Canvas: https://claude.ai/artifact/97fHrNDyKQs6Q6DQ7cmB1Z (dark and light rows).
13. **Renamed to Voidcat everywhere in the app:** package, identifier `dev.hus.voidcat`, database `voidcat.db`, Keychain service, MCP server and its entry in other apps. The old library folder, key and MCP entry move over automatically on first start (`legacy.rs`; it also rewrites each document's saved file path). Backup taken before the rename: `~/Library/Application Support/dev.hus.safebox.backup-2026-10-12`. The local folder is `~/lab/voidcat` and the GitLab project `hus.dev/voidcat` (renamed from safebox; GitLab redirects the old URL).
14. **Contacts:** people and organisations found in each document by the local model (after filing, or "Find contacts" for older documents), merged across documents, with role, area, phone, email, address, ID and where they appear; edit, "This is me", hide. People's details are hidden from every AI like approved facts.
15. **Me:** a profile built on this Mac from approved facts (identity, residency, home, work & money, education, health), each value with its source document; "Needs you" for conflicting values (your choice is remembered) and missing details; a timeline.
16. **Tabs:** every screen and document gets a tab (Ask is one tab); documents open inside the app: PDFs with fact marks, images, text/Markdown, spreadsheets as tables, Word as text.
17. **More file types:** .xlsx/.xls/.ods (calamine) and .docx (zip + XML), both in Rust.
18. **Review beside the document:** pending facts in a panel next to the page, values marked on it; Library splits "Needs your review" from "All set".
19. **Folders, phase 2:** two-step filing (area first, then that area's folders) fixed "everything in Travel"; Re-file; drag and drop; rename; move; Download zip.
20. **Ask, phase 2:** local (Ollama) and cloud models in one dropdown; chat history; @ mentions to scope the context (@all = everything); the model can propose a zip of documents (`bundle_documents`), saved only when you click; today's date in the prompt; greetings get a short answer and filler words don't search.
21. **Side chats:** "Ask about this document" in a document tab, "Ask about me" on Me.
22. **Labels:** expired / ended from dates, duplicates by text similarity, unsigned only with a "sign here" request in a signable kind of document plus the vision model, incomplete from "page X of Y", not useful only when no facts were found.
23. **Me redesign** (dark ID header, missing chips, section cards, timeline) and Contacts limited to people you can reach.
24. **Voidcat Cloud, Mac side (18 Oct, branch `cloud/day-1`):** Settings → Voidcat Cloud connects the Mac (email link or Google, both through the browser and a localhost listener); every document goes up as a sealed record + its already-sealed file; per-document "In the cloud" switch (document tab, card, tree menu); marks on cards and tree rows; sidebar status above "Encrypted"; "New documents go to the cloud"; Disconnect; Delete the cloud copy; Join a cloud library made elsewhere (re-locks the Mac with that key, backup kept beside the library). Day 2 (same branch): the browser opens the cloud library (Library, folders, document tabs, search, fact review, rename/move, remove, drop or choose files); browser changes and files reach the Mac through sealed `edit_` records on its next sync. Not in the browser yet: Ask, Calendar extras, Contacts, Me, labels (Day 6 for Ask). Day 3 (branch `cloud/day-3`): "Read now" in the browser (OCR and masking in the browser, voidcat-api + Gemini 2.5 Flash in Belgium, 300 reads a month), live at https://voidcat-api-1094942921673.europe-west1.run.app. Ask in the browser (branch `cloud/ask`): Gemini through `/v1/ask`, masked both ways, 1,000 a month; no zip or saved chats there yet. Trust basics (branch `cloud/trust`): Delete my account, browser export, Privacy Policy and Terms (placeholders to fill in), 30-minute idle lock.
25. **Notes (19 Oct, branch `feat/notes`):** write .md/.txt in Voidcat (New document, New document here on a folder), Edit any text document with autosave and ⌘S, one previous version kept per editing session, Export as Word (.docx) or as is, Find facts & file only by hand; Mac only (browser read-only).
26. **Signing (19 Oct, branch `feat/signing`):** visible signature (draw, type, upload), kept sealed on the Mac; auto-placed where the document asks; date and text boxes; "… (signed)" PDF next to the original; PDFs, photos and notes; Settings → Your signature.
27. **Library at scale (19 Oct, branch `feat/library-views`):** view tabs (Needs you, Recently added, Expiring soon, Unsigned, Notes I wrote, Everything), compact list by time with key facts, filters, sort, List/Cards, drop anywhere; plus the Tools screen and + New.

## Next, in order
1. **GitLab hackathon work** (Supervised autonomy, all nine stages; full plan in ~/.claude/plans/sprightly-sparking-tiger.md):
   - Phase 1, pipeline stages: verify (+ Rust tests), secure (SAST, secret detection, dependency scanning), govern (`scripts/privacy-guard.ts`), package (MCP binaries for Apple silicon and Intel), release (on `v*` tags: generic packages + GitLab release from `CHANGELOG.md`);
   - Phase 2, Duo groundwork: `.gitlab/duo/agent-config.yml`, `AGENTS.md`, `.gitlab/duo/mr-review-instructions.yaml`;
   - Phase 3, foundational flows on (Code Review, Developer, Fix CI/CD Pipeline, Security Review, SAST flows);
   - Phase 4, custom flows in the AI Catalog (sources in `.gitlab/duo/flows/`): Triage, Privacy Guard, Pipeline Doctor, Health Reporter, Release;
   - Phase 5, Observability, README automation section, a full run for the demo video (under 3 min, invented data only).
   - **State on 17 Oct 2026:** phases 1–2 merged and green. Only the Triage custom flow is in the AI Catalog and enabled; Privacy Guard, Pipeline Doctor, Health Reporter and Release still need pasting in (AI › Flows › New flow, sources in `.gitlab/duo/flows/`) and their triggers switching on (Triage's "issue created" trigger didn't fire either). No flow session had ever succeeded: the runtime image lacked `curl` for downloading duo-cli (fixed in `agent-config.yml`, which is read from `main`). Observability is a group setting, switched on in the UI. Issue #3 (Rename button in the folder view) is the small real task for the full loop: Triage → Developer flow → MR → Code Review → merge → tag `v0.1.0` → release.
   - **Demo video:** `bun run demo` opens an empty library in `~/Library/Application Support/dev.hus.voidcat-demo/` (`VOIDCAT_DIR`); drop in `demo/documents/` (all invented). See `demo/README.md`.
2. (done 17 Oct) **OpenAI privacy-filter model**: Settings → "Catch names the rules miss"; not in the MCP server.
3. (done 17 Oct) **Encrypted library**: SQLCipher database + AES-256-GCM files, key in the Keychain; MCP answers through the running app. Plain backup kept at `~/Library/Application Support/dev.hus.voidcat.backup-2026-10-17-before-encryption` (delete once happy).
4. **Polish:**
   - a Rename-folder button in the folder view;
   - (done 17 Oct) reminders when the window is closed: menu bar cat, Open at login;
   - (done 17 Oct) `docType` description now says "never a folder, area or person name"; filing no longer shows folders in the first step anyway.

## How Hussein likes to work
- Short answers; challenge with evidence instead of folding.
- Record every decision in `PREFERENCES.md` (dated change log).
- Build one phase at a time. After each step: type check, lint, tests, then **commit and push** (he expects pushes) and restart the dev app so he can try it.
- Show designs on the artifact canvas before building big screens.
- Explain in plain words; no jargon in the UI.

## Gotchas
- Website and web app (18 Oct): https://voidcat.io = the landing page (`site/`, static, its own strict CSP in `firebase.json`), www redirects to it; https://app.voidcat.io = Voidcat Cloud, Firebase Hosting site `voidcat-app` forwarding every request to Cloud Run `voidcat-web` (headers come from nginx). Both deployed by `scripts/deploy-hosting.ts` (Hosting REST API; gcloud token locally, Workload Identity in CI job `deploy-hosting`, which runs only when `site/`, `firebase.json` or `.firebaserc` change; gitlab-deploy@ needs `roles/firebasehosting.admin`). DNS at Namecheap. The old run.app address still works. Voidcat Cloud web app on Cloud Run: https://voidcat-web-1094942921673.europe-west1.run.app, deployed by `deploy-web` on main (first deploy by hand on 18 Oct). A new web address must be added to the API's `ORIGINS` (`api/server.ts`), Firebase Auth's authorized domains (Identity Toolkit admin config `authorizedDomains`) and to the bucket CORS (`gcloud storage buckets update gs://voidcat-cloud-files --cors-file`), and to the CSP in `deploy/web/headers.conf` if it calls new hosts.
- Voidcat Cloud on the Mac: Firebase's sign-in pop-ups don't work inside the app's window, so sign-in happens in the browser and comes back to `http://localhost:<port>/signin|google/<nonce>` (`cloud_signin.rs`, 20 minutes). The email link only works on the Mac that asked for it, while Voidcat is open. CSP `connect-src` allows identitytoolkit, securetoken, firestore and firebasestorage. Rules are deployed with the Firebase Rules REST API (no firebase CLI): `firestore.rules` → release `cloud.firestore`, `storage.rules` → `firebase.storage/voidcat-cloud-files`. Bucket CORS allows GET from localhost:1430/1420 and tauri://localhost.
- The library is encrypted: never read `files/` or `voidcat.db` directly; use `bytes_of` / `contents_of`, and for scripts against a copy use the ignored test `copy_check` (`VOIDCAT_COPY=<dir> cargo test copy_check -- --ignored`, throwaway key, prints counts only).
- Dev builds are ad-hoc signed: after a Rust rebuild macOS asks again for the "library-key" Keychain item (Always Allow). Refusing shows a dialog and quits.
- Timing tests take the fastest of three runs (`fastest` in `privacy.test.ts`); a single run failed at random when the machine was busy.
- **Restart the dev app** after `bun add` (a stale React copy causes "Invalid hook call") and after Rust changes: kill `target/debug/voidcat`, `tauri dev`, and port 1420, then `bun run tauri dev` in the background.
- Run `bun run build:mcp` before `cargo test` or a fresh `tauri dev` if `src-tauri/binaries/` is empty (Tauri checks the sidecar exists). After changing `mcp/server.ts` or `src/lib/mcp.ts`, rebuild it; apps pick it up the next time they start the server.
- Documents store absolute file paths (`documents.stored_path`): any change to the data folder must rewrite them (see `legacy::fix_paths`).
- Rust toolchain lives in `~/.cargo/bin` (prepend it to PATH).
- `useEffect(() => el.scrollIntoView(...))` returns a promise in new browsers and crashes React: always use braces.
- Never `scrollIntoView` inside a scrolled page to highlight text; scroll the container instead (it made the inbox jump).
- Model prompts: don't give concrete example names or addresses; the local model copies them ("Lease Provença 210" incident).
- `keyring` must be v3 with `apple-native` (v4 has a different API).
- The browser preview (`bun run dev`, http://localhost:1420) has no library (`hasLibrary` false); use it only for layout checks (puppeteer scripts in the Claude scratchpad).
- Notes' `sha256` column is `<hex>:<id>` (so notes may share text); compare file contents with `store::content_sha`. Each edited note may have a sealed `<stored_path>.prev` next to it.
- The library DB is real user data: never reset it. Migrations add columns in `store.rs` `migrate()`; new tables use `create table if not exists`.

## Security findings reviewed (13 Oct 2026, MR !1)
- **Zod 4.6.6, CVE-2023-54404 (high):** the advisory covers "through 4.6.5", so 4.6.6 is outside it; the scanner's data lags. Not upgraded to 4.6.7 at first because it was one day old (supply-chain caution); upgraded on 17 Oct 2026 once it was five days old.
- **glib 0.18.5, RUSTSEC-2024-0429 (medium):** comes from Tauri's Linux (GTK) dependencies; the macOS app doesn't build it, and Tauri pins this version. Not applicable.
- **6 × "regular expression with non-literal value" (SAST, medium):** false positives. Three were rewritten as fixed patterns (month names, the guard's copy); the other three build patterns from the user's own values through the standard `RegExp.escape` (ES2025) and keep a `nosemgrep` comment with the reason. The app now needs macOS 15.2+ (Safari 18.2 engine) for `RegExp.escape`.
- **Found while testing (not flagged by the scanner):** the email pattern took quadratic time on long text without an `@` (0.75 s on 40,000 letters). Fixed by starting matches only at word starts and capping the name part at 64 characters; tests now time every pattern on adversarial input.
- **Security scan of MR !4 (17 Oct 2026):** `qs` 6.16.0 (uncaught exception in `stringify`, reached only through the MCP SDK's Express parts, which the stdio server doesn't use) pinned to 6.16.1 with `overrides`; `veil.tsx` placeholder pattern rewritten as a literal; `Viewer.tsx` numeric-cell check is one character class (linear), marked `nosemgrep` with the reason; `glib` 0.18.5 is the Linux-only finding above.
- **Review of MR !5 (18 Oct 2026):** secret detection clean; dependency scanning only `glib` (above). SAST: two `detect-non-literal-fs-filename` findings in `vite.config.ts` (`ortFiles`), false positives (names come from a fixed folder listing; dev/build only), marked `nosemgrep` with the reason. Licenses rechecked: 542 crates and 340 npm packages, all permissive except the MPL-2.0 ones (unmodified) and `sharp`/`@img/sharp-libvips` (LGPL-3.0, optional for Transformers.js in Node, not in the app or the MCP binary). SQLCipher's BSD notice, ONNX Runtime's MIT notice and the fonts' OFL ship in `THIRD-PARTY-NOTICES.md`, bundled with the app (`bundle.resources`).
- **Licenses:** 301 npm packages and 502 crates, all permissive or weak copyleft (MPL-2.0 files used unmodified, OFL fonts, an LGPL option where MIT is also offered). Nothing conflicts with MIT. `src-tauri/Cargo.toml` now declares `license = "MIT"`.
- **Licenses of the notes, signing and library MRs (19 Oct 2026):** the Word export no longer uses the `docx` package, which brought `jszip` (MIT or GPL-3.0), `sax` (BlueOak-1.0.0) and `xml-js`; `lib/exportDocx.ts` writes the .docx itself with `fflate`. New packages left are MIT/ISC/0BSD, plus `pako` (MIT and Zlib, via pdf-lib), `diff` (BSD-3-Clause) and `argparse` (Python-2.0) via MDXEditor, `format` (MIT, declared in the old `licenses` field, so scanners may show it as unknown) and the Caveat font (OFL-1.1). All permissive; nothing conflicts with MIT.

## Security findings reviewed (18 Oct 2026, MR !6)
- `@grpc/grpc-js` 1.9.16 (High: getAuthContext; Low: error messages to clients), pulled in by `@firebase/firestore` for Node only; both are about running a gRPC server, which Voidcat never does, and the browser build doesn't include it. Overridden to ^1.14.5 in `package.json` anyway (1.14.6 installed; tests and build pass).
- `glib` 0.18.5 (Medium, RUSTSEC-2024-0429): Linux GTK dependency of Tauri/wry, only in the Linux CI build; the Mac app doesn't contain it, and Tauri 2 still pins gtk-rs 0.18. Not applicable; dismiss.
- SAST: `detect-non-literal-regexp` in the browser search snippet (rewritten without a built regex) and `timing attack` on `hash === "#cloud"` in `MacCloud.tsx` (a URL anchor, not a secret; renamed). Both false positives, removed.
- MR !7 (18 Oct): SAST `detect-non-literal-fs-filename` on `fs.readdirSync(dir)` in `vite.config.ts` (`vendorFiles`): dir is one of three fixed node_modules folders, build time only; marked nosemgrep like the other build-time reads. Dependency scanning: only the known Linux-only `glib` finding.

## Security review of Voidcat Cloud (18 Oct 2026)
Checked and fine:
- Documents shown in the browser: Markdown without raw HTML (react-markdown, no rehype-raw), `javascript:` links stripped, remote images blocked by CSP; pdf.js (unpdf 1.8.1) has no `new Function` path and neither CSP allows `eval` (CVE-2024-4367 class).
- Web headers: CSP (scripts from self + apis.google.com for the sign-in pop-up; connect only to Firebase, voidcat-api, jsDelivr, Hugging Face), HSTS, nosniff, no-referrer, frame-ancestors none.
- voidcat-api: ID token verified with revocation check, library must exist, CORS to the web app, 60k-character and folder-list limits, 300 reads a month in a transaction, answers validated (`api/read.ts`), facts kept only if found on the page, no text logged, generic errors, max 3 instances.
- Mac sign-in listener: 127.0.0.1 only, 128-bit nonce in every path, 20-minute window, one listener at a time, small bodies, config JSON escaped in the page.
- Keys: browser keys are non-extractable CryptoKeys; the Mac's master key never leaves Rust.
- Deleting: account deletion removes records, files (bucket soft delete off), read count and sign-in; "Forget this browser" and Delete also clear the browser's offline copy.
- Firebase Auth: email enumeration protection on. Rules tested through the Rules API test endpoint (owner allowed; unverified, other users, signed out, usage counter and deleting the library doc refused).

Fixed in this review:
- Rules and API now require a verified email (email link and Google are; a password account made directly against Firebase gets nothing).
- Browser edits carry a sealed one-time number; the Mac applies each once (`cloud_edits_seen`), so a copied edit can't be replayed.
- Forget this browser / Delete my account clear the Firestore IndexedDB cache too.

Accepted for now (with why):
- Anyone with a verified email can sign up and store data, which costs money. Bounded by verified email, 200 MB per file, 300 Gemini reads a month, 3 API instances and the budget alert. Later: Firebase App Check and the 5 GB per-person limit enforced server-side, with billing.
- Someone holding your sign-in session but not your key can delete or move your locked items or replace the check (locking browsers out until the recovery key is retyped against a new library); they can't read or forge anything, and the Mac keeps its full library.
- Firebase's email/password provider stays on because email link needs it; unverified accounts get nothing.
- The Firebase web API key has no referrer restriction (public by design, limited to Firebase APIs).
- The Mac's Google sign-in page loads Firebase from gstatic.com without subresource integrity.
- CSP allows inline styles (React style attributes).
