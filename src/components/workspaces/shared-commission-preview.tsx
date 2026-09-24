"use client";

import { useMemo, useState } from "react";
import { allocateSharedCommission } from "@/lib/workspaces/commission-sharing";

function money(cents: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency", currency: "EUR", maximumFractionDigits: 2,
  }).format(cents / 100);
}
function euroCents(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100_000_000
    ? Math.round(amount * 100) : Number.NaN;
}

/** An owner-facing illustration only; no invoices, users, grants or payments are written. */
export function SharedCommissionPreview() {
  const [salePrice, setSalePrice] = useState("500000");
  const [rate, setRate] = useState("7");
  const [expenses, setExpenses] = useState("1500");
  const calculation = useMemo(() => {
    const rateNumber = Number(rate);
    const priceCents = euroCents(salePrice);
    const expenseCents = euroCents(expenses);
    if (!Number.isSafeInteger(priceCents) || !Number.isFinite(rateNumber) ||
      rateNumber <= 0 || rateNumber > 100 || !Number.isSafeInteger(expenseCents))
      return null;
    try {
      return allocateSharedCommission({
        developerCommissionReceivedCents: Math.round(priceCents * rateNumber / 100),
        approvedDirectExpensesCents: expenseCents,
      });
    } catch {
      return null;
    }
  }, [salePrice, rate, expenses]);
  const input = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm";
  return <section className="rounded-2xl border border-cyan-800/60 bg-slate-900 p-5">
    <h2 className="text-xl font-semibold">Zen Eco Homes · provisjon – eksempel</h2>
    <p className="mt-2 text-sm text-slate-400">Freddy og Andrea deler nye felles salg fra 24.09.2026. Legg inn avtalt utbyggerprovisjon og godkjente direkte salgsutgifter. 10 % av faktisk mottatt provisjon går til markedsføring før resten deles likt.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="text-xs text-slate-300">Boligpris (€)<input type="number" min="0" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} className={input}/></label>
      <label className="text-xs text-slate-300">Provisjon fra utbygger (%)<input type="number" min="0" max="100" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className={input}/></label>
      <label className="text-xs text-slate-300">Godkjente salgsutgifter (€)<input type="number" min="0" step="0.01" value={expenses} onChange={e => setExpenses(e.target.value)} className={input}/></label>
    </div>
    {calculation ? <div className="mt-4 grid gap-2 rounded-xl border border-slate-700 p-4 text-sm">
      <p>Utbyggerprovisjon: <strong>{money(calculation.developerCommissionReceivedCents)}</strong></p>
      <p>10 % markedsføringsreserve: <strong>{money(calculation.marketingReserveCents)}</strong></p>
      <p>Godkjente utgifter, refunderes til betaleren: <strong>{money(calculation.approvedDirectExpensesCents)}</strong></p>
      <p>Til fordeling: <strong>{money(calculation.distributableCents)}</strong></p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <p className="rounded-lg bg-cyan-950/40 p-3">Freddy: <strong>{money(calculation.freddyShareCents)}</strong></p>
        <p className="rounded-lg bg-cyan-950/40 p-3">Andrea: <strong>{money(calculation.andreaShareCents)}</strong></p>
      </div>
      {calculation.roundingHoldCents > 0 && <p>Ufordelt avrundingsøre: {money(calculation.roundingHoldCents)}</p>}
    </div> : <p role="alert" className="mt-3 text-sm text-amber-300">Kontroller beløp og prosent. Kostnader kan ikke overstige provisjonen etter markedsføringsavsetning.</p>}
    <p className="mt-3 text-xs text-slate-500">Kun illustrasjon. Ingen avtale, faktura, CRM-endring eller utbetaling opprettes. Provisjonsgrunnlaget ved oppgjør er faktisk innbetalt utbyggerprovisjon eksklusive eventuell merverdiavgift. Utlegg refunderes separat til den som betalte dem, ikke to ganger. Faktiske beløp, bilag og eventuelle tilbakeføringer må avstemmes før fordeling.</p>
  </section>;
}
