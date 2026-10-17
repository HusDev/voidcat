# Changelog

Each version's section becomes its GitLab release notes.

## Unreleased

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
