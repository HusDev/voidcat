# Voidcat

[![pipeline status](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/8599176/showcase/badges/main/pipeline.svg)](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/8599176/showcase/-/pipelines)
[![License: MIT](https://img.shields.io/badge/license-MIT-f5b83d.svg)](LICENSE)

![Voidcat](docs/cover.png)

Smart storage for your life. Drop in any document: Voidcat reads it on your Mac, files it and pulls out the facts. Any AI can use your knowledge, but personal details are masked before anything leaves.

Built for the GitLab Transcend Hackathon (October 2026).

## What it does

- **Encrypted on your Mac.** The library database (SQLCipher) and every stored document (AES-256-GCM) are encrypted with a key kept in the macOS Keychain.
- **Reads documents on your Mac.** PDFs, photos, scans, spreadsheets and Word files are read locally (Apple Vision OCR and a local model through Ollama). Nothing is uploaded to do this.
- **Files them.** Each document gets a title, an area and a folder; you confirm when it isn't sure.
- **Pulls out facts for you to approve.** Dates, ID numbers, amounts and addresses go to an inbox with the source page highlighted.
- **Calendar and reminders.** Expiry dates, appointments, renewals and monthly payments from the facts you approved, with Mac notifications and `.ics` export.
- **Ask any AI, safely.** Questions go to a cloud model only after a privacy filter swaps names, IDs and addresses for placeholders like `[PERSON_1]`; the answer is put back together on your Mac. Zero data retention is required on every request.
- **Everything in tabs.** Screens and documents open in tabs inside the app; facts are marked on the page, with approve and reject beside it.
- **Local or cloud models.** Pick an Ollama model on your Mac (nothing leaves) or a cloud model (masked), keep a chat history, and type @ to ask about one document, folder or area. Ask for "my rental papers as a zip" and it gathers them.
- **Labels.** Expired, ended, duplicate, unsigned, incomplete and not useful documents are flagged, and copies of the same document are grouped.
- **Encrypted on your Mac.** The library database (SQLCipher) and every stored document (AES-256-GCM) are encrypted with a key kept in the macOS Keychain.
- **Catches names the rules miss.** Optionally, OpenAI's privacy-filter model runs on your Mac and masks extra names and addresses before anything goes to a cloud model.
- **MCP server.** While Voidcat is open (it stays in the menu bar), Claude Desktop, Cursor or Claude Code can use your library through MCP, with per-app access levels and the same masking.
- **Contacts and Me.** People and organisations found in your documents, and a profile of you built from approved facts, each value linked to its source.
- **Opportunities.** Benefits, deadlines and savings that apply to you, found from your masked facts.

## Why

Your important papers (residence permits, leases, payslips, tax forms) are scattered across folders and email. AI assistants could help, but uploading these documents means handing over your most private data. Voidcat keeps the documents and the reading on your machine and only ever shares masked facts.

## Requirements

- macOS (Apple Silicon recommended)
- [Bun](https://bun.sh) 1.3+ and [Rust](https://rustup.rs)
- [Ollama](https://ollama.com) with the local model: `ollama pull qwen3.5:9b`
- Optional: an [OpenRouter](https://openrouter.ai) key for cloud models (stored in the macOS Keychain)

## Install and run

```bash
bun install
bun run build:mcp     # builds the MCP server the app ships with
bun run tauri dev     # the desktop app
bun run dev           # the interface alone, in a browser (no library)
```

## Usage

1. Drop documents onto the Library, or use **Choose files**.
2. Approve or correct the facts in **Facts to approve**.
3. Open **Ask** to question your library; you see exactly what will be sent before it goes.
4. In **Connected AIs**, add Voidcat to Claude Desktop or Cursor, or copy the Claude Code command.
5. Press ⌘⇧H anywhere to hide private details on screen.

## Checks

```bash
bun run typecheck
bun run lint
bun run test                       # TypeScript tests
cd src-tauri && cargo test         # Rust tests (run build:mcp first)
```

The GitLab pipeline runs typecheck, lint, tests and build on every push and merge request.

## GitLab automation

Supervised autonomy: agents do the steps, a person approves the outcomes (assigning an issue, merging, tagging).

| Stage | What runs |
|---|---|
| plan | **Triage** flow labels new issues and comments a plan |
| create | GitLab's **Developer** flow turns an approved issue into a merge request |
| verify | `verify` and `rust-test` jobs; **Pipeline Doctor** flow explains failures and pushes small fixes |
| secure | SAST, secret detection and dependency scanning |
| govern | `privacy-guard` job blocks personal data; **Privacy Guard** flow reviews masking and privacy rules |
| package | `mcp-server` job builds the MCP server for Apple silicon and Intel Macs |
| release | **Release** flow prepares the changelog merge request; on a `v*` tag the pipeline publishes packages and a GitLab release |
| configure | Agent runtime, review rules and flow sources versioned in `.gitlab/duo/` |
| monitor | **Health Reporter** flow posts each `main` pipeline's numbers to a "Pipeline health" issue |

Flow sources are in `.gitlab/duo/flows/`; the rules agents follow are in `AGENTS.md`.

## Stack

Tauri 2 (Rust: SQLite via rusqlite with FTS5, Apple Vision OCR, macOS Keychain) · React · React Router · Vite · Tailwind CSS v4 · Headless UI · Lucide · Zod · TypeScript · Bun · unpdf · Ollama · Vercel AI SDK + OpenRouter (zero data retention) · MCP SDK · Vitest

## Roadmap

- Get the local model from inside Voidcat (Ollama still installed separately)
- A browser demo with invented documents

See `docs/STATUS.md` for what's built and what's next.

## Support

Open an issue in this project.

## Contributing

Issues and merge requests are welcome. Run the checks above before opening a merge request. Use invented data in tests and examples, never real personal details.

## Author

Hussein Hasan ([@hus.dev](https://gitlab.com/hus.dev)).

## License

[MIT](LICENSE). Open-source parts that ship with the app, and their licenses: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Project status

Early and under active development during the hackathon. The screens use made-up example data.
