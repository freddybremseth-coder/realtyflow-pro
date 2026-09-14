"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type Brand = {
  brandId: string; brandName: string; kind: string; growthStage: string; focus: string; portfolioScore: number; attentionScore: number; nextAction: string;
  channels: { connected: number; planned: number }; sourceHealth: { ready: number; blocked: number; quarantined: number };
  outcomes: { leads: number; qualified: number; sales: number; commissionEur: number; attributionCoveragePercent: number };
  revenue: { opportunities: number; cashNow: number; representedValue: number; highestOpportunityScore: number };
  learning: { actionableRules: number }; evidence: string[];
};
type Transfer = { sourceBrandId: string; targetBrandId: string; reason: string; sharedChannels: string[]; requiresHumanReview: true; automaticTransferAllowed: false; evidenceScope: string };
type Payload = {
  headline?: string; brands?: Brand[]; transferReviews?: Transfer[]; warnings?: string[]; error?: string;
  summary?: { brands: number; intervene: number; advance: number; prove: number; monitor: number; canonicalLeads: number; canonicalSales: number; representedValue: number };
};

const money = (value: number) => new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
const focusTone = (focus: string) => focus === "INTERVENE" ? "bg-rose-100 text-rose-900" : focus === "ADVANCE" ? "bg-emerald-100 text-emerald-900" : focus === "PROVE" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";

export default function MultiBrandIntelligencePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/nexus/multi-brand-intelligence", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunne ikke laste portfolio intelligence."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><Building2 size={17}/> Multi-brand Intelligence</div><h1 className="mt-2 text-3xl font-black tracking-tight">{data?.headline || "Én trygg porteføljevisning for alle brands"}</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Brand-isolert canonical attribution og Revenue Brain summeres til aggregerte beslutningssignaler. Ingen kontakter, leads eller opportunity-detaljer flyttes mellom brands.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Oppdater</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">{[
        ["Brands", data?.summary?.brands || 0], ["Intervene", data?.summary?.intervene || 0], ["Advance", data?.summary?.advance || 0], ["Prove", data?.summary?.prove || 0], ["Monitor", data?.summary?.monitor || 0], ["Leads", data?.summary?.canonicalLeads || 0], ["Sales", data?.summary?.canonicalSales || 0], ["Representert verdi", money(data?.summary?.representedValue || 0)],
      ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-700 bg-white/5 p-4"><div className="text-xl font-black">{value}</div><div className="mt-1 text-[10px] font-bold uppercase text-slate-400">{label}</div></div>)}</div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900"><AlertTriangle size={17} className="mr-2 inline"/>{error}</div>}
    {(data?.warnings || []).map((warning) => <div key={warning} className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{warning}</div>)}
    {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600"><Loader2 size={18} className="mr-2 inline animate-spin"/>Bygger aggregert porteføljebilde…</div>}

    <section className="grid gap-4 lg:grid-cols-2">{(data?.brands || []).map((brand, index) => <article key={brand.brandId} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase text-slate-400">#{index + 1} · {brand.kind} · {brand.growthStage}</div><h2 className="mt-1 text-xl font-black">{brand.brandName}</h2></div><div className="flex gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-black ${focusTone(brand.focus)}`}>{brand.focus}</span><span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black text-white">Attention {brand.attentionScore}</span></div></div>
      <p className="mt-4 rounded-2xl bg-cyan-50 p-4 text-sm font-bold leading-6 text-cyan-950">{brand.nextAction}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Opportunities" value={brand.revenue.opportunities}/><Metric label="Cash now" value={brand.revenue.cashNow}/><Metric label="Leads / qualified" value={`${brand.outcomes.leads} / ${brand.outcomes.qualified}`}/><Metric label="Coverage" value={`${brand.outcomes.attributionCoveragePercent}%`}/></div>
      <div className="mt-4 space-y-1">{brand.evidence.map((line) => <div key={line} className="text-xs leading-5 text-slate-600">{line}</div>)}</div>
      <div className="mt-4 flex flex-wrap gap-2"><Link href={`/nexus-os/revenue-brain?brand=${encodeURIComponent(brand.brandId)}`} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Revenue Brain</Link><Link href={`/attribution?scope=${encodeURIComponent(brand.brandId)}`} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">Canonical attribution</Link></div>
    </article>)}</section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">Cross-brand review queue</div><h2 className="mt-1 text-xl font-black">Aggregert mønstergjenbruk</h2><p className="mt-2 text-sm text-slate-600">Forslag vises bare for relaterte brands med delte pillars og kanaler. Hvert forslag krever menneskelig vurdering og separat test i target-brandet.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900"><ShieldCheck size={15}/>Ingen automatisk overføring</span></div>
      <div className="mt-4 space-y-3">{(data?.transferReviews || []).map((item) => <div key={`${item.sourceBrandId}:${item.targetBrandId}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-4"><b>{item.sourceBrandId}</b><ArrowRight size={16}/><b>{item.targetBrandId}</b><span className="text-sm text-slate-600">{item.reason}</span><span className="ml-auto text-xs font-bold text-slate-400">{item.evidenceScope} · {item.sharedChannels.join(", ")}</span></div>)}{!loading && !(data?.transferReviews || []).length && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Ingen sikre tverr-brand-hypoteser nå.</div>}</div>
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-lg font-black">{value}</div><div className="text-[10px] font-bold uppercase text-slate-500">{label}</div></div>;
}
