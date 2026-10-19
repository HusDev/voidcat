/**
 * Autosave for a note being edited: saves a moment after typing stops, or at once on ⌘S, leaving the tab or hiding
 * private details. The first save of an editing session asks Rust to keep the version from before it.
 */

export type SaveState = "saved" | "unsaved" | "saving" | "error";

export const AUTOSAVE_MS = 1500;

/** Saves still running after their editor closed, so a closed note is checked only once they finish. */
const inFlight = new Set<Promise<void>>();
export function track(save: Promise<void>) {
  inFlight.add(save);
  void save.finally(() => inFlight.delete(save));
}
export const afterSaves = () => Promise.allSettled(inFlight);

export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;
  private first = true;
  private running: Promise<void> = Promise.resolve();
  state: SaveState = "saved";
  error: string | null = null;

  constructor(
    private save: (text: string, keepPrevious: boolean) => Promise<void>,
    private onState: (state: SaveState, error: string | null) => void = () => {},
    private delay = AUTOSAVE_MS,
  ) {}

  /** The text changed: save it once typing pauses. */
  change(text: string) {
    this.pending = text;
    this.set("unsaved");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  /** Saves what is waiting now (if anything), after any save already running. */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running = this.running.then(async () => {
      const text = this.pending;
      if (text === null) return;
      this.pending = null;
      this.set("saving");
      try {
        await this.save(text, this.first);
        this.first = false;
        // More typing while it saved leaves it unsaved, with its own timer running.
        this.set(this.pending === null ? "saved" : "unsaved");
      } catch (e) {
        // Keep the text so the next change or flush tries again.
        this.pending ??= text;
        this.set("error", e instanceof Error ? e.message : String(e));
      }
    });
    return this.running;
  }

  private set(state: SaveState, error: string | null = null) {
    this.state = state;
    this.error = error;
    this.onState(state, error);
  }
}
