"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, FileText, Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import type { FinanceOverview as FinanceOverviewType } from "@/lib/finance/overview";

type ApiResponse = {
  overview?: FinanceOverviewType;
  warnings?: string[];
  error?: string;
};

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("nb-NO", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("nb-NO")}`;
  }
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    crm: "CRM",
    olivia: "Olivia",
    family_mondeo: "Family · Mondeo",
    kdp: "KDP",
    saas: "SaaS",
    manual: "Manuell",
  };
  return labels[source] || source;
}

export function FinanceOverview() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/finance/overview", { cache: "no-store" })
      .then(async (response) => {
        const text = await response.text();
        let body: ApiResponse = {};
        try {
          body = text ? JSON.parse(text) as ApiResponse : {};
        } catch {
          body = { error: response.ok ? "Ugyldig svar fra Finance." : "Finance-datakilden er midlertidig utilgjengelig. Prøv igjen." };
        }
        if (!response.ok) throw new Error(body?.error || "Kunne ikke hente økonomioversikten");
        return body;
      })
      .then(setData)
      .catch((error) => setData({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-400"><Loader2 className="mr-2 inline animate-spin" size={17}/>Laster Finance…</div>;
  }

  if (!data?.overview) {
    return (
      <div className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-5 text-sm text-rose-300">
        <div>{data?.error || "Ingen økonomidata tilgjengelig."}</div>
        <button onClick={load} className="mt-3 rounded-lg border border-rose-700/60 px-3 py-2 font-semibold hover:bg-rose-950/40">
          Prøv igjen
        </button>
      </div>
    );
  }

  const overview = data.overview;
  const currencyRows = Object.entries(overview.currencies);
  const sourceRows = Object.entries(overview.sourceCounts).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Finance · felles økonomibilde</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Faktisk viser hendelser t.o.m. {overview.asOfDate} som ikke er pending eller kansellert.
            Fremtidige og pending poster ligger i Forecast. Valutaer holdes separate.
          </p>
        </div>
        <button onClick={load} className="self-start rounded-xl border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Oppdater Finance">
          <RefreshCw size={16}/>
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <Banknote className="text-cyan-400" size={18}/>
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Ledger-poster</p>
          <p className="mt-1 text-2xl font-bold text-white">{overview.eventCount.toLocaleString("nb-NO")}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <TrendingUp className="text-emerald-400" size={18}/>
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Faktiske poster</p>
          <p className="mt-1 text-2xl font-bold text-white">{overview.actualEventCount.toLocaleString("nb-NO")}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <TrendingDown className="text-amber-400" size={18}/>
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Forecast-poster</p>
          <p className="mt-1 text-2xl font-bold text-white">{overview.forecastEventCount.toLocaleString("nb-NO")}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <FileText className="text-amber-400" size={18}/>
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Åpne fakturaer</p>
          <p className="mt-1 text-2xl font-bold text-white">{overview.outstandingInvoiceCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <AlertTriangle className="text-rose-400" size={18}/>
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Forfalt</p>
          <p className="mt-1 text-2xl font-bold text-white">{overview.overdueInvoiceCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <RefreshCw className="text-emerald-400" size={18}/>
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Siste faktiske hendelse</p>
          <p className="mt-1 text-lg font-bold text-white">{overview.latestEventDate || "—"}</p>
        </div>
      </div>

      {overview.nextForecastEventDate && (
        <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 px-4 py-3 text-sm text-amber-200">
          Neste daterte forecast-hendelse: <span className="font-semibold">{overview.nextForecastEventDate}</span>.
          Den inngår ikke i faktisk inntekt før perioden er nådd og statusen er reell.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {currencyRows.map(([code, row]) => (
          <div key={code} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">{code}</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Faktisk hittil</h3>
              </div>
              <span className={row.net >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {row.net >= 0 ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-xs text-slate-500">Inntekt</p>
                <p className="mt-1 font-semibold text-emerald-300">{money(row.income, code)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-xs text-slate-500">Kostnad</p>
                <p className="mt-1 font-semibold text-rose-300">{money(row.expense, code)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-xs text-slate-500">Netto</p>
                <p className="mt-1 font-semibold text-white">{money(row.net, code)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Cash</p>
                <p className="mt-2 text-sm text-slate-400">Inn <span className="float-right font-semibold text-slate-100">{money(row.cashIn, code)}</span></p>
                <p className="mt-1 text-sm text-slate-400">Ut <span className="float-right font-semibold text-slate-100">{money(row.cashOut, code)}</span></p>
                <p className="mt-2 border-t border-slate-800 pt-2 text-sm text-slate-400">Netto <span className="float-right font-semibold text-white">{money(row.cashNet, code)}</span></p>
              </div>

              <div className="rounded-xl border border-cyan-900/30 bg-cyan-950/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Opptjent · ikke cash</p>
                <p className="mt-2 text-sm text-slate-400">Inntekt <span className="float-right font-semibold text-slate-100">{money(row.accruedIncome, code)}</span></p>
                <p className="mt-1 text-sm text-slate-400">Kostnad <span className="float-right font-semibold text-slate-100">{money(row.accruedExpense, code)}</span></p>
                <p className="mt-2 border-t border-slate-800 pt-2 text-sm text-slate-400">Netto <span className="float-right font-semibold text-white">{money(row.accruedNet, code)}</span></p>
              </div>

              <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Forecast</p>
                <p className="mt-2 text-sm text-slate-400">Inntekt <span className="float-right font-semibold text-slate-100">{money(row.forecastIncome, code)}</span></p>
                <p className="mt-1 text-sm text-slate-400">Kostnad <span className="float-right font-semibold text-slate-100">{money(row.forecastExpense, code)}</span></p>
                <p className="mt-2 border-t border-slate-800 pt-2 text-sm text-slate-400">Netto <span className="float-right font-semibold text-white">{money(row.forecastNet, code)}</span></p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
              <span className="text-slate-500">Utestående faktura</span>
              <span className="font-semibold text-amber-300">{money(row.outstanding, code)}</span>
            </div>
          </div>
        ))}
      </div>

      {overview.mondeo && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Family → RealtyFlow</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Mondeo · autoritativ Family-ledger</h3>
              <p className="mt-1 text-sm text-slate-500">
                Family beregner Mondeo. RealtyFlow viser snapshotet uten å regne lånet på nytt.
              </p>
            </div>
            <p className="text-sm text-slate-500">Status pr. {overview.mondeo.asOfDate || "—"}</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs text-slate-500">Restgjeld</p>
              <p className="mt-1 text-lg font-semibold text-white">{money(overview.mondeo.currentBalance, "NOK")}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs text-slate-500">Mottatte betalinger</p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">{money(overview.mondeo.cashPayments, "NOK")}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs text-slate-500">Kapitalisert rente</p>
              <p className="mt-1 text-lg font-semibold text-cyan-300">{money(overview.mondeo.capitalizedInterest, "NOK")}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs text-slate-500">Renteinntekt i Finance</p>
              <p className="mt-1 text-lg font-semibold text-white">{money(overview.mondeo.totalInterestIncome, "NOK")}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Datakilder i ledgeren</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sourceRows.map(([source, count]) => (
            <span key={source} className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
              {sourceLabel(source)} · {count}
            </span>
          ))}
        </div>
      </div>

      {(data.warnings?.length || 0) > 0 && (
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
          Finance lastet med {data.warnings?.length} kildevarsel. Ingen manglende kilde summeres som null uten varsel.
        </div>
      )}
    </section>
  );
}
