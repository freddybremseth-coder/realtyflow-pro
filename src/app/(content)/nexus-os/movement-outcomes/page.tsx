"use client";

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, Loader2, RefreshCw, Target } from "lucide-react";

type Row = { cause:string; action:string; targetStage:string|null; recommendations:number; hits:number; hitRate:number|null; avgHoursToTarget:number|null };
type Payload = { generatedAt:string; windowDays:number; outcomeWindowDays:number; totals:{ recommendations:number; measurable:number; hits:number; hitRate:number|null; avgHoursToTarget:number|null }; byRecommendation:Row[]; note:string };

export default function MovementOutcomesPage(){
  const [data,setData]=useState<Payload|null>(null);
  const [days,setDays]=useState(30);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch(`/api/nexus/movement-outcomes?days=${days}`,{cache:"no-store",credentials:"same-origin"});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.error||"Kunne ikke hente outcome-data");setData(b as Payload);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}},[days]);
  useEffect(()=>{void load();},[load]);
  return <main className="mx-auto max-w-[1450px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700"><BrainCircuit size={16}/> Movement Outcome Learning</div><h1 className="mt-2 text-3xl font-black text-slate-950">Hvilke anbefalinger flytter pipeline?</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Måler om lagrede Movement-anbefalinger faktisk etterfølges av en eksplisitt overgang til anbefalt målstadium innen 14 dager.</p></div><div className="flex flex-wrap gap-2">{[7,30,90].map(v=><button key={v} onClick={()=>setDays(v)} className={`rounded-xl px-3 py-2 text-sm font-black ${days===v?"bg-violet-700 text-white":"bg-slate-100 text-slate-700"}`}>{v} dager</button>)}<button onClick={()=>void load()} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">{loading?<Loader2 size={15} className="mr-2 inline animate-spin"/>:<RefreshCw size={15} className="mr-2 inline"/>}Oppdater</button></div></div></header>
    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Anbefalinger" value={data?.totals.recommendations??0}/><Metric label="Målbare" value={data?.totals.measurable??0}/><Metric label="Treff" value={data?.totals.hits??0}/><Metric label="Treffrate" value={data?.totals.hitRate==null?"–":`${data.totals.hitRate}%`}/><Metric label="Snitt tid til mål" value={data?.totals.avgHoursToTarget==null?"–":`${data.totals.avgHoursToTarget} t`}/></section>
    <section className="space-y-3"><div><h2 className="text-xl font-black text-slate-950">Resultat per anbefalingstype</h2><p className="mt-1 text-sm text-slate-500">Dette er observasjon, ikke automatisk selvjustering.</p></div>{(data?.byRecommendation||[]).map(row=><article key={`${row.cause}-${row.action}-${row.targetStage}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2 font-black text-slate-950"><Target size={16}/>{row.action}</div><div className="mt-1 text-xs text-slate-500">{row.cause} · mål {row.targetStage||"–"}</div></div><div className="grid grid-cols-3 gap-4 text-right"><Mini label="Anbefalt" value={row.recommendations}/><Mini label="Treff" value={row.hits}/><Mini label="Treffrate" value={row.hitRate==null?"–":`${row.hitRate}%`}/></div></div>{row.avgHoursToTarget!=null&&<div className="mt-3 text-xs font-semibold text-slate-600">Snitt {row.avgHoursToTarget} timer til målstadium.</div>}</article>)}</section>
    {data?.note&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><b>Metode:</b> {data.note}</div>}
  </main>;
}
function Metric({label,value}:{label:string;value:number|string}){return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-2xl font-black text-slate-950">{value}</div><div className="text-xs font-semibold text-slate-500">{label}</div></div>}
function Mini({label,value}:{label:string;value:number|string}){return <div><div className="text-lg font-black text-slate-950">{value}</div><div className="text-[11px] font-semibold text-slate-500">{label}</div></div>}
