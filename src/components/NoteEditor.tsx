import "@mdxeditor/editor/style.css";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  UndoRedo,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import { useEffect, useRef } from "react";
import { type Document, announceChange, saveNote } from "../lib/library";
import { Autosave, type SaveState, track } from "../lib/noteEditor";

/**
 * A note being written: Markdown with the formatting shown as you type (MDXEditor), or plain text in a text area.
 * Saves a moment after typing stops, on ⌘S, and when it closes (Done, another tab, hiding private details).
 */
export default function NoteEditor({
  doc,
  text,
  onState,
  onText,
  focus,
}: {
  doc: Document;
  /** Put the cursor in the text (not when the note's name is being typed). */
  focus: boolean;
  text: string;
  onState: (state: SaveState, error: string | null) => void;
  /** The latest text, so the page shows it when editing ends (the last save may still be running). */
  onText: (text: string) => void;
}) {
  const autosave = useRef<Autosave | null>(null);
  const report = useRef(onState);
  report.current = onState;
  const latest = useRef<string | null>(null);
  const keep = useRef(onText);
  keep.current = onText;

  useEffect(() => {
    const a = new Autosave(
      async (t, keepPrevious) => {
        await saveNote(doc.id, t, keepPrevious);
        announceChange();
      },
      (s, e) => report.current(s, e),
    );
    autosave.current = a;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void a.flush();
      }
    };
    const onHide = () => void a.flush();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", onHide);
      // Leaving the editor saves what is left; the save finishes on its own.
      track(a.flush());
      if (latest.current !== null) keep.current(latest.current);
      autosave.current = null;
    };
  }, [doc.id]);

  const change = (t: string) => {
    latest.current = t;
    autosave.current?.change(t);
  };

  if (doc.mime === "text/plain")
    return (
      <textarea
        defaultValue={text}
        onChange={(e) => change(e.currentTarget.value)}
        aria-label="Note text"
        autoFocus={focus}
        spellCheck
        className="min-h-[60vh] w-full resize-y bg-transparent font-mono text-[12.5px] leading-relaxed text-page-ink outline-none"
      />
    );

  return (
    <MDXEditor
      markdown={text}
      onChange={(md, initial) => {
        // The editor tidies the Markdown when it loads; that isn't an edit.
        if (!initial) change(md);
      }}
      autoFocus={focus}
      className="note-editor"
      contentEditableClassName="md-page text-[14px] leading-relaxed"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarContents: () => (
            <>
              <UndoRedo />
              <Separator />
              <BlockTypeSelect />
              <BoldItalicUnderlineToggles />
              <CodeToggle />
              <Separator />
              <ListsToggle />
              <CreateLink />
              <InsertTable />
              <InsertThematicBreak />
            </>
          ),
        }),
      ]}
    />
  );
}
