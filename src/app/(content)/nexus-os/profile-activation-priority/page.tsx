"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, RefreshCw, Search, ShieldCheck, UserRoundSearch } from "lucide-react";

type Bucket = "READY_TO_APPROVE" | "REVIEW_REQUIRED" | "DISCOVERY_REQUIRED";
type Item = {
  contact: {
    id:string; name:string; email?:string|null; phone?:string|null; brand?:string|null;
    pipelineStatus?:string|null; pipelineValue:number; propertyInterest?:string|null;
  };
  candidate: {
    persona:string|null; confidence:number; reason:string; missingInformation:string[];
    evidence:Array<{field:string;signal:string;excerpt:string;weight:number}>;
  };
  bucket:Bucket;
  activationHref:string;
  customer360Href:string;
};
type Payload = {
  generatedAt:string;
  directApprovalConfidence:number;
  summary:{scanned:number;missingProfile:number;readyToApprove:number;reviewRequired:number;discoveryRequired:number};
  items:Item[];
};

const LABELS:Record<Bucket,string> = {
  READY_TO_APPROVE:"Kan aktiveres nå",
  REVIEW_REQUIRED:"Må vurderes",
  DISCOVERY_REQUIRED:"Mangler evidens",
};

export default function ProfileActivationPriorityPage(){
  const [data,setData]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [bucket,setBucket]=useState<"ALL"|Bucket>("ALL");

  const load=useCallback(async()=>{
    setLoading(true); setError("");
    try{
      const response=await fetch("/api/nexus/profile-activation-priority",{cache:"no-store",credentials:"same-origin"});
      const body=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(body?.error||"Kunne ikke hente profilaktiveringskø");
      setData(body as Payload);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load();},[load]);

  const items=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return (data?.items||[]).filter((item)=>{
      if(bucket!=="ALL"&&item.bucket!==bucket)return false;
      if(!q)return true;
      return [item.contact.name,item.contact.email,item.contact.phone,item.contact.brand,item.contact.propertyInterest,item.candidate.persona,item.candidate.reason,...item.candidate.evidence.map((row)=>`${row.signal} ${row.excerpt}`)].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  },[data,search,bucket]);

  return <main className="mx-auto max-w-[1450px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700"><UserRoundSearch size={16}/> Buyer Profile Activation</div><h1 className="mt-2 text-3xl font-black text-slate-950">Start med kundene vi allerede forstår</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Rangerer profil-løse real-estate-kunder med eksisterende Persona Backfill-evidens. Ingen profiler opprettes fra denne siden; hver godkjenning skjer eksplisitt i den kontrollerte aktiveringsflyten.</p></div>
        <button onClick={()=>void load()} disabled={loading} className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading?<Loader2 size={16} className="mr-2 animate-spin"/>:<RefreshCw size={16} className="mr-2"/>}Oppdater</button>
      </div>
    </header>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><ShieldCheck size={16} className="mr-2 inline"/><b>Kontrollert modus:</b> sterk kandidat betyr kun at eksisterende CRM-evidens er tydelig nok til å åpne godkjenningsflyten. Serveren revaliderer fortsatt evidensen før en Buyer Profile kan skrives.</section>
    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={16} className="mr-2 inline"/>{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Skannet" value={data?.summary.scanned??0}/><Metric label="Mangler profil" value={data?.summary.missingProfile??0}/><Metric label="Kan aktiveres nå" value={data?.summary.readyToApprove??0}/><Metric label="Må vurderes" value={data?.summary.reviewRequired??0}/><Metric label="Mangler evidens" value={data?.summary.discoveryRequired??0}/>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Søk navn, område, persona eller evidens…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-violet-500"/></div><div className="flex gap-2 overflow-x-auto">{(["ALL","READY_TO_APPROVE","REVIEW_REQUIRED","DISCOVERY_REQUIRED"] as const).map((key)=><button key={key} onClick={()=>setBucket(key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${bucket===key?"bg-violet-700 text-white":"border border-slate-300 bg-white text-slate-700"}`}>{key==="ALL"?"Alle":LABELS[key]}</button>)}</div></div></section>

    <section className="space-y-3">
      {items.map((item)=><article key={item.contact.id} className={`rounded-2xl border p-5 shadow-sm ${item.bucket==="READY_TO_APPROVE"?"border-emerald-200 bg-emerald-50":item.bucket==="REVIEW_REQUIRED"?"border-violet-200 bg-violet-50":"border-amber-200 bg-amber-50"}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-slate-950">{item.contact.name}</h2><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">{LABELS[item.bucket]}</span>{item.candidate.persona&&<span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white">{item.candidate.persona}</span>}<span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">{item.candidate.confidence}%</span></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{item.contact.pipelineStatus}</span><span>{item.contact.brand}</span><span>{item.contact.email||"ingen e-post"}</span></div><p className="mt-3 text-sm leading-6 text-slate-700">{item.candidate.reason}</p>{item.candidate.missingInformation.length>0&&<div className="mt-3 flex flex-wrap gap-2">{item.candidate.missingInformation.map((value)=><span key={value} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800">Mangler: {value}</span>)}</div>}</div><div className="flex shrink-0 flex-wrap gap-2"><Link href={item.customer360Href} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">Customer 360</Link><Link href={item.activationHref} className="inline-flex items-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Åpne aktivering <ArrowRight size={13} className="ml-2"/></Link></div></div></article>)}
      {!loading&&data&&items.length===0&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><CheckCircle2 size={16} className="mr-2 inline"/>Ingen kunder matcher dette filteret.</div>}
    </section>
  </main>;
}

function Metric({label,value}:{label:string;value:number}){return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-2xl font-black text-slate-950">{value}</div><div className="text-xs font-semibold text-slate-500">{label}</div></div>}
