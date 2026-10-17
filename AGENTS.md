# Voidcat for agents

Voidcat is a macOS desktop app (Tauri 2 + React) that stores personal documents, reads them on the Mac, and lets any AI use them only through masked context. The code map is in `CLAUDE.md`; what's built and next is in `docs/STATUS.md`.

## Rules
- **No real personal data**, ever: code, tests, comments, prompts, docs, commit messages. Invent names, addresses, ID numbers, IBANs and amounts. New invented values that look like IDs or emails go in `.privacy-allow`, or the privacy guard fails the pipeline.
- Text that can reach a cloud model goes through the `Masker` (`src/lib/privacy.ts`). Every OpenRouter model sets `provider: { zdr: true, data_collection: "deny" }`.
- The library is encrypted (SQLCipher database, AES-256-GCM files, key in the Keychain). Never read stored files directly or add a code path that writes them unencrypted.
- Personal values shown in the UI are wrapped in `<Private>` (`src/lib/veil.tsx`).
- Style: match the surrounding code; Tailwind theme tokens from `src/index.css`; short plain copy.

## Checks (run before committing)
```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run privacy      # privacy guard on the last commit
```
Rust (`src-tauri/`) needs Tauri's system packages; CI runs `cargo test` in the `rust-test` job.

## Merge requests
- One change per MR, with a short description of what and why.
- Link the issue (`Closes #N`).
- Add a line under `## Unreleased` in `CHANGELOG.md` for user-visible changes.
