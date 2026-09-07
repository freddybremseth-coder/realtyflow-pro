"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FlaskConical, Loader2, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";

type Category = "LOW_HIT_RATE"|"SLOW"|"STRONG"|"NEUTRAL"|"IMMATURE";
type Suggestion = { cause:string; action:string; targetStage:string; samples:number; hits:number; hitRate:number; avgHoursToTarget:number|null; category:Category; severity:"HIGH"|"MEDIUM"|"POSITIVE"|"INFO"; recommendation:string; rationale:string };
type Payload = { generatedAt:string; thresholds:{ minimumSamples:number; lowHitRate:number; strongHitRate:number; slowHours:number }; categories:Record<Category,number>; suggestions:Suggestion[]; note:string };

const GROUPS:{key:Category;title:string;description:string}[]=[
  {key:"LOW_HIT_RATE",title:"Lav treffrate",description:"Modne regler som sjelden flytter kunden til ønsket neste steg."},
  {key:"SLOW",title:"Treg bevegelse",description:"Regler som virker, men bruker for lang tid på å skape ønsket overgang."},
  {key:"STRONG",title:"Sterke regler",description:"Modne regler med høy dokumentert treffrate."},
  {key:"IMMATURE",title:"For lite datagrunnlag",description:"Regler som ennå ikke har nok observasjoner til en trygg vurdering."},
];

export default function RuleImprovementsPage(){
  const [data,setData]=useState<Payload|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch("/api/nexus/rule-improvement-suggestions",{cache:"no-store",credentials:"same-origin"});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.error||"Kunne ikke hente forbedringsforslag");setData(b as Payload);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const grouped=useMemo(()=>{const map=new Map<Category,Suggestion[]>();for(const group of GROUPS)map.set(group.key,[]);for(const item of data?.suggestions||[]){if(map.has(item.category))map.get(item.category)!.push(item);}return map;},[data]);
  return <main className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><SlidersHorizontal size={16}/> Rule Improvement Suggestions</div><h1 className="mt-2 text-3xl font-black text-slate-950">Hva bør Nexus vurdere å forbedre?</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Bygger kun på målte Movement-anbefalinger og senere pipeline-overganger. Ingen regler endres automatisk.</p></div><button onClick={()=>void load()} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading?<Loader2 size={16} className="mr-2 inline animate-spin"/>:<RefreshCw size={16} className="mr-2 inline"/>}Oppdater</button></div></header>
    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={16} className="mr-2 inline"/>{error}</div>}
    <section className="grid gap-3 sm:grid-cols-4"><Metric label="Lav treffrate" value={data?.categories.LOW_HIT_RATE??0}/><Metric label="Treg bevegelse" value={data?.categories.SLOW??0}/><Metric label="Sterke regler" value={data?.categories.STRONG??0}/><Metric label="For lite data" value={data?.categories.IMMATURE??0}/></section>
    {GROUPS.map(group=>{const items=grouped.get(group.key)||[];return <section key={group.key} className="space-y-3"><div className="flex items-center gap-2"><GroupIcon category={group.key}/><div><h2 className="text-lg font-black text-slate-950">{group.title} · {items.length}</h2><p className="text-sm text-slate-500">{group.description}</p></div></div>{items.length===0?<div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Ingen regler i denne gruppen akkurat nå.</div>:items.map((s,i)=><article key={`${s.cause}-${s.targetStage}-${i}`} className={`rounded-2xl border p-5 ${s.category==="LOW_HIT_RATE"?"border-rose-200 bg-rose-50":s.category==="SLOW"?"border-amber-200 bg-amber-50":s.category==="STRONG"?"border-emerald-200 bg-emerald-50":"border-slate-200 bg-white"}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-slate-500">{s.cause} · → {s.targetStage}</div><h3 className="mt-1 font-black text-slate-950">{s.action}</h3><p className="mt-2 text-sm text-slate-700">{s.rationale}</p><p className="mt-3 text-sm font-semibold text-slate-950">Forslag: {s.recommendation}</p></div><div className="min-w-[180px] rounded-xl bg-white p-3 text-sm shadow-sm"><div className="font-black text-slate-950">{s.hitRate}% treff</div><div className="mt-1 text-xs text-slate-500">{s.hits}/{s.samples} observasjoner</div><div className="mt-1 text-xs text-slate-500">{s.avgHoursToTarget==null?"Ingen målte treff":`${s.avgHoursToTarget} t i snitt`}</div></div></div></article>)}</section>})}
    {!loading&&data&&(data.suggestions||[]).length===0&&<div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600"><CheckCircle2 size={16} className="mr-2 inline"/>Ingen anbefalingsgrupper er målt ennå. Nexus fortsetter å samle daglige snapshots.</div>}
    {data?.note&&<div className="text-xs text-slate-500">{data.note}</div>}
  </main>;
}
function Metric({label,value}:{label:string;value:number|string}){return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-2xl font-black text-slate-950">{value}</div><div className="text-xs font-semibold text-slate-500">{label}</div></div>}
function GroupIcon({category}:{category:Category}){if(category==="LOW_HIT_RATE")return <AlertTriangle size={18} className="text-rose-700"/>;if(category==="SLOW")return <Clock3 size={18} className="text-amber-700"/>;if(category==="STRONG")return <ShieldCheck size={18} className="text-emerald-700"/>;return <FlaskConical size={18} className="text-slate-600"/>}
