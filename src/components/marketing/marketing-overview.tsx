"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Loader2,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  Wrench,
} from "lucide-react";

type GrowthRow = {
  brandId: string;
  channel: string;
  unifiedScore: number;
  attributionCoveragePct: number;
  evidence: string;
  funnel: {
    impressions: number;
    views: number;
    clicks: number;
    leads: number;
    qualifiedLeads: number;
    viewings: number;
    offers: number;
    sales: number;
    commissionEur: number;
  };
};

type MarketingPayload = {
  automationSummary?: {
    autoReady: number;
    humanRequired: number;
    systemWork: number;
    waiting: number;
    connectedSignals: number;
    connectedDestinations: number;
  };
  performanceSummary?: {
    periodDays: number;
    portfolio: GrowthRow;
    brands: GrowthRow[];
    channels: GrowthRow[];
    diagnostics: {
      portfolioAttributionCoveragePct: number;
    };
  } | null;
  controlGate?: {
    status: string;
    reason: string;
    eligibleObservations: number;
    requiredObservations: number;
    evaluatedRules: number;
    actionableRules: number;
    nextEvaluationAt: string | null;
  };
  nextActions?: Array<{
    id?: string;
    title: string;
    reason?: string;
    href: string;
    execution: "AUTO_READY" | "HUMAN_REQUIRED" | "SYSTEM_WORK" | "WAIT";
    brandId?: string;
    channel?: string | null;
  }>;
  learningInsights?: Array<{
    id: string;
    brandName: string;
    channel: string | null;
    verdict: "favor" | "avoid";
    finding: string | null;
    nextBehavior: string;
    sample: number;
    evidence: string;
    sales: number;
    commissionEur: number;
  }>;
};

function eur(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}

export function MarketingOverview() {
  const [data, setData] = useState<MarketingPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError("");
    fetch("/api/marketing/readiness", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Marketing-status");
        return body as MarketingPayload;
      })
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-400"><Loader2 className="mr-2 inline animate-spin" size={17}/>Laster Marketing…</div>;
  }

  if (!data) {
    return <div className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-5 text-sm text-rose-300">{error || "Ingen markedsdata tilgjengelig."}</div>;
  }

  const automation = data.automationSummary;
  const portfolio = data.performanceSummary?.portfolio;
  const cards = [
    ["Auto ready", automation?.autoReady || 0, CheckCircle2],
    ["Krever menneske", automation?.humanRequired || 0, UserCheck],
    ["Systemarbeid", automation?.systemWork || 0, Wrench],
    ["Venter", automation?.waiting || 0, Clock3],
    ["Leads 30d", portfolio?.funnel.leads || 0, Megaphone],
    ["Kvalifiserte", portfolio?.funnel.qualifiedLeads || 0, Target],
    ["Salg", portfolio?.funnel.sales || 0, BarChart3],
    ["Provisjon", eur(portfolio?.funnel.commissionEur || 0), Sparkles],
  ] as const;

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Marketing · fra kanal til forretning</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Growth OS, Brand Brain, kanal-readiness, publisering, attribution og læring er én markedsmotor. Marketing skal styre distribusjon og effekt — Content produserer materialet.
          </p>
        </div>
        <button onClick={load} className="rounded-xl border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Oppdater Marketing">
          <RefreshCw size={16}/>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <Icon className="text-cyan-400" size={18}/>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-white">{typeof value === "number" ? value.toLocaleString("nb-NO") : value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-white">Neste markedsoppgaver</h3>
            <Link href="/social-automation" className="text-xs font-semibold text-cyan-300 hover:underline">Åpne Marketing OS</Link>
          </div>
          <div className="mt-4 space-y-2">
            {(data.nextActions || []).slice(0, 6).map((action, index) => (
              <Link key={action.id || `${action.title}:${index}`} href={action.href} className="block rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-cyan-500/30">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-100">{action.title}</p>
                    {action.reason && <p className="mt-1 text-xs leading-5 text-slate-500">{action.reason}</p>}
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[9px] font-bold text-slate-400">{action.execution.replace("_", " ")}</span>
                </div>
              </Link>
            ))}
            {(data.nextActions || []).length === 0 && <p className="text-sm text-slate-500">Ingen aktive markedsoppgaver akkurat nå.</p>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-cyan-400" size={18}/>
              <h3 className="font-semibold text-white">Readiness & måling</h3>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              {automation?.connectedDestinations || 0} publiseringsdestinasjoner · {automation?.connectedSignals || 0} signalkilder.
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Attribution-dekning: <strong className="text-slate-100">{Math.round(data.performanceSummary?.diagnostics.portfolioAttributionCoveragePct || 0)}%</strong>
            </p>
            {data.controlGate && (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                Kontrollgate: <strong className="text-slate-200">{data.controlGate.status}</strong> · {data.controlGate.eligibleObservations}/{data.controlGate.requiredObservations} observasjoner
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/marketing-readiness" className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800">Readiness</Link>
              <Link href="/attribution" className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800">Attribution</Link>
              <Link href="/analytics" className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800">Analytics</Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="font-semibold text-white">Dokumentert læring</h3>
            <div className="mt-3 space-y-2">
              {(data.learningInsights || []).slice(0, 3).map((insight) => (
                <div key={insight.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs font-semibold text-cyan-300">{insight.brandName}{insight.channel ? ` · ${insight.channel}` : ""}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{insight.finding || insight.nextBehavior}</p>
                </div>
              ))}
              {(data.learningInsights || []).length === 0 && <p className="text-sm text-slate-500">Ingen læringsregel har nok evidens til å vises ennå.</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
