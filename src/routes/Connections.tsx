import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { type Access, accessLabel, ais } from "../lib/sample";

const Mask = ({ children }: { children: string }) => <span className="rounded bg-[#3a3220] px-1.5 py-px text-private">{children}</span>;

export function Connections() {
  const [access, setAccess] = useState<Record<string, Access>>(Object.fromEntries(ais.map((a) => [a.id, a.access])));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[26px] font-bold tracking-tight">Connected AIs</h1>
          <span className="text-sm text-ink-2">Any AI can use your library. You decide what each one sees.</span>
        </div>
        <button type="button" className="ml-auto h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2">
          Connect an AI
        </button>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {ais.map((ai) => (
          <article key={ai.id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{ai.name}</span>
              <span role="img" aria-label="Connected" className="size-2 rounded-full bg-[#2f9e62]" />
            </div>
            <span className="text-[13px] text-ink-2">{ai.how}</span>
            <Listbox value={access[ai.id]} onChange={(v: Access) => setAccess((a) => ({ ...a, [ai.id]: v }))}>
              <div className="relative">
                <span className="mb-1 block text-xs font-semibold text-ink-2">Sees</span>
                <ListboxButton className="flex h-9 w-full items-center justify-between rounded-lg border border-[#d3d8dd] bg-card px-2.5 text-left text-[13.5px] font-medium">
                  {accessLabel[access[ai.id]]}
                  <ChevronDown aria-hidden className="size-4 text-ink-2" />
                </ListboxButton>
                <ListboxOptions anchor="bottom start" className="z-10 w-(--button-width) rounded-lg border border-line bg-card p-1 shadow-lg [--anchor-gap:4px] focus:outline-none">
                  {(Object.keys(accessLabel) as Access[])
                    .filter((k) => k !== "everything" || ai.local)
                    .map((k) => (
                      <ListboxOption key={k} value={k} className="group flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] data-focus:bg-ground">
                        <Check aria-hidden className="invisible size-4 group-data-selected:visible" />
                        {accessLabel[k]}
                      </ListboxOption>
                    ))}
                </ListboxOptions>
              </div>
            </Listbox>
          </article>
        ))}
      </div>

      <section aria-label="Privacy preview" className="grid gap-3.5 lg:grid-cols-2">
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">You asked Claude</span>
          <p className="m-0 text-[15px] leading-relaxed">When does my residence card expire, and what do I need to renew it?</p>
          <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-2">What Claude received</span>
          <p className="m-0 rounded-lg bg-ink p-3.5 font-mono text-[13px] leading-loose text-rail-ink">
            <Mask>[PERSON_1]</Mask> holds residence card <Mask>[ID_2]</Mask>, valid for about 5 more months. Address: <Mask>[ADDRESS_1]</Mask>, registered with
            the city since <Mask>[DATE_3]</Mask>.
          </p>
          <span className="text-[12.5px] text-ink-2">4 private details hidden on this Mac before sending.</span>
        </div>
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">The answer you see</span>
          <p className="m-0 text-[15px] leading-relaxed">
            Your card <b className="font-mono">E10293847</b> expires on <b>16 Mar 2027</b>. Book the renewal from mid-January. You'll need:
          </p>
          <ul className="m-0 pl-5 text-[14.5px] leading-loose">
            <li>
              Your passport <span className="font-semibold text-ok">· in library</span>
            </li>
            <li>
              Proof of address <span className="font-semibold text-ok">· in library</span>
            </li>
            <li>
              Last 3 payslips <span className="font-semibold text-private-ink">· 1 missing</span>
            </li>
            <li>
              Fee payment receipt <span className="font-semibold text-private-ink">· to do</span>
            </li>
          </ul>
          <span className="mt-auto text-[12.5px] text-ink-2">Real details put back on this Mac. Sources: Residence card p. 1, Padrón certificate p. 1.</span>
        </div>
      </section>
    </div>
  );
}
