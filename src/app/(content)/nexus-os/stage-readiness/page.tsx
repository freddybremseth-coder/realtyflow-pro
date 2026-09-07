"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, RefreshCw, Route, UserRoundSearch } from "lucide-react";

type Row = {
  contactId:string; name:string; email?:string|null; brand?:string|null; stage:string; pipelineValue:number;
  profile?:{id:string;status:string;purchaseReadiness?:string|null}|null; criteriaCount:number; shortlistCount:number;
  shortlistItemCount:number; interestedItemCount:number; readiness:string; nextAction:string; targetStage?:string|null; href:string;
};
type Payload = { generatedAt:string; counts:Record<string,number>; totals:{contacts:number;qualified:number;matching:number;viewing:number;missingBuyerProfile:number;readyForShortlist:number;readyForViewing:number}; rows:Row[]; note:string };

const LABELS:Record<string,string> = {
  MISSING_BUYER_PROFILE:"Mangler buyer profile",
  PROFILE_NEEDS_APPROVAL:"Buyer profile må godkjennes",
  MISSING_CRITERIA:"Mangler kjøpskriterier",
  READY_FOR_SHORTLIST:"Klar for shortlist",
  READY_FOR_MATCHING:"Klar for MATCHING",
  MATCHING_WITHOUT_SHORTLIST:"MATCHING uten shortlist",
  EMPTY_SHORTLIST:"Tom shortlist",
  AWAITING_PROPERTY_SIGNAL:"Venter på boligvalg",
  READY_FOR_VIEWING:"Klar for VIEWING",
  VIEWING_DATA_GAP:"VIEWING med datagap",
  VIEWING_ACTIVE:"Aktiv visning",
  DATA_QUALITY:"Datakvalitet",
};

export default function StageReadinessPage(){
  const [data,setData]=useState<Payload|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch("/api/nexus/stage-readiness",{cache:"no-store",credentials:"same-origin"});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.error||"Kunne ikke hente stage readiness");setData(b as Payload);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  return <main className="mx-auto max-w-[1450px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Route size={16}/> Stage Readiness</div><h1 className="mt-2 text-3xl font-black text-slate-950">QUALIFIED → MATCHING → VIEWING</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Viser den konkrete flaskehalsen for hver kunde basert på eksisterende buyer profile, kriterier og shortlist. Ingen pipeline-status endres automatisk.</p></div><button onClick={()=>void load()} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading?<Loader2 size={16} className="mr-2 inline animate-spin"/>:<RefreshCw size={16} className="mr-2 inline"/>}Oppdater</button></div></header>
    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={16} className="mr-2 inline"/>{error}</div>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"><Metric label="Totalt" value={data?.totals.contacts??0}/><Metric label="QUALIFIED" value={data?.totals.qualified??0}/><Metric label="MATCHING" value={data?.totals.matching??0}/><Metric label="VIEWING" value={data?.totals.viewing??0}/><Metric label="Mangler profil" value={data?.totals.missingBuyerProfile??0}/><Metric label="Klar shortlist" value={data?.totals.readyForShortlist??0}/><Metric label="Klar VIEWING" value={data?.totals.readyForViewing??0}/></section>
    {(data?.totals.missingBuyerProfile??0)>0&&<section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Buyer Profile Activation</div><h2 className="mt-1 text-lg font-black text-violet-950">Prioriter hvem som kan aktiveres tryggest først</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-violet-900">{data?.totals.missingBuyerProfile??0} kunder mangler Buyer Profile. Prioriteringskøen bruker eksisterende Persona Backfill-evidens til å skille mellom kan aktiveres nå, må vurderes og mangler evidens. Ingen profiler godkjennes automatisk.</p></div><Link href="/nexus-os/profile-activation-priority" className="inline-flex shrink-0 items-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-800">Åpne prioriteringskø <ArrowRight size={15} className="ml-2"/></Link></div></section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><UserRoundSearch size={17}/><h2 className="font-black text-slate-950">Flaskehalser</h2></div><div className="mt-4 flex flex-wrap gap-2">{Object.entries(data?.counts||{}).sort((a,b)=>b[1]-a[1]).map(([key,count])=><span key={key} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{LABELS[key]||key} · {count}</span>)}</div></section>
    <section className="space-y-3"><div><h2 className="text-xl font-black text-slate-950">Arbeidskø</h2><p className="mt-1 text-sm text-slate-500">Høyeste pipeline-verdi først. Manglende buyer profile går til kontrollert Profile Activation; øvrige saker åpnes i riktig eksisterende arbeidsflate.</p></div>{(data?.rows||[]).map(row=>{const activation=row.readiness==="MISSING_BUYER_PROFILE";const actionHref=activation?`/nexus-os/stage-readiness/profile-activation?contactId=${encodeURIComponent(row.contactId)}`:row.href;return <article key={row.contactId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><span>{row.stage}</span><span>·</span><span>{row.brand||"ukjent brand"}</span><span>·</span><span>{LABELS[row.readiness]||row.readiness}</span></div><h3 className="mt-2 font-black text-slate-950">{row.name}</h3><div className="mt-1 text-xs text-slate-500">{row.email}</div><div className="mt-3 rounded-xl bg-cyan-50 p-3 text-sm text-cyan-950"><b>Neste steg:</b> {row.nextAction}{row.targetStage&&<div className="mt-1 text-xs font-black">Mål: {row.stage} → {row.targetStage}</div>}</div><div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600"><span>Profil: {row.profile?.status||"ingen"}</span><span>· kriterier: {row.criteriaCount}</span><span>· shortlists: {row.shortlistCount}</span><span>· boliger: {row.shortlistItemCount}</span><span>· positive signaler: {row.interestedItemCount}</span></div></div><Link href={actionHref} className={`inline-flex items-center rounded-xl px-3 py-2 text-sm font-black text-white ${activation?"bg-violet-700":"bg-slate-950"}`}>{activation?"Aktiver buyer profile":row.readiness==="READY_FOR_SHORTLIST"||row.readiness==="MATCHING_WITHOUT_SHORTLIST"?"Åpne matching":"Åpne Customer 360"}<ArrowRight size={14} className="ml-2"/></Link></div></article>})}{!loading&&data&&data.rows.length===0&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><CheckCircle2 size={16} className="mr-2 inline"/>Ingen QUALIFIED/MATCHING/VIEWING-kunder trenger stage readiness-arbeid.</div>}</section>
    {data?.note&&<div className="text-xs text-slate-500">{data.note}</div>}
  </main>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-2xl font-black text-slate-950">{value}</div><div className="text-xs font-semibold text-slate-500">{label}</div></div>}
