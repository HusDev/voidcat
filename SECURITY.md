# Security

Found a security problem in Voidcat or Voidcat Cloud? Please write to husdev@proton.me instead of opening a public
issue. Say what you found and how to reproduce it; you'll get an answer within a few days.

## How Voidcat protects your papers

- **On the Mac:** the library database is encrypted with SQLCipher and every stored file with AES-256-GCM. The key is
  in the macOS Keychain; a recovery key (52 letters and digits) is the only other way in.
- **Voidcat Cloud is end-to-end encrypted:** every record and file is locked on your device before upload, with keys
  derived from that same master key. Google Cloud (Firestore, Cloud Storage, in Belgium) stores only locked bytes.
  Signing in proves who you are; it never unlocks anything.
- **Read now in the cloud:** text is read and masked in your browser; only masked text reaches Gemini through
  voidcat-api, which checks your sign-in and a monthly limit and logs no text.
- **Access rules:** each person reaches only their own locked records and files, and only with a verified email
  (`firestore.rules`, `storage.rules`).
- **Deploys:** Voidcat Cloud is not deployed from CI for now. When it was, deploys used Workload Identity Federation
  (no stored keys).

The latest review and the risks we accept are in `docs/STATUS.md` ("Security review of Voidcat Cloud").
