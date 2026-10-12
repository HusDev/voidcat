import { CheckCheck } from "lucide-react";
import type { PendingFact } from "../lib/sample";

const quiet = "h-10 rounded-lg border border-[#d3d8dd] bg-card px-3.5 text-sm text-ink hover:border-ink-2";

export function Inbox({ facts, onSettle }: { facts: PendingFact[]; onSettle: (id: string) => void }) {
  return (
    <div className="flex gap-6">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[26px] font-bold tracking-tight">Facts to approve</h1>
          <span className="text-sm text-ink-2">Nothing becomes a fact until you approve it. Each one shows where it came from.</span>
        </header>

        {facts.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-5 py-6 text-sm text-ink-2">
            <CheckCheck aria-hidden className="size-5 text-ok" /> All caught up. New facts appear here when you drop in a document.
          </div>
        )}

        {facts.map((f) => (
          <article key={f.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-card px-4.5 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">{f.label}</span>
              <span data-selectable className="text-[17px] font-semibold">
                {f.value}
              </span>
              <span className="text-[13px] text-ink-2">From {f.source} · read on this Mac</span>
            </div>
            <button type="button" className={quiet}>
              Edit
            </button>
            <button type="button" onClick={() => onSettle(f.id)} className={quiet}>
              Reject
            </button>
            <button type="button" onClick={() => onSettle(f.id)} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-rail-2">
              Approve
            </button>
          </article>
        ))}
      </section>

      <aside aria-label="Source page" className="hidden w-85 shrink-0 flex-col gap-3 xl:flex">
        <span className="text-[13px] font-semibold text-ink-2">rental_contract_signed.pdf · page 1</span>
        <div data-selectable className="flex flex-col gap-3 rounded-xl border border-line bg-card px-6.5 py-7 text-xs leading-relaxed text-[#3c444d]">
          <span className="text-center text-[13px] font-bold text-ink">CONTRATO DE ARRENDAMIENTO DE VIVIENDA</span>
          <span>En Barcelona, a 12 de octubre de 2026.</span>
          <span>
            La duración del contrato será de un año a contar desde el <mark className="bg-[#fbe3ae] px-0.5">1 de noviembre de 2026</mark>, prorrogable anualmente.
          </span>
          <span>
            La renta mensual se fija en <mark className="bg-[#fbe3ae] px-0.5">1.150 euros</mark>, pagaderos dentro de los siete primeros días de cada mes.
          </span>
          <span>
            La parte arrendataria entrega en este acto la cantidad de <mark className="bg-[#fbe3ae] px-0.5">2.300 euros</mark> en concepto de fianza.
          </span>
        </div>
        <span className="text-[12.5px] text-ink-2">Read on this Mac. This page was not sent to any AI.</span>
      </aside>
    </div>
  );
}
