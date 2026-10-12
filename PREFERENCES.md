# SafeBox — Hussein's decisions

Every product, design and working decision Hussein made, with the date. When he makes or changes a decision, edit the line here in place and add an entry to the change log at the bottom, in the same turn.

## Product
- **What it is:** smart storage for your life's documents. Drop anything in; it's read on your Mac, filed, and its facts extracted. Any AI can use that knowledge without seeing your private data.
- **Name:** "SafeBox" for now; a final name later. Other apps already use SafeBox (vaults, a Spanish signing tool), so pick a distinct name before launch. Considered: SafeDrop (taken by a secure file-sharing service), SafeX (antivirus apps), SafeXY (unclear to say), DocDrop (least taken), LifeBox (taken by a backup app). He likes "Safe + word" names.
- **Tagline (200 characters):** "SafeBox is smart storage for your life: drop in any document, it organises it and extracts the facts, and any AI can use your knowledge without ever seeing your private data."
- **Target users first:** people whose paperwork spans countries (immigrants, expats, international workers); later everyone.
- **A separate project from Hus:** Hus stays his private second brain; SafeBox is the product. No Hus personal data in SafeBox's repo.
- **Any AI can connect:** like opencode's many connectors. Models go in through OpenRouter, and other apps come in through an MCP server (planned).
- **Amounts stay visible to the AI** ("amounts are kept"), including approved facts such as rent or a deposit, so it can reason about money.
- **Privacy is the core promise:** the library stays on the Mac; personal details are masked before any AI sees them; OpenAI's privacy-filter model is planned on top of the rules.

## Platform and stack
- **A desktop app,** not a web app (Tauri 2), so "stored on this Mac" is true. A phone version comes later, through the Mac or encrypted sync.
- **Stack:** his hus-stack (TypeScript, Bun, Vite, React, React Router, Tailwind v4, Zod, oxlint, Vitest), with **Headless UI** for components (his choice over Base UI) and Lucide icons.
- **Cloud models through OpenRouter** (his choice over the Vercel AI SDK alone, after checking the research). Every request uses zero data retention and no data collection. One key for all models, stored in the macOS Keychain. His own Anthropic/OpenAI keys are an advanced option.
- **Default cloud model: Claude Sonnet 5.5** (he asked Claude to choose). `:batch` models are hidden.
- **Local model (Ollama, qwen3.5:9b)** does reading, filing and fact extraction, so documents never go to the cloud before masking.
- **OCR:** Apple's on-device text recognition (Spanish, English, Arabic).

## Screens and behaviour
- **Brand direction (being explored, not decided):** he likes the "Voidcat" moodboard, the line-art cat head on the shirt and the faceted purple cat logo. Colours: Void Purple #8B5CF6, Deep Space #0B0B0F, Moon Gray #A1A1AA, Starlight #F5F5F7; from the faceted logo, Night Indigo #191547, Deep Violet #3C20B1, Bright Violet #8B5BEF, Eye Lilac #EEE6FE; shirt line #7F68C0. The app still uses amber for private details.
- **Design first:** the screens live on the design canvas (https://claude.ai/artifact/97fHrNDyKQs6Q6DQ7cmB1Z), the reference for building. He liked the first mockup's look: dark sidebar, grey workspace, amber for anything private.
- **Library:** drag and drop, search inside documents, document cards with their folder and key facts, open, move, remove (with a "remove for good" confirmation).
- **Folders:**
  - two levels, Area › Folder;
  - **file automatically when SafeBox is confident and the folder exists**, and ask for new or doubtful folders;
  - a suggested new folder can be **renamed** before "Create and file";
  - specific folder names must come from the document itself.
- **Facts to approve:** nothing becomes a fact until approved. The source page shows beside it, **sticky** while scrolling. Markdown documents render as formatted pages.
- **Ask:**
  - a conversation (redesigned at his request), with example questions, follow-ups and the input pinned at the bottom;
  - shows **what will be sent** and asks to review only when something private would leave; every answer keeps "What was sent" and its sources.
- **Hide private details** (his idea, for screen recording): one switch, ⌘⇧H, that shows the AI's placeholders instead of real values everywhere and blurs source pages. Short forms of an address ("Llull 390") must be hidden too.
- **Calendar** (his idea):
  - every deadline and date becomes a reminder, including appointments such as the empadronamiento, with a "papers to bring" checklist;
  - dates are worked out too: renewal 60 days before expiry, monthly rent days;
  - Mac notifications and export to Apple/Google Calendar.
- **Other apps through MCP** (built): Claude Desktop, Cursor and Claude Code can use the library, always masked. Each app starts with **masked facts and dates only**; searching and reading pages must be allowed per app in Connected AIs, and any app can be turned off. SafeBox adds itself to Claude Desktop or Cursor with one click. ChatGPT is left out for now because it only connects to internet servers and the library stays on the Mac.
- **Opportunities tab** (his idea, from Hus): advantages and opportunities based on your situation, with Keep / Add to calendar / Done / Dismiss. Built as phase 3: the scan sends only masked facts and document names, shows what will be sent first, and web checking is optional and off by default because it falls outside zero data retention. Dismissed ideas never come back.

## Working with him
- **Short answers;** challenge with evidence rather than folding.
- **Plan, then build one phase at a time.** After each step: checks, commit, **push**, restart the app so he can try it.
- **Record every decision** in this file, with the date.
- **GitLab:** repo at gitlab.com/hus.dev/safebox, private for now; public + MIT for the GitLab Transcend hackathon. The hackathon judges DevSecOps automation, so a lifecycle-automation angle is still to be added.

## Change log
- 12 Oct 2026 — Idea: smart storage that any AI can use, with a privacy filter and a library of facts; a new project separate from Hus.
- 12 Oct 2026 — Desktop app (Tauri) chosen over a web app.
- 12 Oct 2026 — Working name SafeBox; tagline written; final name to be decided later.
- 12 Oct 2026 — Headless UI chosen over Base UI (also changed in his hus-stack skill).
- 12 Oct 2026 — OpenRouter chosen for cloud models, with ZDR forced on every request; default Claude Sonnet 5.5; batch models hidden.
- 12 Oct 2026 — Local Ollama model for reading and filing; Apple Vision OCR for photos and scans.
- 12 Oct 2026 — Markdown documents shown as formatted pages.
- 12 Oct 2026 — Ask redesigned as a conversation; review only when private details would be sent.
- 12 Oct 2026 — "Hide private details" switch (⌘⇧H) for screen recording.
- 12 Oct 2026 — Facts to approve: source card sticky; no page jumping.
- 12 Oct 2026 — Folders: two levels, auto-file when confident; rename a suggested folder before creating it; folder names only from the document.
- 12 Oct 2026 — Address short forms are masked too.
- 12 Oct 2026 — Calendar with reminders, worked-out dates and papers checklists; Opportunities tab planned as phase 3.
- 12 Oct 2026 — Decisions recorded in this file from now on.
- 12 Oct 2026 — Phase 3 Opportunities built (started at his request); web checking optional, off by default. Approved amounts are no longer hidden, to match "amounts are kept".
- 12 Oct 2026 — MCP server built (he said "go for it"); new apps start with masked facts and dates only; ChatGPT not supported yet. Recurring date rules ("del 1 al 5 de cada mes") are no longer hidden as dates.
- 12 Oct 2026 — Brand exploration: likes the Voidcat moodboard, the shirt's line cat logo and the faceted purple cat; colours extracted (not adopted yet).
