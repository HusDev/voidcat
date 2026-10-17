import { useRef, useState } from "react";

/**
 * A name edited in place, like Finder: the text starts selected, Enter or clicking away saves, Escape cancels.
 * A refused name (empty, or taken) keeps the field open with the reason.
 */
export function RenameInput({
  id,
  value,
  label,
  onSave,
  onDone,
  className = "",
}: {
  id: string;
  value: string;
  label: string;
  onSave: (name: string) => Promise<void>;
  onDone: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  // Enter saves and then the field goes away, which can also blur it: save once.
  const saving = useRef(false);
  const save = async () => {
    if (saving.current) return;
    const name = draft.trim();
    if (!name || name === value) return onDone();
    saving.current = true;
    try {
      await onSave(name);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      saving.current = false;
    }
  };
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <input
        id={id}
        aria-label={label}
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.currentTarget.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            saving.current = true;
            onDone();
          }
        }}
        onBlur={save}
        onClick={(e) => e.stopPropagation()}
        className={`min-w-0 rounded border border-eye bg-transparent px-1 outline-none ${className}`}
      />
      {error && (
        <span role="alert" className="text-[11.5px] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
