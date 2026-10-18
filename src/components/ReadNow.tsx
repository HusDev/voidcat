import { CloudCog, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useCloud } from "../cloud/CloudGate";
import { browserCanRead } from "../cloud/browserReader";
import { readNow, useReadNow } from "../cloud/readNow";
import { type Document, onMac } from "../lib/library";
import { MODEL_SIZE, nameCheckOn } from "../lib/nameCheck";

/**
 * On a browser's "new" document: read it now in the cloud instead of waiting for the Mac. The first time, it says the
 * privacy model is downloaded into this browser once. Afterwards, what was sent can be looked at.
 */
export function ReadNow({ doc }: { doc: Document }) {
  const cloud = useCloud();
  const step = useReadNow().get(doc.id);
  const [asking, setAsking] = useState(false);
  if (onMac || !cloud) return null;
  const busy = step && !["done", "failed"].includes(step.stage);
  const can = browserCanRead(doc);

  const start = () => {
    setAsking(false);
    readNow(doc, cloud.user);
  };

  if (doc.status === "new" && !busy && step?.stage !== "done") {
    if (can !== true) return <span className="text-[12.5px] text-ink-2">{can} Open Voidcat there and it's read on its own.</span>;
    return (
      <div className="flex flex-col gap-2">
        {step?.stage === "failed" && <span className="text-[12.5px] text-danger">{step.note}</span>}
        {asking ? (
          <div className="flex flex-col gap-2 rounded-lg bg-ground px-3 py-2.5 text-[12.5px] text-ink-2">
            <span>
              First, a privacy model ({MODEL_SIZE}, once) is downloaded into this browser. It hides names, addresses and numbers here, before anything leaves.
              Only that masked text goes to Gemini in Belgium.
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={start} className="rounded-md bg-accent px-3 py-1.5 font-semibold text-on-accent hover:bg-accent-strong">
                Download and read
              </button>
              <button type="button" onClick={() => setAsking(false)} className="px-2 py-1.5 text-ink-2 underline">
                Not now
              </button>
            </span>
          </div>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (nameCheckOn() ? start() : setAsking(true))}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[13px] font-semibold text-on-accent hover:bg-accent-strong"
            >
              <CloudCog aria-hidden className="size-4" /> Read now
            </button>
            <span className="text-[12px] text-ink-2">or let your Mac read it</span>
          </span>
        )}
      </div>
    );
  }

  if (busy)
    return (
      <span role="status" className="flex items-center gap-1.5 text-[13px] text-link">
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" /> {step.note}
      </span>
    );

  if (step?.stage === "done")
    return (
      <details className="text-[12.5px] text-ink-2">
        <summary className="cursor-pointer">
          {step.note}
          {step.limit ? ` ${step.used} of ${step.limit} cloud reads this month.` : ""}
        </summary>
        <p className="m-0 mt-1.5">What left this browser (private details as placeholders):</p>
        <pre data-selectable className="mt-1 max-h-48 overflow-auto rounded-lg bg-code p-2.5 font-mono text-[11.5px] whitespace-pre-wrap text-code-ink">
          {step.sent}
        </pre>
      </details>
    );
  return null;
}
