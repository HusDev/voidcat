# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (the landing page and Voidcat Cloud); the main product is a macOS desktop app (Tauri 2).

## Users

People whose paperwork spans countries: immigrants, expats and international workers who keep residence permits, leases, payslips, tax forms and appointment letters scattered across email, Downloads and phone photos. Their job: find a fact fast ("when does my card expire?"), never miss a renewal or appointment, gather the right papers for a form, and get help from AI without handing over their passport number, address or salary. Later: everyone with a life's worth of documents. Hackathon judges evaluate it as a real product.

## Product Purpose

Smart storage for your life's documents. Drop anything in; it is read on your Mac, filed into folders, and its facts (dates, ID numbers, amounts, addresses) go to an inbox for you to approve, each marked on its page. Any AI can then help with your paperwork, but it only ever sees masked text: names, IDs and addresses become placeholders like `[PERSON_1]`, and the real values are put back on your device. Success: a person trusts Voidcat with their most private papers and gets real answers from AI about them.

## Positioning

The AI never sees you. Reading happens on the user's own device, every copy is encrypted (on the Mac and end-to-end in the cloud), and the exact masked text is shown before anything is sent. Any assistant can be used (local Ollama, OpenRouter models, Gemini in Voidcat Cloud, Claude Desktop or Cursor through MCP) without giving it the real values.

## Operating Context

- Mac app: drag-and-drop or Choose files; Apple Vision OCR and a local model (Ollama, qwen3.5:9b) read and file; works offline.
- Voidcat Cloud (optional, https://app.voidcat.io): the same library in any browser, end-to-end encrypted, unlocked with a recovery key; Read now and Ask run through Gemini 2.5 Flash in Belgium on masked text only.
- Paper types in play: residence cards (TIE/NIE), rental contracts, payslips, tax returns, appointment letters, legalizations; Spanish, English and Arabic documents.

## Capabilities and Constraints

- Encrypted library: SQLCipher database + AES-256-GCM files, key in the macOS Keychain, 13-group recovery key.
- Facts to approve, calendar and reminders (expiries, renewals 60 days ahead, appointments, monthly payments, .ics export), labels (expired, duplicate, unsigned…), contacts and a "Me" profile, MCP server with per-app access levels, Hide private details (⌘⇧H).
- Cloud: per-document sync choice, browser library, Read now (browser OCR + masking), Ask in the browser, export everything, delete account, 30-minute idle lock; 300 cloud reads and 1,000 questions a month.
- Mac download: an unsigned .dmg for Apple silicon (macOS 15.2+), hosted on voidcat.io; macOS calls it "damaged" on first open, so the site gives a one-time Terminal line (`xattr -dr com.apple.quarantine /Applications/Voidcat.app`) until Developer ID signing. No Developer ID signing or notarization yet. Local reading needs Ollama, which the app sets up.
- Pricing (decided 18 Oct 2026): the Mac app is free and open source (MIT); Voidcat Cloud is free while in beta. No prices shown until payments are live.

## Brand Commitments

- Name: Voidcat.
- The box cat: a closed white box with ears and two slanted, watchful gold eyes (`src/components/Logo.tsx`, `src-tauri/icons/voidcat-icon.svg`). Everything else on the landing page (colours, type, layout) is open for redesign (his decision, 18 Oct 2026).
- Voice: plain words, short sentences, no jargon, no hype; say "masked", "locked", "on your Mac".

## Evidence on Hand

- Live product: https://app.voidcat.io; source (MIT) on GitLab.
- Invented demo documents in `demo/documents/` (Lena Ortiz Brandt, NIE X1234567L, valid until 01/02/2027) and real app screenshots of them.
- Measured: local filing 24 s per document on an M5; ≈ 0.06 g CO₂e per document (SCI, `docs/SUSTAINABILITY.md`); 7.5 CI runner-hours for the whole hackathon.
- Absent, never to be invented: testimonials, user counts, customers, press, ratings, benchmarks against competitors, prices.

## Product Principles

1. Private by design, not by promise: show the masked text, don't ask for trust.
2. Local first: the user's own device does the reading; the cloud is optional.
3. The user approves; nothing counts until they say so.
4. Plain words for people under paperwork stress.

## Accessibility & Inclusion

Users read in a second language and may be stressed by deadlines: plain English, high contrast, keyboard and screen-reader friendly, works on phones.
