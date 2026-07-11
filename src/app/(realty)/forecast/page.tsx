"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ForecastDeal {
  id: string;
  name: string;
  stage: string;
  brandId: string;
  dealValue: number;
  commissionRate: number;
  commissionRateEstimated: boolean;
  grossCommission: number;
  probability: number;
  weightedValue: number;
  weightedCommission: number;
  ageDays: number;
  staleDays: number;
  stale: boolean;
  overdue: boolean;
  missingNextFollowup: boolean;
  missingValue: boolean;
  missingContactChannel: boolean;
  healthScore: number;
  risk: "HIGH" | "MEDIUM" | "LOW";
  issues: string[];
  recommendedAction: string;
  nextFollowupAt: string | null;
  expectedWindow: string;
  href: string;
}

interface StageSummary {
  stage: string;
  label: string;
  probability: number;
  count: number;
  rawValue: number;
  weightedValue: number;
  weightedCommission: number;
  averageAgeDays: number;
  staleCount: number;
  overdueCount: number;
  missingValueCount: number;
}

interface BrandSummary {
  brandId: string;
  activeCount: number;
  openValue: number;
  weightedValue: number;
  weightedCommission: number;
  wonCommission: number;
  unpaidWonCommission: number;
  atRiskCount: number;
}

interface Forecast {
  generatedAt: string;
  assumptions: {
    fallbackCommissionPercent: number;
    stageProbabilities: Record<string, number>;
    note: string;
  };
  summary: {
    activeDeals: number;
    openPipelineValue: number;
    weightedPipelineValue: number;
    weightedCommission: number;
    forecast30Commission: number;
    forecast90Commission: number;
    wonDeals: number;
    lostDeals: number;
    registeredOutcomeWinRate: number | null;
    wonCommission: number;
    unpaidWonCommission: number;
    atRiskDeals: number;
    overdueDeals: number;
    staleDeals: number;
    missingValueDeals: number;
    missingNextFollowupDeals: number;
    dataQualityScore: number;
    bottleneckStage: string | null;
  };
  scenarios: {
    conservativeCommission: number;
    baseCommission: number;
    upsideCommission: number;
  };
  stages: StageSummary[];
  brands: BrandSummary[];
  deals: ForecastDeal[];
}

type RiskFilter = "all" | "high" | "overdue" | "stale" | "missing_value" | "missing_followup";

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

const STAGE_LABELS: Record<string, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  ON_HOLD: "På vent",
};

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
  }).format(value || 0);
}

function percent(value: number | null) {
  if (value === null) return "Ikke nok data";
  return `${Math.round(value * 100)} %`;
}

function dateLabel(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nb-NO");
}

function riskClass(risk: ForecastDeal["risk"]) {
  if (risk === "HIGH") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (risk === "MEDIUM") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
}

export default function ForecastPage() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<RiskFilter>("all");
  const [brand, setBrand] = useState("all");

  async function load(selectedBrand = brand) {
    setLoading(true);
    setError("");
    try {
      const params = selectedBrand === "all" ? "" : `?brand=${encodeURIComponent(selectedBrand)}`;
      const response = await fetch(`/api/revenue/forecast${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke bygge inntektsprognosen.");
      setForecast(body?.forecast || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke bygge inntektsprognosen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);

  const visibleDeals = useMemo(() => (forecast?.deals || []).filter((deal) => {
    if (filter === "high") return deal.risk === "HIGH";
    if (filter === "overdue") return deal.overdue;
    if (filter === "stale") return deal.stale;
    if (filter === "missing_value") return deal.missingValue;
    if (filter === "missing_followup") return deal.missingNextFollowup;
    return true;
  }), [forecast?.deals, filter]);

  const summaryCards: Array<{ label: string; value: string | number; detail: string; icon: LucideIcon }> = forecast ? [
    { label: "Åpen boligverdi", value: money(forecast.summary.openPipelineValue), detail: `${forecast.summary.activeDeals} aktive muligheter`, icon: CircleDollarSign },
    { label: "Vektet boligverdi", value: money(forecast.summary.weightedPipelineValue), detail: "Basert på pipeline-status", icon: TrendingUp },
    { label: "Vektet provisjon", value: money(forecast.summary.weightedCommission), detail: "Base-scenario", icon: Target },
    { label: "30 dagers provisjon", value: money(forecast.summary.forecast30Commission), detail: "Stage-basert kortsikt", icon: CalendarClock },
    { label: "90 dagers provisjon", value: money(forecast.summary.forecast90Commission), detail: "Stage-basert mellomlang sikt", icon: BarChart3 },
    { label: "Datakvalitet", value: `${forecast.summary.dataQualityScore} %`, detail: "Verdi, provisjon, oppfølging og kanal", icon: Database },
  ] : [];

  const riskFilters: Array<{ id: RiskFilter; label: string }> = [
    { id: "all", label: "Alle" },
    { id: "high", label: "Høy risiko" },
    { id: "overdue", label: "Forsinket" },
    { id: "stale", label: "Stagnert" },
    { id: "missing_value", label: "Mangler verdi" },
    { id: "missing_followup", label: "Mangler neste steg" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><TrendingUp size={17} /> Freddy Revenue OS</div>
          <h1 className="text-3xl font-bold text-white">Revenue Forecast & Funnel Health</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">En transparent prognose for boligverdi, forventet provisjon, pipeline-risiko og registrerte salgsresultater.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={brand} onChange={(event) => setBrand(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
            <option value="all">Alle eiendomsbrands</option>
            <option value="zeneco">Zen Eco Homes</option>
            <option value="soleada">Soleada.no</option>
            <option value="pinosoecolife">Pinoso EcoLife</option>
          </select>
          <Button asChild variant="outline"><Link href="/today">I dag</Link></Button>
          <Button asChild variant="outline"><Link href="/closing">Closing</Link></Button>
          <Button onClick={() => load()} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}

      {forecast && <div className="flex gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 text-sm text-slate-300">
        <Gauge size={20} className="mt-0.5 shrink-0 text-cyan-300" />
        <div><strong className="text-white">Beregning, ikke garanti:</strong> {forecast.assumptions.note} Manglende provisjon beregnes midlertidig med <strong className="text-cyan-200">{forecast.assumptions.fallbackCommissionPercent} %</strong>, og dette merkes på hver berørt kunde.</div>
      </div>}

      {forecast && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return <article key={card.label} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-emerald-300" /><p className="mt-3 text-[11px] uppercase tracking-wide text-slate-500">{card.label}</p><strong className="mt-1 block text-xl text-white">{card.value}</strong><p className="mt-1 text-xs text-slate-500">{card.detail}</p></article>;
        })}
      </section>}

      {forecast && <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Konservativt scenario</p><strong className="mt-2 block text-3xl text-white">{money(forecast.scenarios.conservativeCommission)}</strong><p className="mt-2 text-sm text-slate-400">65 % av stage-sannsynlighetene.</p></article>
        <article className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5"><p className="text-xs uppercase tracking-wide text-emerald-300">Base-scenario</p><strong className="mt-2 block text-3xl text-white">{money(forecast.scenarios.baseCommission)}</strong><p className="mt-2 text-sm text-slate-400">Registrert pipeline-status og standard sannsynlighet.</p></article>
        <article className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5"><p className="text-xs uppercase tracking-wide text-cyan-300">Oppside-scenario</p><strong className="mt-2 block text-3xl text-white">{money(forecast.scenarios.upsideCommission)}</strong><p className="mt-2 text-sm text-slate-400">135 % av stage-sannsynlighetene, maksimalt 100 % per avtale.</p></article>
      </section>}

      {forecast && <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5 lg:col-span-2">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Funnel health</h2><p className="mt-1 text-sm text-slate-500">Verdier, alder og risiko per pipeline-steg.</p></div>{forecast.summary.bottleneckStage && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">Flaskehals: {STAGE_LABELS[forecast.summary.bottleneckStage] || forecast.summary.bottleneckStage}</span>}</div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3">Steg</th><th className="pb-3">Sannsynlighet</th><th className="pb-3">Antall</th><th className="pb-3">Boligverdi</th><th className="pb-3">Vektet verdi</th><th className="pb-3">Vektet provisjon</th><th className="pb-3">Risiko</th></tr></thead>
              <tbody>{forecast.stages.map((stage) => <tr key={stage.stage} className="border-b border-slate-800/80 text-slate-300"><td className="py-3 font-medium text-white">{stage.label}</td><td className="py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${stage.probability * 100}%` }} /></div>{Math.round(stage.probability * 100)} %</div></td><td className="py-3">{stage.count}</td><td className="py-3">{money(stage.rawValue)}</td><td className="py-3">{money(stage.weightedValue)}</td><td className="py-3">{money(stage.weightedCommission)}</td><td className="py-3 text-xs text-slate-400">{stage.overdueCount} forsinket · {stage.staleCount} stagnert · {stage.missingValueCount} uten verdi</td></tr>)}</tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold text-white">Registrerte resultater</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-sm"><span className="text-slate-400">Vunnet</span><strong className="text-emerald-300">{forecast.summary.wonDeals}</strong></div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-sm"><span className="text-slate-400">Tapt</span><strong className="text-red-300">{forecast.summary.lostDeals}</strong></div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-sm"><span className="text-slate-400">Registrert win rate</span><strong className="text-white">{percent(forecast.summary.registeredOutcomeWinRate)}</strong></div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-sm"><span className="text-slate-400">Vunnet provisjon</span><strong className="text-white">{money(forecast.summary.wonCommission)}</strong></div>
            <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Ikke registrert betalt</span><strong className="text-amber-300">{money(forecast.summary.unpaidWonCommission)}</strong></div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">Win rate bygger kun på kontakter som faktisk er registrert som vunnet eller tapt. Den er ikke en kohortanalyse.</p>
        </article>
      </section>}

      {forecast && <section className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
        <div className="flex items-center gap-2"><Users size={19} className="text-emerald-300" /><h2 className="text-lg font-semibold text-white">Prognose per brand</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{forecast.brands.map((item) => <article key={item.brandId} className="rounded-lg border border-slate-700 bg-slate-950/40 p-4"><div className="flex items-start justify-between"><div><h3 className="font-semibold text-white">{BRAND_LABELS[item.brandId] || item.brandId}</h3><p className="mt-1 text-xs text-slate-500">{item.activeCount} aktive · {item.atRiskCount} høy risiko</p></div><span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-400">{money(item.openValue)}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">Vektet provisjon</p><strong className="text-emerald-300">{money(item.weightedCommission)}</strong></div><div><p className="text-xs text-slate-500">Vunnet provisjon</p><strong className="text-white">{money(item.wonCommission)}</strong></div><div><p className="text-xs text-slate-500">Vektet boligverdi</p><strong className="text-white">{money(item.weightedValue)}</strong></div><div><p className="text-xs text-slate-500">Ikke registrert betalt</p><strong className="text-amber-300">{money(item.unpaidWonCommission)}</strong></div></div></article>)}</div>
      </section>}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-xl font-semibold text-white">Pipeline-risiko og neste grep</h2><p className="mt-1 text-sm text-slate-500">Høy risiko, forsinkede oppfølginger og manglende prognosedata vises først.</p></div><div className="flex flex-wrap gap-2">{riskFilters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === item.id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400"}`}>{item.label}</button>)}</div></div>

        {loading && !forecast ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Bygger prognose …</div> : visibleDeals.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen avtaler i dette filteret.</div> : visibleDeals.map((deal) => <article key={deal.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskClass(deal.risk)}`}>{deal.risk} RISK</span><span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{STAGE_LABELS[deal.stage] || deal.stage} · {Math.round(deal.probability * 100)} %</span><span className="text-xs text-slate-500">{BRAND_LABELS[deal.brandId] || deal.brandId}</span></div>
              <h3 className="mt-3 text-xl font-semibold text-white">{deal.name}</h3>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400"><span>Boligverdi: <strong className="text-slate-200">{money(deal.dealValue)}</strong></span><span>Vektet provisjon: <strong className="text-emerald-300">{money(deal.weightedCommission)}</strong></span><span>Forventet vindu: <strong className="text-slate-200">{deal.expectedWindow}</strong></span><span>Health: <strong className="text-slate-200">{deal.healthScore}/100</strong></span></div>
              <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><p className="text-xs uppercase tracking-wide text-emerald-300">Anbefalt neste grep</p><p className="mt-1 text-sm text-slate-200">{deal.recommendedAction}</p></div>
              {deal.issues.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{deal.issues.map((issue) => <span key={issue} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100">{issue}</span>)}</div>}
            </div>
            <div className="w-full shrink-0 xl:w-72">
              <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-xs text-slate-400"><div className="flex items-center justify-between"><span className="flex items-center gap-1"><Clock3 size={13} /> Alder</span><strong className="text-slate-200">{deal.ageDays} dager</strong></div><div className="flex items-center justify-between"><span>Siste aktivitet</span><strong className="text-slate-200">{deal.staleDays} dager siden</strong></div><div className="flex items-center justify-between"><span>Neste oppfølging</span><strong className={deal.overdue ? "text-red-300" : "text-slate-200"}>{dateLabel(deal.nextFollowupAt)}</strong></div><div className="flex items-center justify-between"><span>Brutto provisjon</span><strong className="text-slate-200">{money(deal.grossCommission)}</strong></div><div className="flex items-center justify-between"><span>Provisjonssats</span><strong className={deal.commissionRateEstimated ? "text-amber-300" : "text-slate-200"}>{deal.commissionRate} %{deal.commissionRateEstimated ? " estimat" : ""}</strong></div></div>
              <div className="mt-3 flex flex-wrap gap-2"><Button asChild size="sm"><Link href={deal.href}>Customer 360 <ArrowRight size={14} className="ml-1" /></Link></Button><Button asChild size="sm" variant="outline"><Link href="/closing">Closing</Link></Button></div>
            </div>
          </div>
        </article>)}
      </section>

      {forecast && <div className="flex gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-xs text-slate-500"><ShieldAlert size={17} className="shrink-0" /><div>Stage-sannsynligheter: Ny {Math.round(forecast.assumptions.stageProbabilities.NEW * 100)} %, kontaktet {Math.round(forecast.assumptions.stageProbabilities.CONTACT * 100)} %, kvalifisert {Math.round(forecast.assumptions.stageProbabilities.QUALIFIED * 100)} %, visning {Math.round(forecast.assumptions.stageProbabilities.VIEWING * 100)} %, forhandling {Math.round(forecast.assumptions.stageProbabilities.NEGOTIATION * 100)} %, på vent {Math.round(forecast.assumptions.stageProbabilities.ON_HOLD * 100)} %. Disse kan senere kalibreres mot faktisk historikk.</div></div>}
    </div>
  );
}
