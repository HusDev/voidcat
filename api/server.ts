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
import { getFirestore } from "firebase-admin/firestore";
import { AREAS, CLOUD, SYSTEM } from "../src/lib/filing";
import { type Filed, month, parseFiled, parseRequest } from "./read";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "voidcat-cloud";
const LOCATION = process.env.VERTEX_LOCATION ?? "europe-west1";
const MODEL = process.env.MODEL ?? "gemini-2.5-flash";
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://voidcat-web-1094942921673.europe-west1.run.app,http://localhost:1430").split(",");
export const READS_PER_MONTH = Number(process.env.READS_PER_MONTH ?? 300);

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

/** Counts one read for this person this month, or says the month's reads are used up. */
async function countRead(uid: string): Promise<{ used: number } | null> {
  const ref = db.collection("usage").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = month();
    const used = snap.exists && snap.get("month") === now ? Number(snap.get("reads") ?? 0) : 0;
    if (used >= READS_PER_MONTH) return null;
    tx.set(ref, { month: now, reads: used + 1 });
    return { used: used + 1 };
  });
}

async function readsUsed(uid: string) {
  const snap = await db.collection("usage").doc(uid).get();
  return snap.exists && snap.get("month") === month() ? Number(snap.get("reads") ?? 0) : 0;
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) => Response.json(body, { status, headers });

/** The signed-in person, if the token is valid and they have a cloud library. */
async function who(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    const { uid } = await getAuth().verifyIdToken(token);
    return (await db.collection("users").doc(uid).get()).exists ? uid : null;
  } catch {
    return null;
  }
}

export async function handle(req: Request): Promise<Response> {
  const headers = cors(req.headers.get("Origin"));
  const path = new URL(req.url).pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (path === "/health") return json({ ok: true }, 200, headers);

  if (path === "/v1/usage" && req.method === "GET") {
    const uid = await who(req);
    if (!uid) return json({ error: "Sign in to Voidcat Cloud first." }, 401, headers);
    return json({ used: await readsUsed(uid), limit: READS_PER_MONTH }, 200, headers);
  }

  if (path === "/v1/read" && req.method === "POST") {
    const uid = await who(req);
    if (!uid) return json({ error: "Sign in to Voidcat Cloud first." }, 401, headers);
    const parsed = parseRequest(await req.json().catch(() => null));
    if (typeof parsed === "string") return json({ error: parsed }, 400, headers);
    const counted = await countRead(uid);
    if (!counted) return json({ error: `You've used this month's ${READS_PER_MONTH} cloud reads. Your Mac can still read documents.` }, 429, headers);
    try {
      return json({ filed: await file(parsed.text, parsed.folders), used: counted.used, limit: READS_PER_MONTH }, 200, headers);
    } catch (e) {
      // Only the kind of failure is logged, never the text.
      console.error("read failed:", e instanceof Error ? e.name : "unknown");
      return json({ error: "The cloud couldn't read this document. Try again in a moment." }, 502, headers);
    }
  }
  return json({ error: "Not found." }, 404, headers);
}

if (import.meta.main) {
  Bun.serve({ port: Number(process.env.PORT ?? 8080), fetch: handle });
  console.log(`voidcat-api on ${process.env.PORT ?? 8080}, model ${MODEL} in ${LOCATION}`);
}
