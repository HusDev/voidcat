# Voidcat guide

Voidcat keeps your important papers (passports, residence cards, leases, payslips, contracts) on your Mac. It reads them, files them into folders, pulls out the key facts for you to approve, and lets AI help you with them without seeing your private details.

Your **library** means all your documents in Voidcat and everything Voidcat learned from them. Links like [Library](#/) open that screen in Voidcat.

## Adding documents
- Drag files onto the [Library](#/), or click **Choose files**.
- Voidcat reads PDFs, photos and scans (it reads the text in pictures on your Mac), Word (.docx), Excel and other spreadsheets (.xlsx, .xls, .ods, .csv), text and Markdown.
- The same file twice is added once.
- Reading and filing happen on your Mac with the local model. Nothing is uploaded to do this.

## Writing your own documents
- Click **New document** on the [Library](#/) to write a note right in Voidcat. The arrow next to it makes **Plain text** instead of **Markdown** (headings, lists, bold, tables). Inside a folder's view, or with right-click on a folder in the sidebar → **New document here**, the note goes straight into that folder.
- Type its name first, then write. It saves by itself a moment after you stop typing; ⌘S saves at once. "Saved" shows under the name.
- Any Markdown or text document can be changed: open it and click **Edit**, then **Done**. Photos, PDFs and Word files can't be edited.
- What you write is searchable at once. To file it and find facts in it, click **Find facts & file** (a dot on it means the text changed since it last ran). The local model never reads your notes on its own.
- **Delete** in a note's tab removes it for good (it asks once). A note you close while it's still empty and called "Untitled" is removed by itself.
- **Restore previous version** puts back the text from before your last edits; click it again to undo that.
- **Export** saves a copy as a Word document (.docx) or as the Markdown or text file itself.
- While **Hide private details** is on, notes are blurred and can't be edited.
- In a browser, notes can be read but are edited on your Mac.

## Folders
- Documents are filed as **Area › Folder**, for example Home › Lease or Identity › Passport.
- If Voidcat isn't sure where a document goes, it waits in the **to file** strip at the top of the [Library](#/) with a suggestion: File here, Create and file, or pick another folder.
- The sidebar shows your folders like Finder. Drag a document onto a folder to move it. Drag a folder onto an area to move the whole folder.
- **Rename**: hover a folder or document (in the sidebar or on its card) and click the **pencil**; the name becomes a field right there. Enter saves, Esc cancels. An open folder has a pencil next to its title. Double-click or right-click → Rename work too.
- **Re-file** on a document card asks the local model again where it belongs.
- A folder's view has **Download zip** to save all its documents at once.

## Facts to approve
- Voidcat pulls facts out of each document: dates, ID numbers, amounts, names, addresses.
- They wait in [Facts to approve](#/inbox) until you approve, correct or reject them.
- Open a document to review its facts beside the page: each value is marked where it was found.
- Only approved facts are used by the calendar, your profile and the AI.

## Opening a document
- Click a document to open it in a tab, like a code editor. Every screen gets its own tab too. Close a tab with ⌘W.
- PDFs, pictures, text, spreadsheets and Word files show inside Voidcat.
- **Open in default app** opens it in Preview, Excel and so on, using a temporary copy that is removed the next time Voidcat starts.
- In a document's tab, switch from **Facts** to **Ask** to ask questions about that document only.

## Labels
- Voidcat marks documents that are **expired**, **ended**, **duplicate** (the same document twice), **unsigned** (it asks for a signature that isn't there), **incomplete** (pages missing) or **not useful**.
- Duplicates are grouped in the [Library](#/): remove a copy, or say they're different.
- Add your own label with **+ Label** on a document's tab. Remove a label you disagree with; it won't come back.

## Ask
- [Ask](#/ask) answers questions about your documents, for example "When does my residence card expire?".
- Pick the model in the chat box, under where you type: a model on your Mac (nothing leaves the computer) or a cloud model. The same menu is in the chat beside a document.
- **Think first** (next to the model) lets the model reason before answering: better for hard questions, slower to start. Its reasoning shows in a box you can open.
- With a cloud model, your private details are swapped for placeholders like [PERSON_1] first, and you see exactly what will be sent before it goes.
- Type **@** to choose what to ask about: one document, a folder, an area, or **@all** for everything. No choice means everything.
- Type **@help** to ask about using Voidcat itself. Only this guide is sent, never your documents.
- Ask for files, for example "give me my rental papers as a zip": Voidcat proposes the documents and saves the zip only when you click **Save zip**.
- Every conversation is saved on this Mac in the chat history. Open one to carry on, or delete it.
- Answers can be wrong. Check the sources under each answer.

## Me and Contacts
- [Me](#/me) builds a profile of you from your approved facts: identity, residency, home, work and money, with where each value came from.
- On [Me](#/me), **Ask about me** can write a CV, a short bio or form answers from your profile.
- [Contacts](#/contacts) lists the people and organisations in your documents that you can reach (with an email or phone number). Edit a contact, hide it, or mark yourself with **This is me**.

## Calendar and reminders
- The [Calendar](#/calendar) shows expiry dates, appointments, deadlines and monthly payments from your approved facts.
- Voidcat adds renewal reminders 60 days before an ID or permit expires.
- Reminders arrive as Mac notifications. Closing the window keeps Voidcat in the menu bar (the cat icon), so reminders still arrive. Quit from that icon or with ⌘Q.
- In [Settings](#/settings), **Open Voidcat when you log in** keeps reminders working after a restart.
- Export the calendar as an .ics file for Apple Calendar or Google Calendar.

## Opportunities
- [Opportunities](#/opportunities) looks for benefits, deadlines and savings that may apply to you, using a cloud model and your approved facts (masked).
- You see what will be sent and the cost before it runs. Keep, add to the calendar, mark done or dismiss each idea.

## Privacy
- **Hide private details** (the eye at the bottom of the sidebar, or ⌘⇧H) shows placeholders instead of your details everywhere on screen, for screen sharing or recording.
- **Catch names the rules miss** ([Settings](#/settings)) runs a privacy model on your Mac before anything goes to a cloud model, to hide names and addresses the rules miss. It's a one-time download of about 917 MB.
- Cloud requests always ask the provider not to keep or train on your data.

## Encryption and your data
- Your library is encrypted on your Mac: the documents and everything Voidcat learned from them. The key is kept in your Mac's Keychain.
- If your Mac asks whether Voidcat may use your Keychain, choose **Always Allow**.
- Anyone who copies the Voidcat folder sees only unreadable data.
- **Save your recovery key**: [Settings](#/settings) → Your data → Recovery key → Show. Write it down or keep it in a password manager. On a new Mac, or if the Keychain is reset, Voidcat asks for it once and your library opens again.
- If both the recovery key and the Keychain are lost, the documents can't be recovered.
- **Export everything** ([Settings](#/settings) → Your data) saves all your documents as one zip, sorted into their folders. That zip isn't encrypted, so keep it somewhere safe.

## New Mac, or Voidcat asks for a recovery key
1. On the new Mac, bring your old Mac's files over with **Migration Assistant**, or restore from **Time Machine**. This copies your Voidcat library too, still encrypted.
2. Install Voidcat and open it.
3. If the new Mac doesn't have your Keychain, Voidcat shows **Unlock your library**. Type the recovery key you saved from [Settings](#/settings) → Your data, and click **Unlock**. Dashes, spaces and small letters don't matter.
4. Voidcat checks the key, keeps it in the new Mac's Keychain and restarts with your library. It won't ask again.
- A wrong key changes nothing: check each group of four and try again.
- Without the old library folder there is nothing to unlock: restore it first, or start again from an **Export everything** zip by dragging its files into the [Library](#/).

## Other AI apps
- Claude Desktop, Cursor and Claude Code can use your library through [Connected AIs](#/connections). Every answer they get is masked.
- Each app has an access level, set in [Connected AIs](#/connections): **off**, **facts and dates** (approved facts and the calendar, the default), or **search pages** (it can also search and read the text of your documents' pages). Names, ID numbers, addresses and other private details are always masked, like [PERSON_1].
- No app ever gets the original files.
- They can only ask while Voidcat is open (it stays in the menu bar).

## Models
- The local model reads, files and answers on your Mac. It doesn't come inside Voidcat, but Voidcat sets it up for you in [Connected AIs](#/connections) → Local model, in three steps, no Terminal:
  1. **Download Ollama**, the free app that runs the model: open the file and drag Ollama to Applications.
  2. **Open Ollama**. It stays in the menu bar.
  3. **Download the model** (about 7 GB, once), with a progress bar. Keep Voidcat open until it finishes.
- Until it's set up, the [Library](#/) shows a "Set up the local model" banner.
- **Choose the reading model** in [Connected AIs](#/connections) → Local model: qwen3.5:2b (lighter, for 8 GB Macs, less accurate), qwen3.5:9b (recommended) or qwen3.5:27b (most accurate, for 32 GB or more). The card says which ones are too big for this Mac. Choosing one that isn't installed downloads it first. Documents already read stay as they are.
- For **chat**, the model menu in the chat box in [Ask](#/ask) lists every model installed in Ollama, plus your cloud model.
- Cloud models need an OpenRouter key, added in [Connected AIs](#/connections). The key is kept in your Keychain.

## Voidcat Cloud
- Voidcat Cloud lets you open your library in a browser. Connect this Mac in [Settings](#/settings) → Voidcat Cloud: type your email and click **Email me a sign-in link** (open the link on this Mac), or click **Sign in with Google**. Both open your browser and hand you back to Voidcat.
- Everything is locked on your Mac before it leaves; the cloud only keeps locked copies. Your Mac's recovery key opens the cloud library too.
- Once connected, the bottom of the sidebar says **Voidcat Cloud** and when it last synced. Click it to go to Settings.
- Each document shows where it is: a grey cloud with a tick means **In the cloud**, an arrow means it's uploading, a red cloud means it **Couldn't upload** (click **Try again** on its card). Documents you keep **Only on this Mac** have no mark in the sidebar.
- To keep one document only on this Mac, turn off **In the cloud** in its tab, use the cloud button on its card in the [Library](#/), or right-click it in the sidebar and untick **Keep in the cloud**. Its cloud copy is deleted; nothing changes on the Mac.
- **New documents go to the cloud** (Settings → Voidcat Cloud) decides what happens to documents you add later.
- **Disconnect this Mac** stops syncing and keeps the cloud copy for your browsers. **Delete the cloud copy** removes every locked copy from the cloud.
- In a browser, sign in at Voidcat Cloud and type your recovery key once. You see your Library, folders and documents, can open them, approve or correct facts, rename and move documents, and drop in new files. New files are locked in the browser first; your Mac fetches them, reads them and files them the next time Voidcat runs there. Changes you make in the browser reach your Mac the same way.
- A file added in a browser waits for your Mac, or click **Read now** on its card to read it in the cloud. The text is read in your browser (scans and photos too), names, addresses and numbers are hidden there first, and only that masked text goes to Gemini in Belgium to file it. The first time, the browser downloads the privacy model once (about 917 MB). Afterwards the card shows exactly what was sent. You have 300 cloud reads a month; Word files and spreadsheets are read on your Mac.
- In a browser, Settings → Cloud account has **Export everything** (one zip, unlocked in the browser) and **Delete my account**, which removes your cloud library, every file and your sign-in for good (type DELETE to confirm; your Mac keeps its own library). The Privacy Policy and Terms are linked there and on the sign-in page.
- Scans the browser can't read well (stamps, handwriting) are left to your Mac, which reads them with Apple's text recognition; a scan the browser already read is read again on your Mac when it syncs. In a document's tab on the Mac, **Read again** re-reads its text; its facts stay.
- **Ask** works in the browser too: Gemini in Belgium answers, and names, IDs, addresses and dates are hidden in your browser before your question leaves (you see what will be sent when it holds something private). You have 1,000 cloud questions a month. Making a zip of documents and keeping your conversations only work on your Mac for now.
- After 30 minutes without use, the browser locks your library and drops everything unlocked; click **Open my library** to go on.
- If your account already has a cloud library started somewhere else, Voidcat asks for that library's recovery key to join it. Your Mac then uses that key, and its old recovery key stops working.

## Settings
- [Settings](#/settings) has: Appearance (Auto, Light, Dark), Privacy (Hide private details, Catch names the rules miss), Voidcat Cloud (connect this Mac, New documents go to the cloud), Your data (Export everything, Recovery key) and Reminders (Open Voidcat when you log in).
