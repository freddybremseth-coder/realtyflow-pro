"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type Focus = "CASH_NOW" | "PIPELINE_NEXT" | "RETENTION" | "DEMAND";
type Readiness = "READY_TO_PREPARE" | "HUMAN_DECISION" | "RESEARCH_REQUIRED" | "BLOCKED";
type Decision = {
  rank: number; opportunityId: string; brandId: string; pipelineId: string; title: string; focus: Focus; readiness: Readiness;
  opportunityScore: number; confidence: number; priority: string; dueInHours: number; expectedValue: number | null; currency: string | null;
  nextAction: string; whyNow: string; desiredOutcome: string; href: string;
  policy: { capability: string; effectiveMode: string; externalSideEffectAllowed: false } | null;
  blockers: string[]; evidence: string[]; automaticExecutionAllowed: false;
};
type Payload = { headline?: string; decisions?: Decision[]; summary?: { considered: number; ranked: number; cashNow: number; pipelineNext: number; retention: number; demand: number; readyToPrepare: number; humanDecision: number; representedValue: number }; warnings?: string[]; error?: string };

function tone(readiness: Readiness) {
  return readiness === "READY_TO_PREPARE" ? "bg-emerald-100 text-emerald-800" : readiness === "HUMAN_DECISION" ? "bg-amber-100 text-amber-900" : readiness === "BLOCKED" ? "bg-rose-100 text-rose-900" : "bg-cyan-100 text-cyan-900";
}
function money(value: number | null, currency: string | null) {
  return value === null ? "Ikke dokumentert" : new Intl.NumberFormat("nb-NO", { style: "currency", currency: currency || "EUR", maximumFractionDigits: 0 }).format(value);
}

export default function RevenueBrainV2Page() {
  const [data, setData] = useState<Payload | null>(null);
  const [focus, setFocus] = useState<"ALL" | Focus>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/nexus/revenue-brain-v2", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunne ikke laste Revenue Brain v2."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const decisions = useMemo(() => (data?.decisions || []).filter((row) => focus === "ALL" || row.focus === focus), [data, focus]);

  return <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><BrainCircuit size={17}/> Revenue Brain v2</div><h1 className="mt-2 text-3xl font-black tracking-tight">{data?.headline || "Prioriter kommersiell effekt, ikke bare aktivitet"}</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Opportunity Store, pipeline-health, mission, verdi, hast og policy samlet i én beslutningskø. Revenue Brain rangerer og forklarer; eksisterende policyplan bestemmer fortsatt hva Nexus faktisk får gjøre.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Oppdater</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">{[
        ["Vurdert", data?.summary?.considered || 0], ["Rangert", data?.summary?.ranked || 0], ["Cash now", data?.summary?.cashNow || 0], ["Pipeline next", data?.summary?.pipelineNext || 0], ["Retention", data?.summary?.retention || 0], ["Demand", data?.summary?.demand || 0], ["Klar til klargjøring", data?.summary?.readyToPrepare || 0], ["Menneskebeslutning", data?.summary?.humanDecision || 0],
      ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-700 bg-white/5 p-4"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-[10px] font-bold uppercase text-slate-400">{label}</div></div>)}</div>
    </header>
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900"><AlertTriangle size={17} className="mr-2 inline"/>{error}</div>}
    {(data?.warnings || []).map((warning) => <div key={warning} className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{warning}</div>)}
    <div className="flex gap-2 overflow-x-auto">{(["ALL", "CASH_NOW", "PIPELINE_NEXT", "RETENTION", "DEMAND"] as const).map((value) => <button key={value} onClick={() => setFocus(value)} className={`rounded-full border px-3 py-2 text-xs font-black ${focus === value ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{value}</button>)}</div>
    {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600"><Loader2 size={18} className="mr-2 inline animate-spin"/>Rangerer opportunities…</div>}
    {!loading && decisions.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-sm font-bold text-emerald-900"><CheckCircle2 size={17} className="mr-2 inline"/>Ingen opportunities i dette filteret.</div>}
    <section className="space-y-4">{decisions.map((row) => <article key={row.opportunityId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black text-white">#{row.rank}</span><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-900">{row.focus}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${tone(row.readiness)}`}>{row.readiness}</span><span className="text-xs font-bold text-slate-500">{row.brandId} · {row.pipelineId}</span></div><h2 className="mt-3 text-xl font-black text-slate-950">{row.title}</h2><p className="mt-1 text-sm text-slate-600">{row.whyNow}</p></div><div className="flex gap-2"><Score label="Opportunity score" value={row.opportunityScore}/><Score label="Confidence" value={row.confidence}/></div></div>
      <div className="grid gap-4 p-5 lg:grid-cols-3 sm:p-6"><Panel title="Gjør nå"><p className="text-sm font-black leading-6 text-slate-900">{row.nextAction}</p><div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500"><Clock3 size={14}/>{row.dueInHours} timer · {money(row.expectedValue, row.currency)}</div></Panel><Panel title="Ønsket resultat"><p className="text-sm leading-6 text-slate-700">{row.desiredOutcome}</p><div className="mt-3 text-xs text-slate-500"><b>Readiness:</b> {row.readiness}<br/><b>Policy:</b> {row.policy?.capability || "mangler"} · {row.policy?.effectiveMode || "blocked"}</div></Panel><Panel title="Evidens">{row.evidence.map((value) => <div key={value} className="mt-1 text-xs leading-5 text-slate-700">{value}</div>)}{row.blockers.map((value) => <div key={value} className="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">{value}</div>)}</Panel></div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><Link href={row.href} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Åpne kanonisk arbeidsflate</Link><span className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-slate-500"><ShieldCheck size={15}/>Read-only · ingen automatisk send, approval eller pipeline-endring</span></div>
    </article>)}</section>
  </main>;
}
function Score({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-white"><div className="text-xl font-black">{value}</div><div className="text-[9px] font-bold uppercase text-slate-300">{label}</div></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{title}</div>{children}</section>; }
