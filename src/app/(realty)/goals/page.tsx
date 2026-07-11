"use client";

import Link from "next/link";
import { useEffect, useState, type LucideIcon } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Flag,
  Gauge,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Scope = "all" | "zeneco" | "soleada" | "pinosoecolife" | "keyholding";
type GoalStatus = "UNSET" | "ACHIEVED" | "ON_TRACK" | "AT_RISK" | "BEHIND";

type GoalMetric = {
  id: "commission" | "deals" | "keyholding-mrr" | "keyholding-contracts" | "recovery";
  label: string;
  unit: "EUR" | "COUNT";
  target: number | null;
  actual: number;
  projected: number | null;
  progressPercent: number | null;
  gap: number | null;
  status: GoalStatus;
  detail: string;
};

type WeeklyPlanItem = {
  id: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  targetThisWeek: number | null;
  unit: "EUR" | "COUNT" | null;
  href: string;
};

type Scorecard = {
  generatedAt: string;
  configured: boolean;
  headline: string;
  config: {
    scope: Scope;
    periodStart: string;
    commissionTargetEur: number | null;
    closedDealsTarget: number | null;
    keyholdingMrrTargetEur: number | null;
    keyholdingContractsTarget: number | null;
    recoveredLeadsTarget: number | null;
    notes: string | null;
    updatedAt: string | null;
  };
  period: { elapsedPercent: number; daysRemaining: number; weeksRemaining: number };
  summary: {
    earnedCommission: number;
    collectedCommission: number;
    forecast30Commission: number;
    wonDeals: number;
    currentKeyholdingMrr: number;
    currentKeyholdingArr: number;
    newKeyholdingContracts: number;
    recoveredLeads: number;
    overdueCommission: number;
    highRiskClosings: number;
    approvalReady: number;
    dataQualityScore: number;
  };
  metrics: GoalMetric[];
  weeklyPlan: WeeklyPlanItem[];
  warnings: string[];
  assumptions: string[];
};

type FormState = {
  commissionTargetEur: string;
  closedDealsTarget: string;
  keyholdingMrrTargetEur: string;
  keyholdingContractsTarget: string;
  recoveredLeadsTarget: string;
  notes: string;
};

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "all", label: "Alle eiendomsbrands" },
  { id: "zeneco", label: "Zen Eco Homes" },
  { id: "soleada", label: "Soleada.no" },
  { id: "pinosoecolife", label: "Pinoso EcoLife" },
  { id: "keyholding", label: "Keyholding" },
];

const METRIC_ICONS: Record<GoalMetric["id"], LucideIcon> = {
  commission: CircleDollarSign,
  deals: Users,
  "keyholding-mrr": KeyRound,
  "keyholding-contracts": ShieldCheck,
  recovery: RotateCcw,
};

const emptyForm: FormState = {
  commissionTargetEur: "",
  closedDealsTarget: "",
  keyholdingMrrTargetEur: "",
  keyholdingContractsTarget: "",
  recoveredLeadsTarget: "",
  notes: "",
};

function monthNow() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
  }).format(value || 0);
}

function valueLabel(value: number | null, unit: "EUR" | "COUNT" | null) {
  if (value === null) return "—";
  return unit === "EUR" ? money(value) : new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value);
}

function statusLabel(status: GoalStatus) {
  return {
    UNSET: "IKKE SATT",
    ACHIEVED: "NÅDD",
    ON_TRACK: "I RUTE",
    AT_RISK: "I RISIKO",
    BEHIND: "ETTER PLAN",
  }[status];
}

function badgeClass(status: GoalStatus | WeeklyPlanItem["priority"]) {
  if (status === "ACHIEVED" || status === "ON_TRACK") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (status === "CRITICAL" || status === "BEHIND") return "border-red-500/35 bg-red-500/10 text-red-200";
  if (status === "HIGH" || status === "AT_RISK") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

function formFrom(scorecard: Scorecard): FormState {
  const config = scorecard.config;
  return {
    commissionTargetEur: config.commissionTargetEur?.toString() || "",
    closedDealsTarget: config.closedDealsTarget?.toString() || "",
    keyholdingMrrTargetEur: config.keyholdingMrrTargetEur?.toString() || "",
    keyholdingContractsTarget: config.keyholdingContractsTarget?.toString() || "",
    recoveredLeadsTarget: config.recoveredLeadsTarget?.toString() || "",
    notes: config.notes || "",
  };
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-emerald-300" /><p className="mt-3 text-[11px] uppercase tracking-wide text-slate-500">{label}</p><strong className="mt-1 block text-2xl text-white">{value}</strong></article>;
}

export default function RevenueGoalsPage() {
  const [scope, setScope] = useState<Scope>("all");
  const [month, setMonth] = useState(monthNow());
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/revenue/goals?scope=${encodeURIComponent(scope)}&month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente mål og ukeplan.");
      setScorecard(body.scorecard);
      setForm(formFrom(body.scorecard));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente mål og ukeplan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [scope, month]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const response = await fetch("/api/revenue/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, month, ...form }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lagre målene.");
      setSaved("Målene er lagret. Ukeplanen er beregnet på nytt.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre målene.");
    } finally {
      setSaving(false);
    }
  }

  const summaryCards: Array<{ label: string; value: string | number; icon: LucideIcon }> = scorecard ? [
    { label: "Opptjent provisjon", value: money(scorecard.summary.earnedCommission), icon: CircleDollarSign },
    { label: "Innbetalt provisjon", value: money(scorecard.summary.collectedCommission), icon: Banknote },
    { label: "30-dagers prognose", value: money(scorecard.summary.forecast30Commission), icon: TrendingUp },
    { label: "Vunne salg", value: scorecard.summary.wonDeals, icon: Users },
    { label: "Keyholding MRR", value: money(scorecard.summary.currentKeyholdingMrr), icon: KeyRound },
    { label: "Nye Keyholding-avtaler", value: scorecard.summary.newKeyholdingContracts, icon: ShieldCheck },
    { label: "Reaktiverte leads", value: scorecard.summary.recoveredLeads, icon: RotateCcw },
    { label: "Datakvalitet", value: `${scorecard.summary.dataQualityScore} %`, icon: Gauge },
  ] : [];

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><Flag size={18} /> Freddy Revenue OS</div><h1 className="text-3xl font-bold text-white">Revenue Goals & Weekly Plan</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Sett dine egne månedsmål og få en synlig ukeplan basert på faktiske CRM-resultater, prognose og gjenværende gap.</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/revenue-command">Command Center</Link></Button><Button asChild variant="outline"><Link href="/forecast">Forecast</Link></Button><Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button></div>
    </header>

    <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-slate-300"><ShieldCheck size={20} className="shrink-0 text-emerald-300" /><div><strong className="text-white">Du eier målene:</strong> systemet lager aldri mål automatisk. Det beregner bare fremdrift og ukeplan fra verdiene du lagrer.</div></div>

    <section className="grid gap-3 md:grid-cols-2">
      <label className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300"><span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">Måned</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
      <label className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300"><span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">Scope</span><select value={scope} onChange={(event) => setScope(event.target.value as Scope)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">{SCOPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </section>

    {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
    {saved && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"><CheckCircle2 size={18} />{saved}</div>}
    {scorecard?.warnings?.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><strong>Datavarsler:</strong> {scorecard.warnings.join(" · ")}</div> : null}

    {loading && !scorecard ? <div className="flex min-h-52 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Bygger målbildet …</div> : scorecard ? <>
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6"><p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Anbefalt fokus</p><h2 className="mt-2 text-2xl font-semibold text-white">{scorecard.headline}</h2><div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400"><span><CalendarDays size={14} className="mr-1 inline" />{scorecard.period.daysRemaining} dager igjen</span><span>{scorecard.period.weeksRemaining} arbeidsuker igjen</span><span>{scorecard.period.elapsedPercent} % av måneden gått</span></div></section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{summaryCards.map((card) => <SummaryCard key={card.label} {...card} />)}</section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-6">
        <div className="mb-5"><p className="text-xs uppercase tracking-wide text-slate-500">Målkonfigurasjon</p><h2 className="text-xl font-semibold text-white">Dine mål for perioden</h2><p className="mt-1 text-sm text-slate-400">La felt stå tomme når du ikke vil måle dem.</p></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["commissionTargetEur", "Provisjon (€)"],
            ["closedDealsTarget", "Vunne salg"],
            ["keyholdingMrrTargetEur", "Keyholding MRR (€)"],
            ["keyholdingContractsTarget", "Nye Keyholding-avtaler"],
            ["recoveredLeadsTarget", "Reaktiverte leads"],
          ].map(([key, label]) => <label key={key} className="text-sm text-slate-300"><span className="mb-2 block text-xs text-slate-500">{label}</span><input type="number" min="0" step={key.includes("Eur") ? "1" : "1"} value={form[key as keyof FormState]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>)}
        </div>
        <label className="mt-4 block text-sm text-slate-300"><span className="mb-2 block text-xs text-slate-500">Månedsnotat</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} maxLength={1000} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" placeholder="Prioriteringer, kampanjer, reiser eller andre forhold som påvirker måneden." /></label>
        <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{scorecard.config.updatedAt ? `Sist lagret ${new Date(scorecard.config.updatedAt).toLocaleString("nb-NO")}` : "Ingen mål er lagret for dette scope og denne måneden."}</p><Button onClick={save} disabled={saving}>{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}Lagre mål</Button></div>
      </section>

      <section><div className="mb-3"><p className="text-xs uppercase tracking-wide text-slate-500">Målfremdrift</p><h2 className="text-xl font-semibold text-white">Faktisk resultat mot mål</h2></div><div className="grid gap-4 lg:grid-cols-2">{scorecard.metrics.map((metric) => { const Icon = METRIC_ICONS[metric.id]; const width = Math.min(100, Math.max(0, metric.progressPercent || 0)); return <article key={metric.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="rounded-lg bg-slate-800 p-2"><Icon size={20} className="text-emerald-300" /></div><div><h3 className="font-semibold text-white">{metric.label}</h3><p className="mt-1 text-xs text-slate-500">{metric.detail}</p></div></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badgeClass(metric.status)}`}>{statusLabel(metric.status)}</span></div><div className="mt-5 grid grid-cols-3 gap-3 text-sm"><div><p className="text-xs text-slate-500">Faktisk</p><strong className="text-white">{valueLabel(metric.actual, metric.unit)}</strong></div><div><p className="text-xs text-slate-500">Mål</p><strong className="text-white">{valueLabel(metric.target, metric.unit)}</strong></div><div><p className="text-xs text-slate-500">Projisert</p><strong className="text-white">{valueLabel(metric.projected, metric.unit)}</strong></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${width}%` }} /></div><p className="mt-2 text-right text-xs text-slate-500">{metric.progressPercent === null ? "Mål ikke satt" : `${metric.progressPercent} % fullført`}</p></article>; })}</div></section>

      <section><div className="mb-3"><p className="text-xs uppercase tracking-wide text-slate-500">Ukeplan</p><h2 className="text-xl font-semibold text-white">Hva som bør gjøres denne uken</h2><p className="mt-1 text-sm text-slate-400">Planen prioriterer kontantstrøm og closing før aktivitet som bare øker volum.</p></div><div className="space-y-3">{scorecard.weeklyPlan.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen ukeplan kan beregnes før mål er satt eller systemet registrerer en kritisk oppgave.</div> : scorecard.weeklyPlan.map((item, index) => <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-500">#{index + 1}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badgeClass(item.priority)}`}>{item.priority}</span></div><h3 className="mt-3 text-lg font-semibold text-white">{item.title}</h3><p className="mt-1 text-sm text-slate-400">{item.description}</p></div><div className="flex items-center gap-3">{item.targetThisWeek !== null && <div className="text-right"><p className="text-xs text-slate-500">Uketakt</p><strong className="text-white">{valueLabel(item.targetThisWeek, item.unit)}</strong></div>}<Button asChild size="sm"><Link href={item.href}>Åpne <ArrowRight size={14} className="ml-1" /></Link></Button></div></div></article>)}</div></section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5"><h2 className="font-semibold text-white">Beregningene bygger på</h2><ul className="mt-3 space-y-2 text-sm text-slate-400">{scorecard.assumptions.map((item) => <li key={item} className="flex gap-2"><Target size={15} className="mt-0.5 shrink-0 text-emerald-300" />{item}</li>)}</ul></section>
    </> : null}
  </div>;
}
