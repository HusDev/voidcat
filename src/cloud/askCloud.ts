import type { Turn } from "../lib/cloud";
import { apiUrl } from "./config";
import { firebase } from "./firebase";

/**
 * Ask in a browser: the masked conversation goes to voidcat-api, which streams Gemini's answer (still with
 * placeholders) back as plain text. The browser turns the placeholders back into real values.
 */

export const VOIDCAT_MODEL = "gemini-2.5-flash";

/** Today in the browser, so "how long until" uses the reader's date. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function* askVoidcat(messages: Turn[]): AsyncGenerator<string> {
  const user = firebase().auth.currentUser;
  if (!user) throw new Error("Sign in to Voidcat Cloud first.");
  const res = await fetch(`${apiUrl}/v1/ask`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, today: today() }),
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `The cloud couldn't answer (${res.status}).`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    if (value) yield value;
  }
}
