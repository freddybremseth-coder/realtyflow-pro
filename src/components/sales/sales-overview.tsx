"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CircleDollarSign,
  Flame,
  Loader2,
  RefreshCw,
  Target,
  UserPlus,
  Users,
} from "lucide-react";

type RevenueInbox = {
  summary: {
    activeLeads: number;
    newLeads: number;
    overdueFollowups: number;
    hotSignals: number;
    hotLeads?: number;
    hotLeadSlaOverdue?: number;
    closingOpportunities: number;
    missingNextAction: number;
    totalPipelineValue: number;
    knownCommissionRevenue: number;
    commissionCoveragePct: number;
    openWorkItems: number;
  };
  recommendedPlay: null | {
    title: string;
    primaryAction: string;
    reason: string;
    href: string;
    priority: string;
    score: number;
  };
  priorities: Array<{
    id: string;
    contactName: string;
    stage: string;
    brandId: string;
    priority: string;
    score: number;
    reason: string;
    recommendedAction: string;
    href: string;
  }>;
  warnings: string[];
};

function eur(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value || 0);
}

export function SalesOverview() {
  const [data, setData] = useState<RevenueInbox | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError("");
    fetch("/api/revenue/today", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Kunne ikke hente salgsstatus");
        return body as RevenueInbox;
      })
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-400"><Loader2 className="mr-2 inline animate-spin" size={17}/>Laster Sales…</div>;
  }

  if (!data) {
    return <div className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-5 text-sm text-rose-300">{error || "Ingen salgsdata tilgjengelig."}</div>;
  }

  const cards = [
    ["Aktive leads", data.summary.activeLeads, Users],
    ["Nye leads", data.summary.newLeads, UserPlus],
    ["Varme signaler", data.summary.hotSignals, Flame],
    ["Mot closing", data.summary.closingOpportunities, Target],
    ["Pipeline", eur(data.summary.totalPipelineValue), Building2],
    ["Kjent provisjon", eur(data.summary.knownCommissionRevenue), CircleDollarSign],
  ] as const;

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Sales · hva trenger handling nå?</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Den eksisterende Revenue Inbox er Sales sin daglige prioriteringsmotor. CRM, Lead Intelligence, eiendommer og closing bruker samme kundeminne.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Oppdater Sales">
          <RefreshCw size={16}/>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <Icon className="text-cyan-400" size={18}/>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-white">{typeof value === "number" ? value.toLocaleString("nb-NO") : value}</p>
          </div>
        ))}
      </div>

      {(data.summary.overdueFollowups > 0 || data.summary.missingNextAction > 0 || (data.summary.hotLeadSlaOverdue || 0) > 0) && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 shrink-0" size={18}/>
          <div>
            <strong>Oppfølging krever oppmerksomhet.</strong>
            <p className="mt-1 text-amber-300/80">{data.summary.overdueFollowups} forsinket · {data.summary.missingNextAction} mangler neste steg · {data.summary.hotLeadSlaOverdue || 0} varme leads over SLA.</p>
          </div>
        </div>
      )}

      {data.recommendedPlay && (
        <Link href={data.recommendedPlay.href} className="group block rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-5 hover:border-emerald-500/60">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Anbefalt neste salgssteg</p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{data.recommendedPlay.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{data.recommendedPlay.primaryAction}</p>
              <p className="mt-2 text-xs text-slate-500">{data.recommendedPlay.reason}</p>
            </div>
            <ArrowRight className="mt-1 shrink-0 text-emerald-400 transition group-hover:translate-x-1" size={20}/>
          </div>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Høyest prioriterte kunder</h3>
            <Link href="/today" className="text-xs font-semibold text-cyan-300 hover:underline">Åpne full Sales Inbox</Link>
          </div>
          <div className="mt-4 space-y-2">
            {data.priorities.slice(0, 5).map((item) => (
              <Link key={item.id} href={item.href} className="block rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-cyan-500/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-100">{item.contactName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.brandId} · {item.stage}</p>
                  </div>
                  <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300">{item.score}</span>
                </div>
              </Link>
            ))}
            {data.priorities.length === 0 && <p className="text-sm text-slate-500">Ingen aktive salgsprioriteringer.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="font-semibold text-white">Én kundereise</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">Lead Intelligence strukturerer behov. CRM er kundeminnet. Inventory matcher boliger. Calendar og Closing gjennomfører salget. Sales skal samle disse uten å kopiere data mellom moduler.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ["CRM", "/customers"],
              ["Lead Intelligence", "/lead-intelligence"],
              ["Eiendommer", "/inventory"],
              ["Closing", "/closing"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="rounded-xl border border-slate-700 px-3 py-2 text-center text-xs font-semibold text-cyan-300 hover:bg-slate-800">{label}</Link>
            ))}
          </div>
        </div>
      </div>

      {data.warnings?.length > 0 && (
        <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 px-4 py-3 text-xs text-amber-300">
          Sales lastet med {data.warnings.length} datavarsel. Se full Sales Inbox for detaljer.
        </div>
      )}
    </section>
  );
}
