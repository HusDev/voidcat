# Voidcat

Smart storage for your life. Drop in any document: Voidcat reads it on your Mac, files it and pulls out the facts. Any AI can use your knowledge, but personal details are masked before anything leaves.

> Early work in progress. The screens use made-up example data.

## Run it

Needs [Bun](https://bun.sh) and [Rust](https://rustup.rs).

```bash
bun install
bun run tauri dev     # the desktop app
bun run dev           # the interface alone, in a browser
```

## Check it

```bash
bun run typecheck
bun run lint
bun run test
```

## Stack

Tauri 2 (Rust: SQLite via rusqlite with FTS5, Apple Vision OCR, macOS Keychain) · React · React Router · Vite · Tailwind CSS v4 · Headless UI · Lucide · Zod · TypeScript · Bun · unpdf · Ollama (local model) · Vercel AI SDK + OpenRouter (zero data retention) · Vitest

See `docs/STATUS.md` for what's built and what's next.

## License

MIT
