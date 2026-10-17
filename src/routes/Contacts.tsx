import { Building2, Check, Copy, EyeOff, LoaderCircle, Pencil, ScanSearch, Search, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LIBRARY_CHANGED, hasLibrary, listDocuments, openDocument } from "../lib/library";
import {
  CATEGORIES,
  CATEGORY_NAMES,
  type Category,
  type Contact,
  type ContactEdit,
  editContact,
  flagContact,
  initials,
  listContacts,
  reachable,
  scanAll,
  unscannedForContacts,
  useScanning,
} from "../lib/people";
import { Private, useVeil } from "../lib/veil";

const button = "inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 text-[12.5px] hover:border-ink-2";
const field = "h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13.5px] outline-none focus:border-accent";

function CopyButton({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard refused: nothing to show */
        }
      }}
      className={button}
    >
      {done ? <Check aria-hidden className="size-3.5 text-ok" /> : <Copy aria-hidden className="size-3.5" />}
      {done ? "Copied" : `Copy ${label}`}
    </button>
  );
}

function EditForm({ c, onDone }: { c: Contact; onDone: () => void }) {
  const [form, setForm] = useState<ContactEdit>({
    name: c.name,
    role: c.role,
    category: c.category,
    organisation: c.organisation,
    phone: c.phone,
    email: c.email,
    address: c.address,
    idNumber: c.idNumber,
  });
  const [error, setError] = useState<string | null>(null);
  const text = (key: keyof ContactEdit, label: string) => (
    <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-2">
      {label}
      <input id={`ct-${key}`} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.currentTarget.value })} className={`${field} font-normal text-ink`} />
    </label>
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await editContact(c.id, form);
          onDone();
        } catch (err) {
          setError(String(err));
        }
      }}
      className="flex flex-col gap-2.5"
    >
      {text("name", "Name")}
      {text("role", "Role")}
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-2">
        Area
        <select id="ct-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.currentTarget.value as Category })} className={`${field} font-normal text-ink`}>
          {CATEGORIES.map((k) => (
            <option key={k} value={k}>
              {CATEGORY_NAMES[k]}
            </option>
          ))}
        </select>
      </label>
      {c.kind === "person" && text("organisation", "Organisation")}
      {text("phone", "Phone")}
      {text("email", "Email")}
      {text("address", "Address")}
      {text("idNumber", "ID number")}
      {error && <span className="text-[12.5px] text-danger">{error}</span>}
      <div className="flex gap-2 pt-1">
        <button type="submit" className="h-9 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-on-accent hover:bg-accent-strong">
          Save
        </button>
        <button type="button" onClick={onDone} className="h-9 px-3 text-[13px] text-ink-2 hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Detail({ c, onChange }: { c: Contact; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmMe, setConfirmMe] = useState(false);
  useEffect(() => {
    setEditing(false);
    setConfirmMe(false);
  }, [c.id]);
  const rows: [string, string | null, boolean][] = [
    ["Organisation", c.organisation, false],
    ["Phone", c.phone, true],
    ["Email", c.email, false],
    ["ID", c.idNumber, true],
    ["Address", c.address, false],
  ];
  return (
    <aside aria-label="Contact" className="sticky top-0 flex w-[340px] shrink-0 flex-col gap-4 self-start rounded-xl border border-line bg-card p-4.5">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-[18px] text-accent">
          {c.kind === "organisation" ? <Building2 aria-hidden className="size-5" /> : initials(c.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[17px] font-bold">
            <Private>{c.name}</Private>
          </span>
          <span className="text-[13px] text-ink-2">
            {[c.role, CATEGORY_NAMES[c.category]].filter(Boolean).join(" · ")}
          </span>
        </span>
      </div>

      {editing ? (
        <EditForm
          c={c}
          onDone={() => {
            setEditing(false);
            onChange();
          }}
        />
      ) : (
        <>
          <dl className="m-0 grid grid-cols-[84px_minmax(0,1fr)] gap-x-2.5 gap-y-2 text-[13.5px]">
            {rows
              .filter(([, v]) => v)
              .map(([k, v, mono]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-2">{k}</dt>
                  <dd data-selectable className={`m-0 break-words ${mono ? "font-mono text-[13px]" : ""}`}>
                    <Private>{v as string}</Private>
                  </dd>
                </div>
              ))}
          </dl>
          {!rows.some(([, v]) => v) && <p className="m-0 text-[13px] text-ink-2">No phone, email or address in the documents.</p>}
          <div className="flex flex-wrap gap-1.5">
            {c.email && <CopyButton label="email" value={c.email} />}
            {c.phone && <CopyButton label="phone" value={c.phone} />}
            <button type="button" onClick={() => setEditing(true)} className={button}>
              <Pencil aria-hidden className="size-3.5" /> Edit
            </button>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-widest text-ink-2">Appears in</span>
        {c.mentions.map((m) => (
          <button key={m.documentId} type="button" onClick={() => openDocument(m.documentId)} className="text-left text-[13.5px] text-link hover:underline">
            <Private>{m.title}</Private>
            {m.pages.length > 0 && <span className="text-ink-2"> · p. {m.pages.join(", ")}</span>}
          </button>
        ))}
        {c.mentions.length === 0 && <span className="text-[13px] text-ink-2">Added by hand.</span>}
      </div>

      {c.kind === "person" && (
        <p className="m-0 rounded-lg bg-private-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-private-ink">
          AIs see this person as a placeholder like <b className="font-mono">[PERSON_3]</b>, never their name, phone or email.
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[12.5px]">
        {c.kind === "person" &&
          (confirmMe ? (
            <span className="flex items-center gap-2">
              Move to Me and leave contacts?
              <button
                type="button"
                onClick={async () => {
                  await flagContact(c.id, "me");
                  onChange();
                }}
                className="font-semibold text-link hover:underline"
              >
                Yes, it's me
              </button>
              <button type="button" onClick={() => setConfirmMe(false)} className="text-ink-2 hover:text-ink">
                No
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmMe(true)} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
              <UserRound aria-hidden className="size-3.5" /> This is me
            </button>
          ))}
        <button
          type="button"
          onClick={async () => {
            await flagContact(c.id, "hidden");
            onChange();
          }}
          className="inline-flex items-center gap-1 text-ink-2 hover:text-ink"
        >
          <EyeOff aria-hidden className="size-3.5" /> Hide from contacts
        </button>
      </div>
    </aside>
  );
}

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unscanned, setUnscanned] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<Category | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanning = useScanning();
  const veil = useVeil();

  const refresh = useCallback(() => {
    listContacts().then((all) => setContacts(all.filter(reachable)));
    unscannedForContacts().then(setUnscanned);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(LIBRARY_CHANGED, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED, refresh);
  }, [refresh]);

  const scan = async () => {
    setError(null);
    const docs = await listDocuments();
    try {
      await scanAll(docs.filter((d) => unscanned.includes(d.id)).map((d) => ({ id: d.id, title: d.title })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    refresh();
  };

  const q = query.trim().toLowerCase();
  const shown = contacts.filter(
    (c) =>
      (area === "all" || c.category === area) &&
      (!q || [c.name, c.role, c.organisation, c.email].some((v) => v?.toLowerCase().includes(q))),
  );
  const areas = CATEGORIES.filter((k) => contacts.some((c) => c.category === k));
  const current = shown.find((c) => c.id === selected) ?? shown[0] ?? null;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[30px] font-light tracking-tight">Contacts</h1>
          <span className="text-sm text-ink-2">
            {contacts.length
              ? `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"} with an email or phone number, found in your documents`
              : "People and organisations you can reach, found in your documents on this Mac."}
          </span>
        </div>
        <label htmlFor="contacts-q" className="ml-auto flex h-10 w-72 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-ink-2 focus-within:border-accent">
          <Search aria-hidden className="size-4" />
          <span className="sr-only">Search contacts</span>
          <input id="contacts-q" value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Search contacts…" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
        </label>
      </header>

      {(unscanned.length > 0 || scanning) && hasLibrary && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3 text-[13.5px]">
          {scanning ? (
            <>
              <LoaderCircle aria-hidden className="size-4 animate-spin text-accent" />
              Reading contacts on this Mac… {scanning.done} of {scanning.total} documents
            </>
          ) : (
            <>
              <span>
                {unscanned.length} {unscanned.length === 1 ? "document hasn't" : "documents haven't"} been read for contacts yet.
              </span>
              <button type="button" onClick={scan} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-strong">
                <ScanSearch aria-hidden className="size-4" /> Find contacts
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}

      {areas.length > 1 && (
        <div role="tablist" aria-label="Areas" className="flex flex-wrap gap-1.5">
          {(["all", ...areas] as const).map((a) => (
            <button
              type="button"
              role="tab"
              key={a}
              aria-selected={area === a}
              onClick={() => setArea(a)}
              className={`rounded-full px-3 py-1.5 text-[13px] ${area === a ? "bg-accent font-semibold text-on-accent" : "bg-card text-ink hover:bg-card/70"}`}
            >
              {a === "all" ? "All" : CATEGORY_NAMES[a]}
            </button>
          ))}
        </div>
      )}

      {contacts.length === 0 && !scanning && (
        <div className="rounded-xl border border-line bg-card px-5 py-8 text-sm text-ink-2">
          No contacts yet. Only people and organisations with an email or phone number in your documents appear here. New documents are read after they're filed; use Find contacts for the ones you already have.
        </div>
      )}

      {shown.length > 0 && (
        <div className="flex items-start gap-5">
          <ul className="m-0 flex min-w-0 flex-1 list-none flex-col overflow-hidden rounded-xl border border-line bg-card p-0">
            {shown.map((c) => (
              <li key={c.id} className="border-t border-line first:border-t-0">
                <button
                  type="button"
                  onClick={() => setSelected(c.id)}
                  aria-current={current?.id === c.id || undefined}
                  className={`grid w-full grid-cols-[34px_minmax(0,1fr)_110px_100px] items-center gap-3 px-3.5 py-2.5 text-left ${current?.id === c.id ? "bg-accent-soft" : "hover:bg-ground"}`}
                >
                  <span className="grid size-[34px] place-items-center rounded-full bg-ground text-[12.5px] font-semibold text-ink-2">
                    {c.kind === "organisation" ? <Building2 aria-hidden className="size-4" /> : veil.on ? "•" : initials(c.name)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14.5px] font-semibold">
                      <Private>{c.name}</Private>
                    </span>
                    <span className="truncate text-[12.5px] text-ink-2">
                      {c.role && `${c.role} · `}
                      <Private>{c.email ?? c.phone ?? ""}</Private>
                    </span>
                  </span>
                  <span className="text-[12.5px] text-ink-2">{CATEGORY_NAMES[c.category]}</span>
                  <span className="text-right text-[12.5px] text-ink-2">
                    {c.mentions.length} {c.mentions.length === 1 ? "document" : "documents"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {current && <Detail c={current} onChange={refresh} />}
        </div>
      )}
      {contacts.length > 0 && shown.length === 0 && <p className="m-0 text-sm text-ink-2">No contacts match.</p>}
    </div>
  );
}
