# Voidcat

[![pipeline status](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/8599176/showcase/badges/main/pipeline.svg)](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/8599176/showcase/-/pipelines)
[![License: MIT](https://img.shields.io/badge/license-MIT-8b5cf6.svg)](LICENSE)

![Voidcat](docs/cover.png)

Smart storage for your life. Drop in any document: Voidcat reads it on your Mac, files it and pulls out the facts. Any AI can use your knowledge, but personal details are masked before anything leaves.

Built for the GitLab Transcend Hackathon (October 2026).

## What it does

- **Reads documents on your Mac.** PDFs, photos and scans are read locally (Apple Vision OCR and a local model through Ollama). Nothing is uploaded to do this.
- **Files them.** Each document gets a title, an area and a folder; you confirm when it isn't sure.
- **Pulls out facts for you to approve.** Dates, ID numbers, amounts and addresses go to an inbox with the source page highlighted.
- **Calendar and reminders.** Expiry dates, appointments, renewals and monthly payments from the facts you approved, with Mac notifications and `.ics` export.
- **Ask any AI, safely.** Questions go to a cloud model only after a privacy filter swaps names, IDs and addresses for placeholders like `[PERSON_1]`; the answer is put back together on your Mac. Zero data retention is required on every request.
- **MCP server.** Claude Desktop, Cursor or Claude Code can use your library through MCP, with per-app access levels and the same masking.
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

Work in progress for the hackathon: GitLab Duo agents and flows across the lifecycle (plan, create, verify, secure, package, release, configure, monitor, govern), including a privacy guard that checks every merge request for real personal data. This section will list each agent and flow as it lands.

## Stack

Tauri 2 (Rust: SQLite via rusqlite with FTS5, Apple Vision OCR, macOS Keychain) · React · React Router · Vite · Tailwind CSS v4 · Headless UI · Lucide · Zod · TypeScript · Bun · unpdf · Ollama · Vercel AI SDK + OpenRouter (zero data retention) · MCP SDK · Vitest

## Roadmap

- A local privacy-filter model to catch names the rules miss
- Encrypt the library at rest (SQLCipher). Until then the library is **not** encrypted.
- Background reminders when the app is closed

See `docs/STATUS.md` for what's built and what's next.

## Support

Open an issue in this project.

## Contributing

Issues and merge requests are welcome. Run the checks above before opening a merge request. Use invented data in tests and examples, never real personal details.

## Author

Hussein Hasan ([@hus.dev](https://gitlab.com/hus.dev)).

## License

[MIT](LICENSE)

## Project status

Early and under active development during the hackathon. The screens use made-up example data.
