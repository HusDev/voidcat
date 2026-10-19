# Changelog

Each version's section becomes its GitLab release notes.

## Unreleased

- Notes: write Markdown or plain-text documents in Voidcat (New document in the Library, New document here on a folder), edit any .md/.txt with Edit, autosave, Restore previous version, export as Word (.docx); Find facts & file runs the local model only when asked; Delete in a note's tab, and an empty Untitled note is removed when closed.
- Ask: a local model that says it made a zip without calling the tool is asked once more, and the answer never claims a zip that wasn't made.
- Privacy: labels like "NIE de la arrendataria" are read as IDs again (the "end" inside "arrendataria" made them dates).
- Calendar: a date with a time in the same value ("12 November 2026 at 10:30") now shows up.
- Me: when the model doesn't name the owner, the name approved in the most documents is used, so the owner leaves Contacts.

## 0.1.0

First version, built for the GitLab Transcend Hackathon.

- Library: drop in PDFs, photos and scans; they are read on the Mac (Apple Vision OCR, local model through Ollama), filed into folders and searchable inside their pages.
- Facts to approve: dates, IDs, amounts and addresses pulled from each document, with the source page highlighted.
- Privacy layer: names, IDs, addresses, emails and phone numbers become placeholders before anything reaches a cloud model; every cloud request requires zero data retention.
- Ask: questions about your documents, with the exact text that will be sent shown first.
- Calendar: expiries, appointments, renewals and monthly payments, with Mac notifications and `.ics` export.
- Opportunities: benefits and deadlines that may apply to you, found from masked facts.
- Contacts and Me: the people in your documents, and a profile of you built from approved facts.
- MCP server: Claude Desktop, Cursor and Claude Code can use the library, masked, with per-app access levels.
- Tabs: every screen and every document opens in a tab, like a code editor; documents are shown inside the app (PDF, images, text, Markdown, spreadsheets, Word).
- Reading: Excel, Numbers-exported and OpenDocument spreadsheets, CSV and Word (.docx) files.
- Reviewing facts beside the document: each value marked on its page, with approve, edit and reject next to it.
- Folders: a Finder-like tree; drag documents and folders, rename, move, and re-file with the local model; download a folder as a zip.
- Ask: local models through Ollama or cloud models through OpenRouter in one dropdown, saved chat history, @ mentions to limit the context to documents, folders or areas, and zips of matching documents on request.
- Side chats: ask about one open document, or about yourself from the Me page (a CV, a short bio, form answers).
- Labels: expired, ended, duplicate, unsigned, incomplete and not useful, checked strictly, with duplicate copies grouped.
- Look: a white line cat with gold eyes, black-and-white actions, light and dark themes.
- Pipeline: verify, secure, govern (privacy guard), package and release stages.
- Voidcat Cloud (optional, end-to-end encrypted): open your library in any browser. Everything is locked on your device before upload; Google Cloud (Firestore, Cloud Storage, in Belgium) only stores locked bytes. Sign in with an email link or Google; the recovery key opens the library. Live at https://voidcat-web-1094942921673.europe-west1.run.app (!6).
- Mac sync: connect the Mac in Settings → Voidcat Cloud, choose per document whether it's in the cloud or only on the Mac, with marks on every file and a sync status in the sidebar (!6).
- Browser library: folders, documents, search and fact review in the browser; drop in files; changes reach the Mac (!6).
- Read now: a file added in the browser is read and masked in the browser (OCR included), and only masked text goes to Gemini in Belgium to file it; the Mac re-reads scans with Apple Vision (!7, !10).
- Ask in the browser: Gemini answers from masked context, unmasked in the browser (!10).
- Your data: Export everything and Delete my account in the browser, plain-words Privacy Policy and Terms, and the browser locks after 30 minutes away (!8).
- Security: only verified emails reach cloud data, browser edits can't be replayed, `SECURITY.md` (!9).
- Pipeline: a deploy stage ships the web app and API to Cloud Run on every merge to `main`, through Workload Identity Federation (no stored keys).
- Website: voidcat.io, with Download for Mac (Apple silicon, not yet signed by Apple) and Voidcat Cloud at app.voidcat.io.
- Logo: the box cat, a closed box with ears and watchful gold eyes, in the app, its icons and the website.
- Masking: a fact whose label has accents ("Válida hasta") or no date word is still masked as a date when its value is one, so the AI gets "about 4 months from now" and can answer how long is left.

