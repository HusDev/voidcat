import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useEffect } from "react";
import { type CalEvent, claimReminder, dueReminders } from "./calendar";
import { hasLibrary } from "./library";

/**
 * Shows calendar reminders as Mac notifications while Voidcat is open, checking every minute.
 * Each reminder is recorded on this Mac, so it's shown once even across restarts.
 */
export function useReminders(events: CalEvent[], done: Set<string>) {
  useEffect(() => {
    if (!hasLibrary || !events.length) return;
    let cancelled = false;
    const check = async () => {
      const due = dueReminders(events, new Date(), done);
      if (!due.length) return;
      let allowed = await isPermissionGranted();
      if (!allowed) allowed = (await requestPermission()) === "granted";
      if (!allowed || cancelled) return;
      for (const r of due) {
        if (await claimReminder(r.key)) {
          const e = r.event;
          sendNotification({ title: `${e.title} · ${r.when}`, body: [e.time, e.place, e.detail].filter(Boolean).join(" · ") || "Open Voidcat for details." });
        }
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [events, done]);
}
