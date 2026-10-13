# Changelog

Each version's section becomes its GitLab release notes.

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
- Pipeline: verify, secure, govern (privacy guard), package and release stages.
