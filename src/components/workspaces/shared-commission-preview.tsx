"use client";

import { useMemo, useState } from "react";
import {
  allocateItemisedSharedCommission, type SharedDealCost,
} from "@/lib/workspaces/commission-sharing";

function money(cents: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency", currency: "EUR", maximumFractionDigits: 2,
  }).format(cents / 100);
}
function euroCents(value: string) {
  const amount = Number(value);
  return value.trim() !== "" && Number.isFinite(amount) && amount >= 0 && amount <= 100_000_000
    ? Math.round(amount * 100) : Number.NaN;
}

type ExpenseDraft = {
  id: string;
  kind: SharedDealCost["kind"];
  amount: string;
  paidBy: SharedDealCost["paidBy"];
  receiptReference: string;
  approved: boolean;
};
const expenseCategories: Array<{ value: ExpenseDraft["kind"]; label: string }> = [
  { value: "fuel", label: "Bensin / transport" },
  { value: "parking", label: "Parkering" },
  { value: "toll", label: "Bompenger" },
  { value: "customer_meeting", label: "Kafé / kundemøte" },
  { value: "other_direct", label: "Andre direkte utlegg" },
];
const payerOptions: Array<{ value: ExpenseDraft["paidBy"]; label: string }> = [
  { value: "freddy", label: "Freddy" },
  { value: "andrea", label: "Andrea" },
  { value: "business", label: "Firmaet direkte" },
];

/** Illustration only. The owner must separately approve real bills and actual commission receipts. */
export function SharedCommissionPreview() {
  const [salePrice, setSalePrice] = useState("500000");
  const [rate, setRate] = useState("7");
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([
    { id: "example-1", kind: "fuel", amount: "900", paidBy: "freddy", receiptReference: "EKSEMPEL-1", approved: true },
    { id: "example-2", kind: "parking", amount: "300", paidBy: "andrea", receiptReference: "EKSEMPEL-2", approved: true },
    { id: "example-3", kind: "customer_meeting", amount: "300", paidBy: "business", receiptReference: "EKSEMPEL-3", approved: true },
  ]);
  const [nextExpenseId, setNextExpenseId] = useState(4);
  const calculation = useMemo(() => {
    const rateNumber = Number(rate);
    const priceCents = euroCents(salePrice);
    if (!Number.isSafeInteger(priceCents) || !Number.isFinite(rateNumber) ||
      rateNumber <= 0 || rateNumber > 100) return null;
    const costs = expenses.map(cost => ({
      ...cost,
      amountCents: euroCents(cost.amount),
    }));
    try {
      return allocateItemisedSharedCommission(
        Math.round(priceCents * rateNumber / 100), costs,
      );
    } catch {
      return null;
    }
  }, [salePrice, rate, expenses]);

  function editExpense(id: string, change: Partial<ExpenseDraft>) {
    setExpenses(current => current.map(item => item.id === id ? { ...item, ...change } : item));
  }
  function addExpense() {
    setExpenses(current => [...current, {
      id: `expense-${nextExpenseId}`, kind: "fuel", amount: "", paidBy: "freddy",
      receiptReference: "", approved: false,
    }]);
    setNextExpenseId(value => value + 1);
  }
  const input = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm";
  return <section className="rounded-2xl border border-cyan-800/60 bg-slate-900 p-5">
    <h2 className="text-xl font-semibold">Zen Eco Homes · felles provisjon – beregning</h2>
    <p className="mt-2 text-sm text-slate-400">Eksempel på et nytt felles salg fra 24.09.2026. Oppgi boligpris og avtalt utbyggerprovisjon. Ved faktisk oppgjør benyttes mottatt utbyggerprovisjon ekskl. eventuell merverdiavgift, ikke estimert boligpris.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-slate-300">Boligpris (€)
        <input type="number" min="0" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} className={input}/>
      </label>
      <label className="text-xs text-slate-300">Provisjon fra utbygger (%)
        <input type="number" min="0" max="100" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className={input}/>
      </label>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Direkte salgsutgifter</h3>
      <button type="button" onClick={addExpense} disabled={expenses.length >= 100}
        className="rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-50">+ Legg til utlegg</button>
    </div>
    <p className="mt-1 text-xs text-slate-400">Alle viste bilagsreferanser er eksempler. Erstatt dem med ekte bilag og godkjenn bare kostnader knyttet til dette salget. Annonser betalt av markedsføringspotten skal ikke føres her.</p>
    <div className="mt-3 space-y-2">
      {expenses.map(expense => <div key={expense.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-300">Type
            <select className={input} value={expense.kind}
              onChange={e => editExpense(expense.id, { kind: e.target.value as ExpenseDraft["kind"] })}>
              {expenseCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">Beløp (€)
            <input type="number" min="0" step="0.01" className={input} value={expense.amount}
              onChange={e => editExpense(expense.id, { amount: e.target.value })}/>
          </label>
          <label className="text-xs text-slate-300">Betalt av
            <select className={input} value={expense.paidBy}
              onChange={e => editExpense(expense.id, { paidBy: e.target.value as ExpenseDraft["paidBy"] })}>
              {payerOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">Bilagsreferanse
            <input className={input} maxLength={100} value={expense.receiptReference}
              onChange={e => editExpense(expense.id, { receiptReference: e.target.value })}/>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={expense.approved}
              onChange={e => editExpense(expense.id, { approved: e.target.checked })}/>
            Godkjent som direkte salgsutgift
          </label>
          <button type="button" onClick={() => setExpenses(current => current.filter(item => item.id !== expense.id))}
            className="text-xs text-rose-300 hover:underline">Fjern utlegget</button>
        </div>
      </div>)}
    </div>
    {calculation ? <div className="mt-4 grid gap-2 rounded-xl border border-slate-700 p-4 text-sm">
      <p>Utbyggerprovisjon: <strong>{money(calculation.developerCommissionReceivedCents)}</strong></p>
      <p>Markedsføring (10 % av provisjonen): <strong>{money(calculation.marketingReserveCents)}</strong></p>
      <p>Godkjente direkte utgifter: <strong>{money(calculation.approvedDirectExpensesCents)}</strong></p>
      <p className="border-t border-slate-700 pt-2">Til fordeling 50/50: <strong>{money(calculation.distributableCents)}</strong></p>
      <div className="grid gap-2 sm:grid-cols-2">
        <p className="rounded-lg bg-cyan-950/40 p-3">Freddys provisjonsandel: <strong>{money(calculation.freddyShareCents)}</strong></p>
        <p className="rounded-lg bg-cyan-950/40 p-3">Andreas provisjonsandel: <strong>{money(calculation.andreaShareCents)}</strong></p>
      </div>
      <p className="pt-2 text-xs text-slate-300">Utlegg som refunderes i tillegg til provisjonsandel: Freddy {money(calculation.freddyExpenseReimbursementCents)}, Andrea {money(calculation.andreaExpenseReimbursementCents)}. Firmaet har allerede betalt {money(calculation.businessPaidExpenseCents)} og skal ikke refundere dette på nytt.</p>
      {calculation.roundingHoldCents > 0 &&
        <p className="text-xs text-slate-400">Avrundingsøre som holdes av: {money(calculation.roundingHoldCents)}</p>}
    </div> : <p role="alert" className="mt-4 text-sm text-amber-300">Kontroller beløp, unike bilagsreferanser, godkjenning og kostnadsgrunnlaget. Utlegg kan ikke overstige provisjonen etter markedsføringsavsetningen.</p>}
    <p className="mt-3 text-xs text-slate-500">Kun et regneeksempel – ingen utlegg blir lagret, og ingen faktura eller utbetaling blir opprettet. Hvert reelle salg må dokumenteres og avstemmes mot faktisk mottatt utbyggerprovisjon før oppgjør.</p>
  </section>;
}
