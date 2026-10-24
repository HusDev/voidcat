/**
 * voidcat-api on Cloud Run: "Read now in the cloud". A browser sends a document's text with private details already
 * replaced by placeholders (privacy filter + approved facts, in the browser); this asks Gemini on Vertex AI in
 * Belgium to file it and returns the result, still with placeholders, for the browser to fill back in.
 *
 * Every request needs a Firebase ID token from someone with a cloud library; each person gets READS_PER_MONTH reads.
 * Nothing is stored except that count, and no text is logged.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { SYSTEM as ASK_SYSTEM, todayLine } from "../src/lib/askPrompt";
import { AREAS, CLOUD, SYSTEM } from "../src/lib/filing";
import { countsAsDownload, type Filed, month, parseAsk, parseFiled, parseRequest, type Turn } from "./read";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "voidcat-cloud";
const LOCATION = process.env.VERTEX_LOCATION ?? "europe-west1";
const MODEL = process.env.MODEL ?? "gemini-2.5-flash";
const BUCKET = process.env.FILES_BUCKET ?? "voidcat-cloud-files";
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://app.voidcat.io,https://voidcat-web-1094942921673.europe-west1.run.app,http://localhost:1430").split(",");
/** The Mac app's .dmg in Storage; voidcat.io/download/mac comes here (Hosting rewrite), is counted, and goes on. */
const DMG_URL = process.env.DMG_URL ?? "https://firebasestorage.googleapis.com/v0/b/voidcat-cloud-files/o/downloads%2FVoidcat-0.1.0-mac-arm64.dmg?alt=media&token=c6afcba6-6d23-4263-8967-2da69dbdecb8";
export const READS_PER_MONTH = Number(process.env.READS_PER_MONTH ?? 300);
export const ASKS_PER_MONTH = Number(process.env.ASKS_PER_MONTH ?? 1000);

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Short, specific name for this document" },
    docType: { type: Type.STRING, description: "What kind of document, in snake_case, e.g. passport, rental_contract, payslip" },
    area: { type: Type.STRING, enum: [...AREAS] },
    folder: { type: Type.STRING, description: "The folder inside the area: an existing folder's exact name if one clearly fits, else a short new name (2-4 words)" },
    facts: {
      type: Type.ARRAY,
      maxItems: "12",
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING, description: "Copied exactly as written, placeholders included" },
          page: { type: Type.INTEGER, nullable: true },
        },
        required: ["label", "value"],
      },
    },
  },
  required: ["title", "docType", "area", "folder", "facts"],
};

/** Counts one use ("reads" or "asks") for this person this month, or says the month's allowance is used up. */
async function count(uid: string, what: "reads" | "asks", limit: number): Promise<{ used: number } | null> {
  const ref = db.collection("usage").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = month();
    const same = snap.exists && snap.get("month") === now;
    const used = same ? Number(snap.get(what) ?? 0) : 0;
    if (used >= limit) return null;
    tx.set(ref, same ? { [what]: used + 1 } : { month: now, reads: 0, asks: 0, [what]: 1 }, { merge: same });
    return { used: used + 1 };
  });
}

async function usage(uid: string) {
  const snap = await db.collection("usage").doc(uid).get();
  const same = snap.exists && snap.get("month") === month();
  return { reads: same ? Number(snap.get("reads") ?? 0) : 0, asks: same ? Number(snap.get("asks") ?? 0) : 0 };
}

/** Streams Gemini's answer to an Ask conversation, as plain text. Every turn is already masked by the browser. */
async function answer(messages: Turn[], today: Date): Promise<ReadableStream<Uint8Array>> {
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    config: { systemInstruction: `${ASK_SYSTEM}\n${todayLine(today)}`, temperature: 0.2 },
  });
  const encode = new TextEncoder();
  return new ReadableStream({
    async start(out) {
      try {
        for await (const chunk of stream) if (chunk.text) out.enqueue(encode.encode(chunk.text));
      } catch (e) {
        console.error("ask stream failed:", e instanceof Error ? e.name : "unknown");
        out.enqueue(encode.encode("\n\n(The answer stopped early. Try again.)"));
      }
      out.close();
    },
  });
}

export async function file(text: string, folders: string[]): Promise<Filed> {
  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: `Existing folders:\n${folders.length ? folders.map((f) => `- ${f}`).join("\n") : "(none yet)"}\n\nDocument:\n${text}` }] }],
    config: {
      systemInstruction: `${SYSTEM}\n${CLOUD}`,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return parseFiled(result.text ?? "{}");
}

function cors(origin: string | null) {
  const allowed = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "3600",
    "Access-Control-Expose-Headers": "X-Asks-Used, X-Asks-Limit",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) => Response.json(body, { status, headers });

/** The signed-in person, if the token is valid (and, unless `anyone`, they have a cloud library). */
async function who(req: Request, anyone = false): Promise<string | null> {
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    const { uid, email_verified } = await getAuth().verifyIdToken(token, true);
    if (!email_verified && !anyone) return null;
    return anyone || (await db.collection("users").doc(uid).get()).exists ? uid : null;
  } catch {
    return null;
  }
}

/**
 * Deletes everything Voidcat Cloud holds for one person: every sealed record and the library itself, their files,
 * their read count, and their sign-in. What's on their devices stays.
 */
async function deleteAccount(uid: string) {
  await db.recursiveDelete(db.collection("users").doc(uid));
  await db.collection("usage").doc(uid).delete();
  await getStorage().bucket(BUCKET).deleteFiles({ prefix: `users/${uid}/` });
  await getAuth().deleteUser(uid);
}

export async function handle(req: Request): Promise<Response> {
  const headers = cors(req.headers.get("Origin"));
  const path = new URL(req.url).pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (path === "/health") return json({ ok: true }, 200, headers);

  // The download counter: a number only (no address, no browser details), shown on voidcat.io's Download buttons.
  if (path === "/download/mac" && (req.method === "GET" || req.method === "HEAD")) {
    if (countsAsDownload(req.method, req.headers.get("User-Agent")))
      await db.collection("stats").doc("downloads").set({ mac: FieldValue.increment(1) }, { merge: true }).catch(() => console.error("download count failed"));
    return new Response(null, { status: 302, headers: { Location: DMG_URL, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (path === "/api/downloads" && req.method === "GET") {
    const snap = await db.collection("stats").doc("downloads").get();
    return json({ mac: Number(snap.get("mac") ?? 0) }, 200, { ...headers, "Cache-Control": "public, max-age=60" });
  }

  if (path === "/v1/usage" && req.method === "GET") {
    const uid = await who(req);
    if (!uid) return json({ error: "Sign in to Voidcat Cloud first." }, 401, headers);
    const used = await usage(uid);
    return json({ reads: used.reads, readsLimit: READS_PER_MONTH, asks: used.asks, asksLimit: ASKS_PER_MONTH }, 200, headers);
  }

  if (path === "/v1/read" && req.method === "POST") {
    const uid = await who(req);
    if (!uid) return json({ error: "Sign in to Voidcat Cloud first." }, 401, headers);
    const parsed = parseRequest(await req.json().catch(() => null));
    if (typeof parsed === "string") return json({ error: parsed }, 400, headers);
    const counted = await count(uid, "reads", READS_PER_MONTH);
    if (!counted) return json({ error: `You've used this month's ${READS_PER_MONTH} cloud reads. Your Mac can still read documents.` }, 429, headers);
    try {
      return json({ filed: await file(parsed.text, parsed.folders), used: counted.used, limit: READS_PER_MONTH }, 200, headers);
    } catch (e) {
      // Only the kind of failure is logged, never the text.
      console.error("read failed:", e instanceof Error ? e.name : "unknown");
      return json({ error: "The cloud couldn't read this document. Try again in a moment." }, 502, headers);
    }
  }
  if (path === "/v1/ask" && req.method === "POST") {
    const uid = await who(req);
    if (!uid) return json({ error: "Sign in to Voidcat Cloud first." }, 401, headers);
    const parsed = parseAsk(await req.json().catch(() => null));
    if (typeof parsed === "string") return json({ error: parsed }, 400, headers);
    const counted = await count(uid, "asks", ASKS_PER_MONTH);
    if (!counted) return json({ error: `You've asked this month's ${ASKS_PER_MONTH} cloud questions. Your Mac can still answer.` }, 429, headers);
    try {
      const body = await answer(parsed.messages, parsed.today);
      return new Response(body, {
        status: 200,
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "X-Asks-Used": String(counted.used), "X-Asks-Limit": String(ASKS_PER_MONTH) },
      });
    } catch (e) {
      console.error("ask failed:", e instanceof Error ? e.name : "unknown");
      return json({ error: "The cloud couldn't answer. Try again in a moment." }, 502, headers);
    }
  }

  if (path === "/v1/account" && req.method === "DELETE") {
    const uid = await who(req, true);
    if (!uid) return json({ error: "Sign in to Voidcat Cloud first." }, 401, headers);
    try {
      await deleteAccount(uid);
      return json({ deleted: true }, 200, headers);
    } catch (e) {
      console.error("delete failed:", e instanceof Error ? e.name : "unknown");
      return json({ error: "Not everything could be deleted. Try again; what's already gone stays gone." }, 502, headers);
    }
  }
  return json({ error: "Not found." }, 404, headers);
}

if (import.meta.main) {
  Bun.serve({ port: Number(process.env.PORT ?? 8080), fetch: handle });
  console.log(`voidcat-api on ${process.env.PORT ?? 8080}, model ${MODEL} in ${LOCATION}`);
}
