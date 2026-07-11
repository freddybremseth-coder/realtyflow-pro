"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Banknote, CheckSquare, CircleDollarSign, Gauge, HeartHandshake, KeyRound, Loader2, RefreshCw, RotateCcw, ShieldCheck, Target, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Priority = "CRITICAL" | "HIGH" | "MEDIUM";
type State = "CRITICAL" | "ATTENTION" | "HEALTHY" | "INFO";
type Source = "today" | "closing" | "approvals" | "commissions" | "recovery" | "service-revenue" | "after-sales";

type Action = { id: string; source: Source; priority: Priority; title: string; subject: string; description: string; value: number; href: string };
type Stream = { id: Source | "forecast"; label: string; href: string; state: State; primaryMetric: string; secondaryMetric: string; count: number };
type Command = {
  generatedAt: string;
  headline: string;
  summary: { criticalActions: number; activeDeals: number; forecast30Commission: number; forecast90Commission: number; overdueCommission: number; monthlyRecurringRevenue: number; potentialAnnualRecurringRevenue: number; closingHighRisk: number; dataQualityScore: number };
  workstreams: Stream[];
  topActions: Action[];
  warnings: string[];
};

const sourceLabels: Record<Source, string> = { today: "Dagens salg", closing: "Closing", approvals: "Godkjenning", commissions: "Commission & Cash", recovery: "Recovery", "service-revenue": "Keyholding", "after-sales": "After-sales" };
const sourceIcons: Record<Source, LucideIcon> = { today: Target, closing: Users, approvals: CheckSquare, commissions: Banknote, recovery: RotateCcw, "service-revenue": KeyRound, "after-sales": HeartHandshake };
const streamIcons: Record<Stream["id"], LucideIcon> = { ...sourceIcons, forecast: TrendingUp };

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard" }).format(value || 0);
}
function badge(value: Priority | State) {
  if (value === "CRITICAL") return "border-red-500/35 bg-red-500/10 text-red-200";
  if (value === "HIGH" || value === "ATTENTION") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (value === "HEALTHY") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-emerald-300" /><p className="mt-3 text-[11px] uppercase tracking-wide text-slate-500">{label}</p><strong className="mt-1 block text-2xl text-white">{value}</strong></article>;
}

export default function RevenueCommandPage() {
  const [data, setData] = useState<Command | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/revenue/command", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke bygge Revenue Command Center.");
      setData(body.command);
    } catch (err) { setError(err instanceof Error ? err.message : "Kunne ikke bygge Revenue Command Center."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const metrics = data ? [
    ["30-dagers provisjon", money(data.summary.forecast30Commission), TrendingUp],
    ["90-dagers provisjon", money(data.summary.forecast90Commission), CircleDollarSign],
    ["Forfalt provisjon", money(data.summary.overdueCommission), AlertTriangle],
    ["Keyholding MRR", money(data.summary.monthlyRecurringRevenue), KeyRound],
    ["Potensiell Keyholding ARR", money(data.summary.potentialAnnualRecurringRevenue), HeartHandshake],
    ["Kritiske handlinger", data.summary.criticalActions, Target],
    ["Closing høy risiko", data.summary.closingHighRisk, Users],
    ["Datakvalitet", `${data.summary.dataQualityScore} %`, Gauge],
  ] as Array<[string, string | number, LucideIcon]> : [];

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><Gauge size={18} /> Freddy Revenue OS</div><h1 className="text-3xl font-bold text-white">Revenue Command Center</h1><p className="mt-2 text-sm text-slate-400">Samlet lederflate for salg, closing, kontantstrøm, recovery, Keyholding og ettermarked.</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link href="/today">I dag</Link></Button><Button asChild variant="outline"><Link href="/forecast">Forecast</Link></Button><Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button></div>
    </header>

    <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-slate-300"><ShieldCheck size={20} className="shrink-0 text-emerald-300" /><div><strong className="text-white">Read-only:</strong> Siden prioriterer og forklarer, men sender, godkjenner eller endrer ingenting.</div></div>
    {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
    {data?.warnings?.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><strong>Datavarsler:</strong> {data.warnings.join(" · ")}</div> : null}

    {loading && !data ? <div className="flex min-h-52 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Samler Revenue OS …</div> : data ? <>
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6"><p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Anbefalt hovedfokus</p><h2 className="mt-2 text-2xl font-semibold text-white">{data.headline}</h2><p className="mt-2 text-xs text-slate-500">Oppdatert {new Date(data.generatedAt).toLocaleString("nb-NO")}</p></section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value, icon]) => <Metric key={label} label={label} value={value} icon={icon} />)}</section>

      <section><div className="mb-3"><p className="text-xs uppercase tracking-wide text-slate-500">Arbeidsstrømmer</p><h2 className="text-xl font-semibold text-white">Status på hele Revenue OS</h2></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{data.workstreams.map((stream) => { const Icon = streamIcons[stream.id]; return <Link key={stream.id} href={stream.href} className="group rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 hover:border-emerald-500/35"><div className="flex justify-between"><Icon size={20} className="text-emerald-300" /><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge(stream.state)}`}>{stream.state}</span></div><h3 className="mt-4 font-semibold text-white">{stream.label}</h3><p className="mt-2 text-lg font-semibold text-slate-200">{stream.primaryMetric}</p><p className="mt-1 text-xs text-slate-500">{stream.secondaryMetric}</p><div className="mt-4 flex justify-between text-xs text-slate-500"><span>{stream.count} saker</span><span className="flex items-center gap-1 text-emerald-300">Åpne <ArrowRight size={13} /></span></div></Link>; })}</div></section>

      <section><div className="mb-3"><p className="text-xs uppercase tracking-wide text-slate-500">Prioritert arbeidsliste</p><h2 className="text-xl font-semibold text-white">Neste handling på tvers av systemet</h2><p className="mt-1 text-sm text-slate-400">Samme kunde vises bare én gang, med viktigste handling først.</p></div><div className="space-y-3">{data.topActions.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen prioriterte handlinger akkurat nå.</div> : data.topActions.map((action, index) => { const Icon = sourceIcons[action.source]; return <article key={action.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-500">#{index + 1}</span><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badge(action.priority)}`}>{action.priority}</span><span className="flex items-center gap-1 text-xs text-slate-500"><Icon size={13} />{sourceLabels[action.source]}</span></div><h3 className="mt-3 text-lg font-semibold text-white">{action.title}: {action.subject}</h3><p className="mt-1 text-sm text-slate-400">{action.description}</p></div><div className="flex items-center gap-3">{action.value > 0 && <strong className="text-sm text-slate-200">{money(action.value)}</strong>}<Button asChild size="sm"><Link href={action.href}>Åpne <ArrowRight size={14} className="ml-1" /></Link></Button></div></div></article>; })}</div></section>
    </> : null}
  </div>;
}
