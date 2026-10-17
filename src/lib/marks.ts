/** Marking a document's facts where they appear: to check (cyan), approved (green), and the one you're looking at. */

export type Mark = { id: string; value: string; status: "pending" | "approved" | "rejected"; page: number | null };

export const markClass = (status: Mark["status"], selected: boolean) =>
  `${status === "approved" ? "border-b-2 border-ok bg-[rgb(76_195_138/0.2)]" : "bg-[rgb(94_234_212/0.4)]"} ${selected ? "outline-2 outline-offset-2 outline-accent" : ""}`;

/** Lower case, runs of spaces as one: how values and page text are compared. */
export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A spreadsheet cell holds the value: the same text, or the value inside a longer cell. */
export function cellHas(cell: string, value: string) {
  const a = norm(cell);
  const b = norm(value);
  return !!a && !!b && (a === b || (b.length >= 4 && a.includes(b)));
}

/** Wraps the first place each value appears in `root` in a <mark>, and scrolls the selected one into view. */
export function markText(root: HTMLElement, marks: Mark[], selected: string | null) {
  root.querySelectorAll("mark[data-fact]").forEach((m) => m.replaceWith(...m.childNodes));
  root.normalize();
  for (const m of marks) {
    const needle = m.value.trim().toLowerCase();
    if (needle.length < 2) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (node.parentElement?.closest("mark[data-fact]")) continue;
      const at = node.data.toLowerCase().indexOf(needle);
      if (at < 0) continue;
      const hit = node.splitText(at);
      hit.splitText(needle.length);
      const mark = document.createElement("mark");
      mark.dataset.fact = m.id;
      mark.className = `rounded-sm px-0.5 text-inherit ${markClass(m.status, m.id === selected)}`;
      hit.replaceWith(mark);
      mark.append(hit);
      if (m.id === selected) mark.scrollIntoView({ block: "center", behavior: "smooth" });
      break;
    }
  }
}

/** One PDF page's text with, for every character, the text run and position it came from. */
export type PageText = { text: string; at: [number, number][] };

/** Joins a page's text runs into one searchable string, keeping track of where each character came from. */
export function pageText(runs: string[]): PageText {
  let text = "";
  const at: [number, number][] = [];
  runs.forEach((run, i) => {
    for (let c = 0; c < run.length; c++) {
      const ch = run[c];
      if (/\s/.test(ch)) {
        if (text && !text.endsWith(" ")) {
          text += " ";
          at.push([i, c]);
        }
      } else {
        const low = ch.toLowerCase();
        text += low.length === 1 ? low : ch;
        at.push([i, c]);
      }
    }
    if (text && !text.endsWith(" ")) {
      text += " ";
      at.push([i, run.length]);
    }
  });
  return { text, at };
}

/** The text runs a value covers on a page, each with the characters [from, to) it covers; null when it isn't there. */
export function findRuns(page: PageText, value: string): Map<number, [number, number]> | null {
  const needle = norm(value);
  const k = needle ? page.text.indexOf(needle) : -1;
  if (k < 0) return null;
  const runs = new Map<number, [number, number]>();
  for (let j = k; j < k + needle.length; j++) {
    const [run, c] = page.at[j];
    const [from, to] = runs.get(run) ?? [c, c];
    runs.set(run, [Math.min(from, c), Math.max(to, c + 1)]);
  }
  return runs;
}
