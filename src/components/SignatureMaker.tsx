import "@fontsource/caveat/500.css";
import { Eraser, ImageUp, PenLine, Type } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { type Pixels, cleanSignature, trimInk } from "../lib/signing";

/** Ink for signatures: a dark blue, like a pen. */
const INK = "#1e2a5a";

/** Pixels as a PNG file. */
async function png(img: Pixels) {
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [img.width, img.height];
  canvas.getContext("2d")!.putImageData(new ImageData(Uint8ClampedArray.from(img.data), img.width, img.height), 0, 0);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("The signature could not be made into a picture.");
  return new Uint8Array(await blob.arrayBuffer());
}

const pixels = (canvas: HTMLCanvasElement): Pixels => {
  const { data, width, height } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width, height };
};

/** A picture file drawn on a canvas, at most `max` pixels on its longer side. */
async function loadPicture(file: Blob, max = 1400) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale)];
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Making your signature: drawn with the trackpad or mouse, typed in a handwriting font, or a photo of it on paper
 * (the paper made see-through). Hands back a PNG cut to the ink.
 */
export function SignatureMaker({ name, onMake, onCancel }: { name: string; onMake: (png: Uint8Array) => Promise<void>; onCancel?: () => void }) {
  const [tab, setTab] = useState<"draw" | "type" | "upload">("draw");
  const [typed, setTyped] = useState(name);
  const [upload, setUpload] = useState<{ url: string; png: Uint8Array } | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pad = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => {
    if (upload) URL.revokeObjectURL(upload.url);
  }, [upload]);

  // The drawing pad at the screen's sharpness.
  useEffect(() => {
    const canvas = pad.current;
    if (!canvas || tab !== "draw") return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    Object.assign(ctx, { lineWidth: 2.4, lineCap: "round", lineJoin: "round", strokeStyle: INK });
    setDrawn(false);
  }, [tab]);

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const stroke = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const p = at(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    // Through the midpoint, so quick strokes stay smooth.
    ctx.quadraticCurveTo(last.current.x, last.current.y, (last.current.x + p.x) / 2, (last.current.y + p.y) / 2);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setDrawn(true);
  };
  const clear = () => {
    const canvas = pad.current;
    canvas?.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setDrawn(false);
  };

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      let ink: Pixels | null = null;
      if (tab === "draw" && pad.current) ink = trimInk(pixels(pad.current));
      if (tab === "type") {
        await document.fonts.load("500 96px Caveat");
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = [1600, 240];
        const ctx = canvas.getContext("2d")!;
        Object.assign(ctx, { font: "500 96px Caveat", fillStyle: INK, textBaseline: "middle" });
        ctx.fillText(typed.trim(), 24, 120);
        ink = trimInk(pixels(canvas));
      }
      if (tab === "upload" && upload) return await onMake(upload.png);
      if (!ink) throw new Error(tab === "type" ? "Type your name first." : "Sign in the box first.");
      await onMake(await png(ink));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { id: "draw" as const, label: "Draw", Icon: PenLine },
    { id: "type" as const, label: "Type", Icon: Type },
    { id: "upload" as const, label: "Upload", Icon: ImageUp },
  ];
  const ready = tab === "draw" ? drawn : tab === "type" ? !!typed.trim() : !!upload;

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Your signature" className="flex gap-1 rounded-lg bg-ground p-0.5 text-[13px]">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 ${tab === id ? "bg-card font-semibold shadow-sm" : "text-ink-2 hover:text-ink"}`}
          >
            <Icon aria-hidden className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "draw" && (
        <div className="relative">
          <canvas
            ref={pad}
            aria-label="Sign here with the trackpad or mouse"
            className="block h-32 w-full cursor-crosshair touch-none rounded-lg border border-line-strong bg-white"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              last.current = at(e);
            }}
            onPointerMove={stroke}
            onPointerUp={() => (last.current = null)}
          />
          {!drawn && <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] text-ink-2">Sign here</span>}
          {drawn && (
            <button type="button" onClick={clear} aria-label="Clear" title="Clear" className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink">
              <Eraser aria-hidden className="size-4" />
            </button>
          )}
        </div>
      )}

      {tab === "type" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="typed-signature" className="text-[12.5px] text-ink-2">
            Your name
          </label>
          <input
            id="typed-signature"
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13.5px] outline-none focus:border-ink-2"
          />
          <div className="grid h-24 place-items-center overflow-hidden rounded-lg border border-line-strong bg-white px-3">
            <span className="truncate text-[44px] leading-none" style={{ fontFamily: "Caveat, cursive", fontWeight: 500, color: INK }}>
              {typed || " "}
            </span>
          </div>
        </div>
      )}

      {tab === "upload" && (
        <div className="flex flex-col gap-2">
          <label className="flex h-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-white text-[13px] text-ink-2 hover:border-ink-2">
            {upload ? <img src={upload.url} alt="Your signature" className="max-h-20 max-w-full" /> : "Choose a photo of your signature on white paper"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                setError(null);
                try {
                  const clean = cleanSignature(pixels(await loadPicture(file)));
                  if (!clean) throw new Error("No signature found in that picture. Try a photo of dark ink on white paper.");
                  const bytes = await png(clean);
                  setUpload({ url: URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })), png: bytes });
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          </label>
          <span className="text-[12px] text-ink-2">The paper is made see-through; only the ink is kept.</span>
        </div>
      )}

      {error && <p className="m-0 text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!ready || busy} onClick={make} className="h-9 flex-1 rounded-md bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-40">
          Use this signature
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-9 rounded-md px-3 text-[13px] text-ink-2 hover:text-ink">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
