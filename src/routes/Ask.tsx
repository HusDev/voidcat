import { RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ChatHistory } from "../components/ChatHistory";
import { ChatThread } from "../components/ChatThread";
import { MentionBox } from "../components/MentionBox";
import { ModelPicker, ThinkFirst } from "../components/ModelPicker";
import { type Exchange, type Mention, needsReview, prepare, resume, run } from "../lib/ask";
import {
  CHATS_CHANGED,
  type Chat,
  type Document,
  type Folder,
  LIBRARY_CHANGED,
  announceChats,
  deleteChat,
  getChat,
  listChats,
  listDocuments,
  listFolders,
  saveChat,
} from "../lib/library";
import { Masker } from "../lib/privacy";
import { useAskModel } from "../lib/useAskModel";

const SUGGESTIONS = ["When does my residence card expire?", "What do I pay in rent, and when?", "Which of my documents expire this year?", "Summarise my rental contract"];

export function Ask() {
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  /** What the next question is narrowed to with @ (none = the whole library). Stays for follow-ups. */
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const chatId = params.get("chat");
  /** The conversation on screen; set before the address changes so a new chat isn't reloaded over itself. */
  const showing = useRef<string | null>(null);
  /** What was last stored, so opening a chat doesn't save it again and move it to the top. */
  const stored = useRef("");
  const masker = useRef(new Masker([]));
  const list = useRef<HTMLDivElement>(null);
  // Follow new text only while you're at the bottom, so you can scroll up mid-answer.
  const following = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const { model, choose, local, cloudModel, needsSetup } = useAskModel();

  useEffect(() => {
    input.current?.focus();
    const refresh = () => {
      listDocuments().then(setDocs);
      listFolders().then(setFolders);
    };
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, []);
  useEffect(() => {
    const el = list.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [thread]);

  const refreshChats = () => listChats().then(setChats);
  useEffect(() => {
    refreshChats();
    window.addEventListener(CHATS_CHANGED, refreshChats);
    return () => window.removeEventListener(CHATS_CHANGED, refreshChats);
  }, []);

  // Open the conversation in the address, or a blank one.
  useEffect(() => {
    if (chatId === showing.current) return;
    showing.current = chatId;
    following.current = true;
    if (!chatId) {
      setThread([]);
      setMentions([]);
      masker.current = new Masker([]);
      return;
    }
    let stale = false;
    getChat(chatId).then(async (body) => {
      if (stale) return;
      if (!body) return navigate("/ask", { replace: true });
      const r = await resume(JSON.parse(body) as Exchange[]);
      if (stale) return;
      masker.current = r.masker;
      stored.current = JSON.stringify(r.thread);
      setThread(r.thread);
      // Carry on with what the conversation was narrowed to (a chat started from a document keeps that document).
      setMentions(r.thread[r.thread.length - 1]?.scope ?? []);
    });
    return () => {
      stale = true;
    };
  }, [chatId]);

  // Save the conversation once nothing is waiting on the model or on you.
  useEffect(() => {
    const id = showing.current;
    const finished = thread.filter((e) => e.state === "done" || e.state === "failed");
    if (!id || !finished.length || thread.some((e) => e.state === "sending")) return;
    const body = JSON.stringify(finished);
    if (body === stored.current) return;
    stored.current = body;
    saveChat(id, finished[0].question.slice(0, 120), body).then(announceChats);
  }, [thread]);

  const send = (e: Exchange, earlier: Exchange[]) => run(e, earlier, masker.current, (patch) => setThread((t) => t.map((x) => (x.id === e.id ? { ...x, ...patch } : x))));

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy || !model) return;
    setDraft("");
    setBusy(true);
    following.current = true;
    if (!showing.current) {
      const id = crypto.randomUUID();
      showing.current = id;
      navigate(`/ask?chat=${id}`, { replace: true });
    }
    try {
      const e = await prepare(q, model, masker.current, mentions);
      const earlier = thread;
      setThread((t) => [...t, e]);
      if (!needsReview(e)) await send(e, earlier);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    showing.current = null;
    setThread([]);
    setMentions([]);
    masker.current = new Masker([]);
    navigate("/ask");
    input.current?.focus();
  };

  const remove = async (id: string) => {
    await deleteChat(id);
    if (id === showing.current) restart();
    announceChats();
  };

  return (
    <div className="flex h-full min-h-0 flex-1 gap-6">
      <ChatHistory chats={chats} current={chatId} onNew={restart} onDelete={remove} />
      <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-3 pb-4">
          <h1 className="m-0 text-[30px] font-light tracking-tight">Ask</h1>
          {thread.length > 0 && (
            <button type="button" onClick={restart} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-ink-2 hover:bg-card hover:text-ink">
              <RotateCcw aria-hidden className="size-3.5" /> New conversation
            </button>
          )}
        </header>

        <div
          ref={list}
          onScroll={(ev) => {
            const el = ev.currentTarget;
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-6"
        >
          {thread.length === 0 ? (
            <div className="m-auto flex max-w-lg flex-col items-center gap-4 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-rail text-void">
                <ShieldCheck aria-hidden className="size-6 text-private" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="m-0 text-lg font-semibold">Ask about your documents</p>
                <p className="m-0 text-sm text-ink-2">
                  {model?.provider === "local"
                    ? "A model on this Mac answers. Nothing leaves the computer."
                    : "Names, IDs, addresses and dates are hidden on this Mac before anything is sent. If a question would send something private, you see it first."}
                </p>
              </div>
              {needsSetup ? (
                <Link to="/connections" className="rounded-lg bg-private-soft px-4 py-2.5 text-sm font-semibold text-private-ink hover:underline">
                  Add a model provider to start
                </Link>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button type="button" key={s} onClick={() => ask(s)} className="rounded-full border border-line bg-card px-3.5 py-2 text-[13.5px] hover:border-ink-2">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ChatThread
              thread={thread}
              onSend={send}
              onEdit={(e) => {
                setThread((t) => t.filter((x) => x.id !== e.id));
                setDraft(e.question);
                input.current?.focus();
              }}
            />
          )}
        </div>

        <MentionBox
          value={draft}
          onChange={setDraft}
          mentions={mentions}
          onMentions={setMentions}
          onSubmit={() => ask(draft)}
          docs={docs}
          folders={folders}
          busy={busy}
          disabled={!model}
          placeholder={thread.length ? "Ask a follow-up… (@ to choose files)" : "Ask about your documents… (@ to choose files)"}
          inputRef={input}
          controls={
            <>
              <ModelPicker value={model} onChange={choose} local={local} cloudModel={cloudModel} />
              <ThinkFirst model={model} />
            </>
          }
        />
      </div>
    </div>
  );
}
