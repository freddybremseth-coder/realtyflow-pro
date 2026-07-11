"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Printer,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import type { MonthlyCloseReport } from "@/lib/revenue/monthly-close";

const SCOPES = [
  { id: "all", label: "Alle revenue-brands" },
  { id: "zeneco", label: "Zen Eco Homes" },
  { id: "soleada", label: "Soleada.no" },
  { id: "pinosoecolife", label: "Pinoso EcoLife" },
  { id: "keyholding", label: "Keyholding" },
];

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "Måneden pågår",
  REVIEW_REQUIRED: "Krever gjennomgang",
  READY_TO_CLOSE: "Klar for intern avslutning",
  PASS: "OK",
  WARNING: "Advarsel",
  BLOCKED: "Blokkert",
  INFO: "Informasjon",
  UNSET: "Ikke satt",
  ACHIEVED: "Nådd",
  ON_TRACK: "I rute",
  AT_RISK: "I risiko",
  BEHIND: "Etter plan",
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function euro(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}

function number(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(value || 0);
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)} %`;
}

function multiple(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}x`;
}

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function Card({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Banknote }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500"><Icon size={15} />{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{detail}</div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const styles = status === "PASS" || status === "ACHIEVED" || status === "READY_TO_CLOSE"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : status === "BLOCKED" || status === "BEHIND" || status === "REVIEW_REQUIRED"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : status === "WARNING" || status === "AT_RISK"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-sky-500/30 bg-sky-500/10 text-sky-300";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}>{STATUS_LABELS[status] || status}</span>;
}

export default function MonthlyClosePage() {
  const [month, setMonth] = useState(currentMonth());
  const [scope, setScope] = useState("all");
  const [report, setReport] = useState<MonthlyCloseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/revenue/monthly-close?month=${encodeURIComponent(month)}&scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunne ikke hente månedsrapporten");
      setReport(payload.report);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ukjent feil");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [month, scope]);

  useEffect(() => { void load(); }, [load]);

  const sourceRows = useMemo(() => report?.marketing.sources.filter((item) => item.leads > 0 || item.spendEur > 0) || [], [report]);

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ["Financial Reporting & Monthly Close"],
      ["Month", report.period.month],
      ["Scope", report.scope],
      ["Close status", STATUS_LABELS[report.closeStatus]],
      [],
      ["Summary", "Amount"],
      ["Earned commission", report.summary.earnedCommission],
      ["Invoiced commission", report.summary.invoicedCommission],
      ["Collected commission", report.summary.collectedCommission],
      ["Marketing spend", report.summary.marketingSpend],
      ["Marketing contribution", report.summary.marketingContribution],
      ["Month-end Keyholding MRR", report.summary.monthEndKeyholdingMrr],
      [],
      ["Deal", "Brand", "Won", "Invoice sent", "Paid", "Invoice", "Deal value", "Commission", "Confirmed"],
      ...report.deals.map((item) => [item.name, item.brandId, item.wonAt || "", item.invoiceSentAt || "", item.paidAt || "", item.invoiceNumber || "", item.dealValue, item.commissionAmount, item.commissionConfirmed ? "Yes" : "No"]),
      [],
      ["Source", "Leads", "Won", "Spend", "Earned commission", "Collected commission", "Earned ROAS", "Cash ROAS"],
      ...sourceRows.map((item) => [item.label, item.leads, item.won, item.spendEur, item.confirmedCommission, item.collectedCommission, item.earnedRoas ?? "", item.cashRoas ?? ""]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revenue-monthly-close-${report.period.month}-${report.scope}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-16 lg:p-8 print:max-w-none print:bg-white print:text-black">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2 text-sm text-emerald-400"><FileSpreadsheet size={18} /> Freddy Revenue OS</div>
          <h1 className="mt-1 text-3xl font-bold text-white">Financial Reporting & Monthly Close</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Intern månedsrapport med tydelig skille mellom opptjent, fakturert og innbetalt provisjon. Rapporten bokfører, fakturerer eller sender ingenting.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          <select value={scope} onChange={(event) => setScope(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
            {SCOPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button onClick={() => void load()} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:text-white" title="Oppdater"><RefreshCw size={18} /></button>
          <button onClick={exportCsv} disabled={!report} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"><Download size={16} /> CSV</button>
          <button onClick={() => window.print()} disabled={!report} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"><Printer size={16} /> Skriv ut</button>
        </div>
      </div>

      {loading && <div className="flex min-h-64 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" /> Henter månedsrapport…</div>}
      {error && !loading && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200"><AlertTriangle className="mr-2 inline" size={18} />{error}</div>}

      {report && !loading && (
        <>
          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-5 print:border-slate-300 print:bg-white">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2"><Badge status={report.closeStatus} /><span className="text-sm text-slate-400 print:text-slate-600">{report.period.month} · {SCOPES.find((item) => item.id === report.scope)?.label}</span></div>
                <h2 className="mt-3 text-xl font-semibold text-white print:text-black">{report.headline}</h2>
              </div>
              <div className="text-right text-xs text-slate-500">Generert {new Date(report.generatedAt).toLocaleString("nb-NO")}<br />Periode fullført: {report.period.isComplete ? "Ja" : `${report.period.elapsedPercent} %`}</div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Opptjent provisjon" value={euro(report.summary.earnedCommission)} detail={`${report.summary.wonDeals} vunne salg · ${euro(report.summary.estimatedCommissionExcluded)} estimert og utelatt`} icon={TrendingUp} />
            <Card label="Fakturert provisjon" value={euro(report.summary.invoicedCommission)} detail={`${report.commission.earnedWithoutInvoiceCount} månedssalg ikke registrert fakturert`} icon={FileSpreadsheet} />
            <Card label="Innbetalt provisjon" value={euro(report.summary.collectedCommission)} detail={`Dagens collection rate: ${percent(report.summary.currentCollectionRate === null ? null : report.summary.currentCollectionRate * 100)}`} icon={Banknote} />
            <Card label="Keyholding MRR" value={euro(report.summary.monthEndKeyholdingMrr)} detail={`${report.keyholding.activeAtMonthEnd} aktive ved månedsslutt · ARR ${euro(report.summary.monthEndKeyholdingArr)}`} icon={KeyRound} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 print:border-slate-300 print:bg-white">
              <h2 className="flex items-center gap-2 font-semibold text-white print:text-black"><Banknote size={18} /> Provisjonsbro</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Salgsverdi", euro(report.summary.dealValue)],
                  ["Opptjent", euro(report.summary.earnedCommission)],
                  ["Fakturert", euro(report.summary.invoicedCommission)],
                  ["Innbetalt", euro(report.summary.collectedCommission)],
                  ["Utestående nå", euro(report.summary.currentOutstandingCommission)],
                  ["Forfalt nå", euro(report.summary.currentOverdueCommission)],
                ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-800/60 p-3 print:bg-slate-100"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-white print:text-black">{value}</div></div>)}
              </div>
              <p className="mt-3 text-xs text-slate-500">{report.commission.currentOutstandingNote}</p>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 print:border-slate-300 print:bg-white">
              <h2 className="flex items-center gap-2 font-semibold text-white print:text-black"><Target size={18} /> Kanaløkonomi</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Markedsføringskostnad", euro(report.summary.marketingSpend)],
                  ["Marketing contribution", euro(report.summary.marketingContribution)],
                  ["Cash after marketing", euro(report.summary.cashAfterMarketing)],
                  ["Kohort earned ROAS", multiple(report.summary.cohortEarnedRoas)],
                  ["Kohort cash ROAS", multiple(report.summary.cohortCashRoas)],
                  ["Kjent kilde", percent(report.marketing.summary.knownSourceSharePercent)],
                ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-800/60 p-3 print:bg-slate-100"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-white print:text-black">{value}</div></div>)}
              </div>
              <p className="mt-3 text-xs text-slate-500">ROAS følger lead-kohorten, mens provisjonsbroen følger faktiske salgs-, faktura- og betalingsdatoer.</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 print:border-slate-300 print:bg-white">
            <h2 className="flex items-center gap-2 font-semibold text-white print:text-black"><CheckCircle2 size={18} /> Månedsavslutning</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {report.checks.map((item) => (
                <Link key={item.id} href={item.href} className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3 hover:border-slate-500 print:border-slate-300 print:bg-white">
                  <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-200 print:text-black">{item.label}</span><Badge status={item.status} /></div>
                  <p className="mt-2 text-xs text-slate-400 print:text-slate-600">{item.detail}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 print:border-slate-300 print:bg-white">
              <h2 className="font-semibold text-white print:text-black">Måloppnåelse</h2>
              <div className="mt-3 space-y-3">
                {report.goals.map((item) => (
                  <div key={item.id} className="rounded-lg bg-slate-800/50 p-3 print:bg-slate-100">
                    <div className="flex items-center justify-between"><span className="text-sm text-slate-200 print:text-black">{item.label}</span><Badge status={item.status} /></div>
                    <div className="mt-2 flex items-end justify-between"><span className="text-lg font-semibold text-white print:text-black">{item.unit === "EUR" ? euro(item.actual) : number(item.actual)}</span><span className="text-xs text-slate-500">Mål: {item.target === null ? "ikke satt" : item.unit === "EUR" ? euro(item.target) : number(item.target)} · {item.progressPercent === null ? "—" : `${item.progressPercent} %`}</span></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 print:border-slate-300 print:bg-white">
              <h2 className="font-semibold text-white print:text-black">Keyholding-bevegelser</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Aktive ved månedsslutt", number(report.keyholding.activeAtMonthEnd)],
                  ["MRR ved månedsslutt", euro(report.summary.monthEndKeyholdingMrr)],
                  ["Nye avtaler", number(report.summary.newKeyholdingContracts)],
                  ["Fornyet", number(report.summary.renewedKeyholdingContracts)],
                  ["Pauset", number(report.summary.pausedKeyholdingContracts)],
                  ["Avsluttet", number(report.summary.cancelledKeyholdingContracts)],
                  ["Dagens MRR", euro(report.keyholding.currentMrr)],
                  ["Dagens potensielle MRR", euro(report.keyholding.potentialCurrentMrr)],
                ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-800/50 p-3 print:bg-slate-100"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-white print:text-black">{value}</div></div>)}
              </div>
            </div>
          </section>

          {report.brands.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/70 print:border-slate-300 print:bg-white">
              <div className="p-5"><h2 className="font-semibold text-white print:text-black">Resultat per brand</h2></div>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-800/60 text-xs uppercase text-slate-500 print:bg-slate-100"><tr><th className="px-4 py-3">Brand</th><th className="px-4 py-3">Salg</th><th className="px-4 py-3">Salgsverdi</th><th className="px-4 py-3">Opptjent</th><th className="px-4 py-3">Fakturert</th><th className="px-4 py-3">Innbetalt</th></tr></thead><tbody>{report.brands.map((item) => <tr key={item.brandId} className="border-t border-slate-800 print:border-slate-200"><td className="px-4 py-3 font-medium text-white print:text-black">{item.brandId}</td><td className="px-4 py-3 text-slate-300 print:text-black">{item.wonDeals}</td><td className="px-4 py-3 text-slate-300 print:text-black">{euro(item.dealValue)}</td><td className="px-4 py-3 text-slate-300 print:text-black">{euro(item.earnedCommission)}</td><td className="px-4 py-3 text-slate-300 print:text-black">{euro(item.invoicedCommission)}</td><td className="px-4 py-3 text-slate-300 print:text-black">{euro(item.collectedCommission)}</td></tr>)}</tbody></table></div>
            </section>
          )}

          {sourceRows.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/70 print:border-slate-300 print:bg-white">
              <div className="p-5"><h2 className="font-semibold text-white print:text-black">Kanalresultater for månedens lead-kohort</h2></div>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-800/60 text-xs uppercase text-slate-500 print:bg-slate-100"><tr><th className="px-4 py-3">Kilde</th><th className="px-4 py-3">Leads</th><th className="px-4 py-3">Vunnet</th><th className="px-4 py-3">Kostnad</th><th className="px-4 py-3">Opptjent</th><th className="px-4 py-3">ROAS</th></tr></thead><tbody>{sourceRows.map((item) => <tr key={item.sourceId} className="border-t border-slate-800 print:border-slate-200"><td className="px-4 py-3 font-medium text-white print:text-black">{item.label}</td><td className="px-4 py-3 text-slate-300 print:text-black">{item.leads}</td><td className="px-4 py-3 text-slate-300 print:text-black">{item.won}</td><td className="px-4 py-3 text-slate-300 print:text-black">{euro(item.spendEur)}</td><td className="px-4 py-3 text-slate-300 print:text-black">{euro(item.confirmedCommission)}</td><td className="px-4 py-3 text-slate-300 print:text-black">{multiple(item.earnedRoas)}</td></tr>)}</tbody></table></div>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/70 print:border-slate-300 print:bg-white">
            <div className="p-5"><h2 className="font-semibold text-white print:text-black">Provisjonsaktiviteter i perioden</h2><p className="mt-1 text-xs text-slate-500">Inkluderer saker med salg, fakturering eller innbetaling i valgt måned.</p></div>
            {report.deals.length === 0 ? <div className="border-t border-slate-800 p-6 text-sm text-slate-500">Ingen provisjonsaktiviteter registrert i perioden.</div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-800/60 text-xs uppercase text-slate-500 print:bg-slate-100"><tr><th className="px-4 py-3">Kunde</th><th className="px-4 py-3">Brand</th><th className="px-4 py-3">Salg</th><th className="px-4 py-3">Faktura</th><th className="px-4 py-3">Betalt</th><th className="px-4 py-3">Provisjon</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{report.deals.map((item) => <tr key={item.id} className="border-t border-slate-800 print:border-slate-200"><td className="px-4 py-3"><Link href={item.href} className="font-medium text-emerald-300 hover:underline print:text-black">{item.name}</Link></td><td className="px-4 py-3 text-slate-400 print:text-black">{item.brandId}</td><td className="px-4 py-3 text-slate-300 print:text-black">{item.earnedInPeriod ? date(item.wonAt) : "—"}</td><td className="px-4 py-3 text-slate-300 print:text-black">{item.invoicedInPeriod ? `${date(item.invoiceSentAt)}${item.invoiceNumber ? ` · ${item.invoiceNumber}` : ""}` : "—"}</td><td className="px-4 py-3 text-slate-300 print:text-black">{item.collectedInPeriod ? date(item.paidAt) : "—"}</td><td className="px-4 py-3 text-slate-300 print:text-black">{item.commissionConfirmed ? euro(item.commissionAmount) : `${euro(item.commissionAmount)} estimert`}</td><td className="px-4 py-3"><Badge status={item.currentStatus} /></td></tr>)}</tbody></table></div>}
          </section>

          {(report.warnings.length > 0 || report.assumptions.length > 0) && (
            <section className="grid gap-4 lg:grid-cols-2 print:block">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 print:border-slate-300 print:bg-white"><h2 className="font-semibold text-amber-200 print:text-black">Varsler</h2><ul className="mt-3 space-y-2 text-xs text-slate-400 print:text-slate-700">{report.warnings.length ? report.warnings.map((item) => <li key={item}>• {item}</li>) : <li>• Ingen tekniske datavarsler.</li>}</ul></div>
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 print:border-slate-300 print:bg-white"><h2 className="font-semibold text-white print:text-black">Forutsetninger</h2><ul className="mt-3 space-y-2 text-xs text-slate-400 print:text-slate-700">{report.assumptions.map((item) => <li key={item}>• {item}</li>)}</ul></div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
