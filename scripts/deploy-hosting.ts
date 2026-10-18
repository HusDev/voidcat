/**
 * Deploys voidcat.io (the landing page in `site/`) and app.voidcat.io (forwards to the voidcat-web Cloud Run service)
 * to Firebase Hosting through its REST API, from the `hosting` entries in `firebase.json`.
 *
 *   bun scripts/deploy-hosting.ts            both sites
 *   bun scripts/deploy-hosting.ts site       one target
 *
 * Signs in with `gcloud auth print-access-token` locally; in CI it trades the job's GitLab ID token (GCP_ID_TOKEN)
 * for a short-lived gitlab-deploy@ token through Workload Identity Federation, so no key is stored anywhere.
 */
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const PROJECT = "voidcat-cloud";
const POOL = "projects/1094942921673/locations/global/workloadIdentityPools/gitlab/providers/gitlab-com";
const DEPLOYER = "gitlab-deploy@voidcat-cloud.iam.gserviceaccount.com";
const API = "https://firebasehosting.googleapis.com/v1beta1";

type Header = { source: string; headers: { key: string; value: string }[] };
type Rewrite = { source: string; run: { serviceId: string; region: string } };
type Entry = { target: string; public: string; ignore?: string[]; cleanUrls?: boolean; headers?: Header[]; rewrites?: Rewrite[] };

async function accessToken(): Promise<string> {
  const idToken = process.env.GCP_ID_TOKEN;
  if (!idToken) {
    const out = Bun.spawnSync(["gcloud", "auth", "print-access-token"]);
    if (out.exitCode !== 0) throw new Error("gcloud auth print-access-token failed");
    return out.stdout.toString().trim();
  }
  const sts = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: `//iam.googleapis.com/${POOL}`,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: idToken,
    }),
  });
  if (!sts.ok) throw new Error(`token exchange failed: ${sts.status}`);
  const federated = ((await sts.json()) as { access_token: string }).access_token;
  const sa = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${DEPLOYER}:generateAccessToken`, {
    method: "POST",
    headers: { Authorization: `Bearer ${federated}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: ["https://www.googleapis.com/auth/cloud-platform"] }),
  });
  if (!sa.ok) throw new Error(`service account token failed: ${sa.status}`);
  return ((await sa.json()) as { accessToken: string }).accessToken;
}

/** Firebase's REST config: `glob` instead of `source`, headers as a map. */
export function restConfig(entry: Entry) {
  return {
    cleanUrls: entry.cleanUrls ?? false,
    headers: (entry.headers ?? []).map((h) => ({ glob: h.source, headers: Object.fromEntries(h.headers.map((x) => [x.key, x.value])) })),
    rewrites: (entry.rewrites ?? []).map((r) => ({ glob: r.source, run: r.run })),
  };
}

async function filesOf(entry: Entry): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  if (entry.ignore?.includes("**")) return files;
  const names = await readdir(entry.public, { recursive: true, withFileTypes: true });
  for (const d of names) {
    if (!d.isFile() || d.name.startsWith(".")) continue;
    const path = join(d.parentPath, d.name);
    files.set(`/${relative(entry.public, path)}`, new Uint8Array(Bun.gzipSync(new Uint8Array(await Bun.file(path).arrayBuffer()))));
  }
  return files;
}

async function deploy(entry: Entry, site: string, token: string) {
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": PROJECT, "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  };

  const version = (await call(`${API}/sites/${site}/versions`, { method: "POST", body: JSON.stringify({ config: restConfig(entry) }) }))
    .name as string;
  const files = await filesOf(entry);
  const hashes = new Map([...files].map(([path, gz]) => [path, createHash("sha256").update(gz).digest("hex")]));
  if (files.size) {
    const populated = await call(`${API}/${version}:populateFiles`, { method: "POST", body: JSON.stringify({ files: Object.fromEntries(hashes) }) });
    const needed = new Set((populated.uploadRequiredHashes as string[] | undefined) ?? []);
    for (const [path, hash] of hashes) {
      if (!needed.has(hash)) continue;
      const res = await fetch(`${populated.uploadUrl}/${hash}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
        body: files.get(path)!,
      });
      if (!res.ok) throw new Error(`upload ${path}: ${res.status}`);
    }
  }
  await call(`${API}/${version}?update_mask=status`, { method: "PATCH", body: JSON.stringify({ status: "FINALIZED" }) });
  await call(`${API}/sites/${site}/releases?versionName=${version}`, { method: "POST", body: "{}" });
  console.log(`${entry.target} → ${site}: ${files.size} files, released`);
}

if (import.meta.main) {
  const firebase = (await Bun.file("firebase.json").json()) as { hosting: Entry[] };
  const targets = ((await Bun.file(".firebaserc").json()) as { targets: Record<string, { hosting: Record<string, string[]> }> }).targets[PROJECT]
    .hosting;
  const only = process.argv[2];
  const token = await accessToken();
  for (const entry of firebase.hosting) {
    if (only && entry.target !== only) continue;
    await deploy(entry, targets[entry.target][0], token);
  }
}
