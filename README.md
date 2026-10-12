# SafeBox

Smart storage for your life. Drop in any document: SafeBox reads it on your Mac, files it and pulls out the facts. Any AI can use your knowledge, but personal details are masked before anything leaves.

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

Tauri 2 · React · React Router · Vite · Tailwind CSS v4 · Headless UI · Lucide · Zod · TypeScript · Bun

Planned: SQLite (FTS5 + sqlite-vec) with Drizzle, unpdf and Tesseract.js for reading documents, Transformers.js with OpenAI's privacy-filter for masking, the Vercel AI SDK with OpenRouter (zero data retention) for any model, Ollama for a local model, and an MCP server so other AI apps can connect.

## License

MIT
