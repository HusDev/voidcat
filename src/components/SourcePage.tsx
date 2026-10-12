import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const isMarkdown = (mime: string | null) => mime === "text/markdown";

/** Wraps the first place `value` appears in the rendered page in a <mark>, ignoring case. */
function markFirst(root: HTMLElement, value: string) {
  root.querySelectorAll("mark[data-fact]").forEach((m) => m.replaceWith(...m.childNodes));
  root.normalize();
  root.scrollTo({ top: 0 });
  const needle = value.trim().toLowerCase();
  if (!needle) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const at = node.data.toLowerCase().indexOf(needle);
    if (at < 0) continue;
    const hit = node.splitText(at);
    hit.splitText(needle.length);
    const mark = document.createElement("mark");
    mark.dataset.fact = "";
    mark.className = "bg-private-mark px-0.5";
    hit.replaceWith(mark);
    mark.append(hit);
    // Scroll only this page's box (never the window) so the list beside it stays put.
    const top = mark.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, top - root.clientHeight / 2) });
    return;
  }
}

/** One page of a document as read on this Mac: Markdown rendered as a document, other text as is. */
export function SourcePage({ text, mime, highlight }: { text: string; mime: string | null; highlight: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) markFirst(ref.current, highlight);
  }, [text, highlight]);

  return (
    <div
      ref={ref}
      data-selectable
      className={`max-h-[calc(100vh-11rem)] overflow-y-auto rounded-xl border border-line bg-card px-6 py-6 text-page-ink ${isMarkdown(mime) ? "md-page text-[13px] leading-relaxed" : "whitespace-pre-wrap text-xs leading-relaxed"}`}
    >
      {isMarkdown(mime) ? <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown> : text}
    </div>
  );
}
