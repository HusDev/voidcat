# Demo library

Invented documents for showing Voidcat (screen recordings, the hackathon video). Every name, address, ID and number in them is made up.

Run the app on a separate, empty library so your own documents never appear on screen:

```bash
bun run demo
```

Then drop the files in `demo/documents/` onto the Library. They show:

- **Filing:** a lease, a residence card, a payslip, a gym membership and a dentist letter land in Home, Identity, Work, Health…
- **Labels:** the two lease files are grouped as the same document, the copy with "Firme aquí" and empty lines is flagged as unsigned, and the gym membership has ended.
- **Calendar:** the dentist appointment, the residence card renewal (60 days before it expires) and the monthly rent days.
- **Ask:** "when is my rent due?", "@Payslip how much did I get paid?", "give me my rental papers as a zip".

The demo library lives in `~/Library/Application Support/dev.hus.voidcat-demo/`; delete that folder to start again.
