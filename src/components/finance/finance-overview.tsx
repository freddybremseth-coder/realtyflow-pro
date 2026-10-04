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

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Finance · felles økonomibilde</h2>
          <p className="mt-1 text-sm text-slate-500">Kanonisk ledger + faktura og betaling. Valutaer holdes separate.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Oppdater Finance">
          <RefreshCw size={16}/>
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <Banknote className="text-cyan-400" size={18}/>
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Ledger-poster</p>
          <p className="mt-1 text-2xl font-bold text-white">{overview.eventCount.toLocaleString("nb-NO")}</p>
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
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Siste finanshendelse</p>
          <p className="mt-1 text-lg font-bold text-white">{overview.latestEventDate || "—"}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {currencyRows.map(([code, row]) => (
          <div key={code} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">{code}</h3>
              <span className={row.net >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {row.net >= 0 ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-slate-500">Inntekt</p><p className="font-semibold text-emerald-300">{money(row.income, code)}</p></div>
              <div><p className="text-slate-500">Kostnad</p><p className="font-semibold text-rose-300">{money(row.expense, code)}</p></div>
              <div><p className="text-slate-500">Netto</p><p className="font-semibold text-white">{money(row.net, code)}</p></div>
              <div><p className="text-slate-500">Utestående faktura</p><p className="font-semibold text-amber-300">{money(row.outstanding, code)}</p></div>
            </div>
          </div>
        ))}
      </div>

      {(data.warnings?.length || 0) > 0 && (
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
          Finance lastet med {data.warnings?.length} kildevarsel. Ingen manglende kilde summeres som null uten varsel.
        </div>
      )}
    </section>
  );
}
