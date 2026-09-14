"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type Stage = "HOLD" | "FOUNDATION" | "PILOT" | "PROVE" | "SCALE";
type Brand = {
  brandId: string; brandName: string; website: string; plannedChannels: string[];
  connectedChannels: Array<{ platform: string; name: string | null; pilotReady: boolean }>;
  metrics: { readySources: number; blockedSources: number; published30d: number; eligibleObservations: number; evaluatedRules: number; actionableRules: number; quarantined: number; leads: number; qualified: number; sales: number; attributionCoveragePercent: number };
  decision: { stage: Stage; score: number; canScale: boolean; blockers: string[]; evidence: string[]; nextAction: string };
  attribution: { sourceOfTruth: string; periodStart: string; leads: number; qualified: number; viewings: number; offers: number; sales: number; commissionEur: number; coveragePercent: number };
  actions: { readinessHref: string; publishingHref: string; attributionHref: string };
};
type Payload = { summary?: { brands: number; hold: number; foundation: number; pilot: number; prove: number; scale: number; canonicalLeads: number; canonicalQualified: number; canonicalSales: number }; brands?: Brand[]; error?: string };

const STAGES: Stage[] = ["HOLD", "FOUNDATION", "PILOT", "PROVE", "SCALE"];
function tone(stage: Stage) {
  return stage === "SCALE" ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : stage === "HOLD" ? "border-rose-200 bg-rose-50 text-rose-950"
      : stage === "PROVE" ? "border-cyan-200 bg-cyan-50 text-cyan-950"
        : "border-amber-200 bg-amber-50 text-amber-950";
}

export default function GrowthScalingPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<"ALL" | Stage>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/nexus/growth-scaling", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunne ikke laste Scaling Control."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const brands = useMemo(() => (data?.brands || []).filter((brand) => filter === "ALL" || brand.decision.stage === filter), [data, filter]);

  return <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-700"><Gauge size={17}/> Growth OS Scaling Control</div><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Skaler bare det som skaper dokumentert fremdrift</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Én porteføljekø fra kildeforsyning og pilotdata til kanoniske CRM-resultater. Views alene åpner aldri SCALE; lead, kvalifisering og attribusjonsdekning må være dokumentert.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Oppdater</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4 lg:grid-cols-7">{[
        ["Brands", data?.summary?.brands || 0], ["HOLD", data?.summary?.hold || 0], ["FOUNDATION", data?.summary?.foundation || 0], ["PILOT", data?.summary?.pilot || 0], ["PROVE", data?.summary?.prove || 0], ["SCALE", data?.summary?.scale || 0], ["Kanoniske leads", data?.summary?.canonicalLeads || 0],
      ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></div>)}</div>
    </header>
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900"><AlertTriangle size={17} className="mr-2 inline"/>{error}</div>}
    <div className="flex gap-2 overflow-x-auto">{(["ALL", ...STAGES] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-2 text-xs font-black ${filter === value ? "border-fuchsia-700 bg-fuchsia-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{value}</button>)}</div>
    {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600"><Loader2 size={18} className="mr-2 inline animate-spin"/>Beregner skaleringsporter…</div>}
    {!loading && brands.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-sm font-bold text-emerald-900"><CheckCircle2 size={17} className="mr-2 inline"/>Ingen brands i dette trinnet.</div>}
    <section className="space-y-5">{brands.map((brand) => <article key={brand.brandId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${tone(brand.decision.stage)}`}>{brand.decision.stage}</span><span className="text-xs font-bold text-slate-500">{brand.connectedChannels.map((channel) => channel.platform).join(" · ") || "Ingen kanal"}</span></div><h2 className="mt-3 text-xl font-black text-slate-950">{brand.brandName}</h2><a href={brand.website} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-bold text-fuchsia-700">{brand.website}</a></div><div className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-white"><div className="text-2xl font-black">{brand.decision.score}</div><div className="text-[10px] font-bold uppercase text-slate-300">Scale score</div></div></div>
      <div className="grid gap-4 p-5 lg:grid-cols-3 sm:p-6">
        <Panel title="Forsyning og læring"><Grid values={[["Ready sources", brand.metrics.readySources], ["Publisert 30d", brand.metrics.published30d], ["Eligible", brand.metrics.eligibleObservations], ["Rules", brand.metrics.evaluatedRules]]}/></Panel>
        <Panel title="Kanoniske resultater"><Grid values={[["Kanoniske leads", brand.attribution.leads], ["Kvalifiserte", brand.attribution.qualified], ["Visninger", brand.attribution.viewings], ["Salg", brand.attribution.sales]]}/><div className="mt-3 text-xs text-slate-600"><b>Attribusjonsdekning:</b> {brand.attribution.coveragePercent}% · <b>Kommisjon:</b> €{Math.round(brand.attribution.commissionEur).toLocaleString("nb-NO")}</div></Panel>
        <Panel title="Neste sikre steg"><p className="text-sm font-semibold leading-6 text-slate-800">{brand.decision.nextAction}</p>{brand.decision.blockers.map((value) => <Notice key={value} value={value} blocked/>)}{brand.decision.evidence.map((value) => <Notice key={value} value={value}/>)}</Panel>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><Link href={brand.actions.readinessHref} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Readiness</Link><Link href={brand.actions.publishingHref} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800">Posts</Link><Link href={brand.actions.attributionHref} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800">Attribution</Link><span className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-slate-500"><ShieldCheck size={15}/>Read-only · ingen automatisk kanal-, budsjett- eller frekvensendring</span></div>
    </article>)}</section>
  </main>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{title}</div>{children}</section>; }
function Grid({ values }: { values: Array<[string, number]> }) { return <div className="grid grid-cols-2 gap-2">{values.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-black text-slate-950">{value}</div><div className="text-[10px] font-bold uppercase text-slate-500">{label}</div></div>)}</div>; }
function Notice({ value, blocked = false }: { value: string; blocked?: boolean }) { return <div className={`mt-2 rounded-xl p-3 text-xs ${blocked ? "bg-rose-50 text-rose-900" : "bg-emerald-50 text-emerald-900"}`}>{value}</div>; }
