# SafeBox — project notes

Desktop app (Tauri 2) for smart personal document storage: drop files in, they are read locally, filed, and facts are extracted into an approval inbox. Any AI can use the library through masked context (privacy filter + reversible placeholders) or an MCP server. Separate from Hus (Hussein's private app): never copy Hus's personal data here; screens use made-up example data (`src/lib/sample.ts`).

Decisions:
- Desktop first (Tauri 2), data stays on the Mac.
- Models through the Vercel AI SDK with the OpenRouter provider; every request sets `zdr: true` and prompt logging stays off. Users may add their own Anthropic/OpenAI key; Ollama for local.
- UI from the approved mockup: dark rail, grey workspace, amber = private, Instrument Sans + IBM Plex Mono (self-hosted via Fontsource), Headless UI for menus, Lucide icons.
- The repo will be public (MIT) for the GitLab Transcend hackathon.

Map:
- Storage (Rust, `src-tauri/src/store.rs`): SQLite `safebox.db` + `files/` in the app data folder (`~/Library/Application Support/dev.hus.safebox/`). Tables `documents` (sha256 unique = no duplicates, status new/read/filed), `facts` (pending/approved/rejected), FTS5 `pages` (accent-insensitive). Commands in `lib.rs`: `import_files`, `list_documents`, `library_stats`, `open_document`, `remove_document`; TS wrappers in `src/lib/library.ts` (`hasLibrary` false in the browser preview). Drops come from Tauri's `onDragDropEvent` (gives paths); the picker is `@tauri-apps/plugin-dialog`. Rust tests: `cargo test` in `src-tauri`.
- Reading + facts (step 2): `src/lib/pipeline.ts` queues documents → `reader.ts` (unpdf for PDF text; photos and scanned PDF pages read by Apple Vision on-device OCR in `src-tauri/src/ocr.rs` — commands `ocr_document`, `ocr_image` with raw PNG bytes; scanned PDF pages rendered with pdf.js on an OffscreenCanvas at 2×, max 40 pages; text files directly) → `save_reading` into FTS5 `pages` → `extract.ts` files it with a LOCAL model (Ollama `qwen3.5:9b`, JSON-schema output, values copied verbatim so the source page can highlight them) → `save_filing` (title, area, doc_type, pending facts). Inbox = real pending facts with the source page; approve / reject / correct. Library search = FTS5 inside pages (`search`, snippets with [[ ]]). Cloud models only after the privacy filter. CSP allows `http://localhost:11434` only.
- `src/App.tsx` routes (HashRouter): `/` Library, `/inbox` Facts to approve, `/connections` Connected AIs.
- `src/components/Sidebar.tsx`, `Logo.tsx`; `src/routes/*`; `src/lib/sample.ts` example data (Facts to approve, Connected AIs only).
- `src-tauri/` Rust shell; window has an overlay title bar, drag regions use `data-tauri-drag-region` (permission `core:window:allow-start-dragging`).

Not encrypted yet (plan: SQLCipher); don't claim encryption in the UI until it is.

Commands: `bun run tauri dev`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`. Rust via `~/.cargo/bin`.
