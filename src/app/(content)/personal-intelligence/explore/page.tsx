"use client";

import { useEffect, useState } from "react";
import { Compass, Loader2, RefreshCw, Sparkles } from "lucide-react";

type Suggestion = { kind:"adjacent"|"stretch"|"wild_card"; title:string; whyNow:string; connection:string; suggestedFirstQuestion:string };
type Payload = { suggestions:Suggestion[]; insufficientEvidence:boolean; evidenceSummary:{claims:number;goals:number;topics:number}; safety:{readOnly:boolean;persistAsPersonalMemory:boolean;outboundActions:boolean;sensitivePermission:boolean}; writesPerformed:number };

async function loadExplore():Promise<Payload>{
  const response = await fetch("/api/personal-intelligence/explore",{credentials:"same-origin",cache:"no-store"});
  const body = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body?.error || `Explore failed (${response.status})`);
  return body as Payload;
}

const label:Record<Suggestion["kind"],string>={adjacent:"Adjacent",stretch:"Stretch",wild_card:"Wild Card"};

export default function ExplorePage(){
  const [data,setData]=useState<Payload|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  async function refresh(){ setLoading(true); setError(null); try{setData(await loadExplore());}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);} }
  useEffect(()=>{void refresh();},[]);
  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Compass size={17}/> Explore</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Curiosity with a reason.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Adjacent stays close to what is already evidenced. Stretch broadens it. Wild Card is surprising, but must still explain the connection. Explore does not save anything as memory.</p>
      <button onClick={()=>void refresh()} disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black disabled:opacity-50">{loading?<Loader2 size={14} className="animate-spin"/>:<RefreshCw size={14}/>} Refresh</button>
    </header>
    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
    {data?.insufficientEvidence ? <section className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5"><div className="flex items-center gap-2 font-black text-cyan-950"><Sparkles size={16}/> Not enough personal evidence yet</div><p className="mt-2 text-sm leading-6 text-cyan-900">Explore will not pretend generic ideas are personalized. Add confirmed interests, goals or mapped knowledge topics first.</p></section> : null}
    {!data?.insufficientEvidence && data?.suggestions?.length ? <section className="grid gap-4 md:grid-cols-3">{data.suggestions.map((item)=><article key={item.kind} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">{label[item.kind]}</div><h2 className="mt-2 text-lg font-black">{item.title}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{item.whyNow}</p><div className="mt-4 rounded-2xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Connection</div><p className="mt-1 text-sm text-slate-700">{item.connection}</p></div><div className="mt-3 rounded-2xl border border-cyan-100 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-cyan-700">Start here</div><p className="mt-1 text-sm font-semibold">{item.suggestedFirstQuestion}</p></div></article>)}</section> : null}
    {data&&<footer className="text-[11px] text-slate-500">Evidence used: {data.evidenceSummary.claims} claims · {data.evidenceSummary.goals} goals · {data.evidenceSummary.topics} topics. Read-only · no memory write · no outbound action.</footer>}
  </main>;
}
