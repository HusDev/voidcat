import { type InvokeArgs, invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Where the library's commands go: on the Mac, to Rust (`invoke`); in a browser, to the open cloud library
 * (`src/cloud/webLibrary.ts`, set once it has loaded). Library code calls `call` and doesn't care which.
 */

type Web = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
let web: Web | null = null;

export const setWebBackend = (w: Web) => {
  web = w;
};

/** Takes `w` away, unless another library has replaced it since (React may open one while closing the last). */
export const clearWebBackend = (w: Web) => {
  if (web === w) web = null;
};

/** The Mac app (Rust, the Keychain, Ollama, the menu bar…), as opposed to a browser. */
export const onMac = isTauri();

export function call<T>(cmd: string, args?: InvokeArgs, options?: Parameters<typeof invoke>[2]): Promise<T> {
  if (onMac) return invoke<T>(cmd, args, options);
  if (!web) return Promise.reject(new Error("No library is open."));
  return web(cmd, args as Record<string, unknown>) as Promise<T>;
}
