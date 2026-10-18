import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import fs from "node:fs";

/**
 * Engine files a worker loads by URL, served (dev) and bundled (build) under /<prefix>/ so nothing loads from a CDN:
 * ONNX Runtime for the privacy-filter model (its WebGPU build loads only the asyncify variant) and Tesseract's OCR
 * worker and engine (the LSTM builds; the worker picks one by what the browser supports).
 */
function vendorFiles(prefix: string, dir: string, pattern: RegExp) {
  const files: string[] = fs.readdirSync(dir).filter((f: string) => pattern.test(f));
  return {
    name: `vendor-${prefix}-${dir}`,
    configureServer(server: any) {
      server.middlewares.use(`/${prefix}/`, (req: any, res: any, next: () => void) => {
        const name = String(req.url ?? "").slice(1).split("?")[0];
        if (!files.includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        // nosemgrep: eslint.detect-non-literal-fs-filename -- name must be one of the files listed above, so no "../" gets through; dev server only
        fs.createReadStream(`${dir}/${name}`).pipe(res);
      });
    },
    generateBundle(this: { emitFile: (f: { type: "asset"; fileName: string; source: Uint8Array }) => void }) {
      for (const f of files) {
        // nosemgrep: eslint.detect-non-literal-fs-filename -- f comes from the folder listing above; build time only
        this.emitFile({ type: "asset", fileName: `${prefix}/${f}`, source: fs.readFileSync(`${dir}/${f}`) });
      }
    },
  };
}
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
    vendorFiles("ort", "node_modules/onnxruntime-web/dist", /^ort-wasm-simd-threaded\.asyncify\.(wasm|mjs)$/),
    vendorFiles("ocr", "node_modules/tesseract.js/dist", /^worker\.min\.js$/),
    vendorFiles("ocr", "node_modules/tesseract.js-core", /^tesseract-core-(relaxedsimd-|simd-)?lstm\.wasm\.js$/),
  ],
  worker: { format: "es" as const },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
