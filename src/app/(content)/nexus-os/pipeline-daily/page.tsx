"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, Gauge, Loader2, RefreshCw, Route, Sparkles } from "lucide-react";

type Row = { id:string; name:string; email?:string|null; brand?:string|null; pipelineStatus:string; activityAt?:string|null; staleDays?:number|null; openWork:number; nextMove?:{ action:string; reason:string; href:string }|null };
type Payload = { generatedAt:string; summary:{ activePipeline:number; inboundReplies24h:number; stalled:number; noActivity7d:number; openWork:number }; stages:Record<string,number>; stalled:Row[]; recentlyMoved:Row[]; note?:string };

export default function PipelineDailyPage() {
  const [data,setData] = useState<Payload|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const load = useCallback(async()=>{
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/nexus/pipeline-daily", { cache:"no-store", credentials:"same-origin" });
      const body = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lese pipeline");
      setData(body as Payload);
    } catch(e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  return <main className="mx-auto max-w-[1450px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Route size={16}/> Pipeline Daily</div><h1 className="mt-2 text-3xl font-black text-slate-950">Bevegelse, stagnasjon og neste tiltak</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Daglig CRM-oversikt over hvor kundene står, hvem som har beveget seg og hvilke aktive saker som mangler fremdrift.</p></div><button onClick={()=>void load()} disabled={loading} className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading?<Loader2 size={16} className="mr-2 animate-spin"/>:<RefreshCw size={16} className="mr-2"/>}Oppdater</button></div>
    </header>
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={17} className="mr-2 inline"/>{error}</div>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Aktiv pipeline" value={data?.summary.activePipeline ?? 0}/><Metric label="Svar 24t" value={data?.summary.inboundReplies24h ?? 0}/><Metric label="Står stille" value={data?.summary.stalled ?? 0}/><Metric label="Ingen aktivitet 7d" value={data?.summary.noActivity7d ?? 0}/><Metric label="Åpne oppgaver" value={data?.summary.openWork ?? 0}/>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Gauge size={17}/><h2 className="font-black text-slate-950">Pipeline nå</h2></div><div className="flex flex-wrap gap-2">{Object.entries(data?.stages || {}).sort((a,b)=>b[1]-a[1]).map(([stage,count])=><span key={stage} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{stage} · {count}</span>)}</div></section>
    <section className="space-y-3"><div><h2 className="text-xl font-black text-slate-950">Mangler bevegelse</h2><p className="mt-1 text-sm text-slate-500">Sortert etter lengst tid uten dokumentert aktivitet.</p></div>{(data?.stalled||[]).map(row=><article key={row.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><span>{row.pipelineStatus}</span><span>·</span><span>{row.brand||"ukjent brand"}</span><span>·</span><span><Clock3 size={12} className="mr-1 inline"/>{row.staleDays ?? "–"} dager</span></div><h3 className="mt-2 font-black text-slate-950">{row.name}</h3><div className="mt-1 text-xs text-slate-500">{row.email}</div><div className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-sm text-amber-950"><Sparkles size={15} className="mr-2 inline"/><b>Forslag:</b> {row.nextMove?.action}<div className="mt-1 text-xs text-slate-600">{row.nextMove?.reason}</div></div></div><Link href={row.nextMove?.href || `/customers/${row.id}`} className="inline-flex items-center rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">Åpne kunde <ArrowRight size={14} className="ml-2"/></Link></div></article>)}{!loading && data && data.stalled.length===0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">Ingen aktive saker er identifisert som stagnert akkurat nå.</div>}</section>
    {data?.note && <div className="text-xs text-slate-500">{data.note}</div>}
  </main>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-2xl font-black text-slate-950">{value}</div><div className="text-xs font-semibold text-slate-500">{label}</div></div>}
