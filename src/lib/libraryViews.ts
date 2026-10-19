import { dateKind } from "./calendar";
import type { Label, LabelKind } from "./labels";
import type { Document, Fact } from "./library";
import { parseDate } from "./privacy";

/**
 * The Library's views and list, worked out from the documents, their facts and labels: which documents a view
 * shows, how the list is grouped by when they were added, filtered and sorted, and the one fact a row shows.
 */

export type View = "needs" | "recent" | "expiring" | "unsigned" | "notes" | "all";

export const VIEWS: { id: View; name: string }[] = [
  { id: "needs", name: "Needs you" },
  { id: "recent", name: "Recently added" },
  { id: "expiring", name: "Expiring soon" },
  { id: "unsigned", name: "Unsigned" },
  { id: "notes", name: "Notes I wrote" },
  { id: "all", name: "Everything" },
];

const DAY = 86_400_000;
/** "Recently added" reaches back this far. */
export const RECENT_DAYS = 30;
/** "Expiring soon" looks this far ahead (and includes what has already expired). */
export const EXPIRING_DAYS = 90;

export type Context = { approved: Fact[]; pending: Fact[]; labels: Label[]; now: Date };

const active = (labels: Label[], id: string, kind: LabelKind) => labels.some((l) => l.documentId === id && l.kind === kind && !l.dismissed);

/** The latest expiry date among a document's approved facts. */
export function expiresOn(facts: Fact[]) {
  const dates = facts
    .filter((f) => dateKind(f.label)?.kind === "expires")
    .map((f) => parseDate(f.value))
    .filter((d): d is Date => !!d);
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

/** Whether a document belongs in a view (Needs you is laid out on its own, from `tasks`). */
export function inView(view: View, d: Document, ctx: Context) {
  switch (view) {
    case "recent":
      return ctx.now.getTime() - new Date(d.addedAt).getTime() <= RECENT_DAYS * DAY;
    case "expiring": {
      if (active(ctx.labels, d.id, "expired")) return true;
      const until = expiresOn(ctx.approved.filter((f) => f.documentId === d.id));
      return !!until && until.getTime() - ctx.now.getTime() <= EXPIRING_DAYS * DAY;
    }
    case "unsigned":
      return active(ctx.labels, d.id, "unsigned");
    case "notes":
      return !!d.written;
    case "needs":
    case "all":
      return true;
  }
}

/** Everything that waits for you, by kind, and how many things that is in all. */
export function tasks(docs: Document[], ctx: Context) {
  const toFile = docs.filter((d) => d.filing === "suggested");
  // Read and filed before folders existed: they can be given one.
  const unsorted = docs.filter((d) => d.status === "filed" && !d.folderId && !d.filing);
  const pendingBy = new Map<string, number>();
  for (const f of ctx.pending) pendingBy.set(f.documentId, (pendingBy.get(f.documentId) ?? 0) + 1);
  const toCheck = docs.filter((d) => pendingBy.has(d.id)).map((d) => ({ doc: d, facts: pendingBy.get(d.id)! }));
  const copies = copyGroups(docs, ctx.labels);
  const count = toFile.length + unsorted.length + ctx.pending.filter((f) => docs.some((d) => d.id === f.documentId)).length + copies.length;
  return { toFile, unsorted, toCheck, copies, count };
}

/** Possible copies, grouped: each duplicate label points at another document of its group. */
export function copyGroups(docs: Document[], labels: Label[]) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const groups: Document[][] = [];
  for (const l of labels.filter((l) => l.kind === "duplicate" && !l.dismissed)) {
    const members = [l.documentId, l.relatedId ?? ""].map((id) => byId.get(id)).filter((d): d is Document => !!d);
    const group = groups.find((g) => members.some((d) => g.includes(d)));
    if (group) members.forEach((d) => !group.includes(d) && group.push(d));
    else if (members.length > 1) groups.push(members);
  }
  return groups;
}

/** The view the Library opens on: Needs you when something waits, else Recently added (or Everything when empty). */
export function startView(count: number, docs: Document[], ctx: Context): View {
  if (count) return "needs";
  return docs.some((d) => inView("recent", d, ctx)) ? "recent" : "all";
}

export type Filters = { area: string; type: string; year: string; label: string };
export const NO_FILTERS: Filters = { area: "", type: "", year: "", label: "" };

export function matches(d: Document, f: Filters, labels: Label[]) {
  return (
    (!f.area || (d.area ?? "Not filed") === f.area) &&
    (!f.type || (d.docType ?? "Other") === f.type) &&
    (!f.year || d.addedAt.slice(0, 4) === f.year) &&
    (!f.label || active(labels, d.id, f.label as LabelKind))
  );
}

/** The values each filter can take, from the documents there are. */
export function filterOptions(docs: Document[], labels: Label[]) {
  const sorted = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return {
    area: sorted(docs.map((d) => d.area ?? "Not filed")),
    type: sorted(docs.map((d) => d.docType ?? "Other")),
    year: sorted(docs.map((d) => d.addedAt.slice(0, 4))).reverse(),
    label: sorted(labels.filter((l) => !l.dismissed && docs.some((d) => d.id === l.documentId)).map((l) => l.kind)),
  };
}

export type Sort = "added" | "name" | "folder";

export function sortDocs(docs: Document[], sort: Sort) {
  const by: Record<Sort, (a: Document, b: Document) => number> = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    name: (a, b) => a.title.localeCompare(b.title),
    folder: (a, b) => (a.folderName ?? "￿").localeCompare(b.folderName ?? "￿") || a.title.localeCompare(b.title),
  };
  return [...docs].sort(by[sort]);
}

const MONTH = (d: Date, year: boolean) => d.toLocaleDateString("en-GB", year ? { month: "long", year: "numeric" } : { month: "long" });

/** The heading a document's added date falls under: Today, This week, Earlier in October, September, March 2025. */
export function timeGroup(added: Date, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(added.getFullYear(), added.getMonth(), added.getDate());
  const ago = Math.round((today.getTime() - day.getTime()) / DAY);
  if (ago <= 0) return "Today";
  if (ago < 7) return "This week";
  if (added.getFullYear() === now.getFullYear() && added.getMonth() === now.getMonth()) return `Earlier in ${MONTH(added, false)}`;
  return MONTH(added, added.getFullYear() !== now.getFullYear());
}

/** Documents (already sorted newest first) under their time headings, in order. */
export function byTime(docs: Document[], now: Date) {
  const groups: { title: string; docs: Document[] }[] = [];
  for (const d of docs) {
    const title = timeGroup(new Date(d.addedAt), now);
    const last = groups[groups.length - 1];
    if (last?.title === title) last.docs.push(d);
    else groups.push({ title, docs: [d] });
  }
  return groups;
}

/** "Today", "Yesterday", "Mon", "8 Oct", "8 Oct 2025": when a document was added, short. */
export function addedShort(added: Date, now: Date) {
  const ago = Math.round((new Date(now.toDateString()).getTime() - new Date(added.toDateString()).getTime()) / DAY);
  if (ago <= 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago < 7) return added.toLocaleDateString("en-GB", { weekday: "short" });
  return added.toLocaleDateString("en-GB", added.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** The one approved fact a row shows: an expiry first, then an amount, then a date, then whatever came first. */
export function keyFact(facts: Fact[]) {
  const money = /[€$£]|\b(eur|euros?|usd)\b/i;
  return (
    facts.find((f) => dateKind(f.label)?.kind === "expires") ??
    facts.find((f) => money.test(f.value)) ??
    facts.find((f) => !!parseDate(f.value)) ??
    facts[0] ??
    null
  );
}
