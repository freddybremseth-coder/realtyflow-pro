"use client";
import { useCallback, useEffect, useState } from "react";
import { ZENECO_AI_PROMPT_PANEL } from "@/services/agents/visibility-ai-prompt-panel";

type SampleRow={
 id:string;provider:string;sample_day:string;prompt_id:string;prompt:string;locale:string;
 status:"RESERVED"|"COMPLETED"|"FAILED";model:string|null;provider_response_id:string|null;
 answer:string|null;cited_urls:string[];consulted_urls:string[];brand_mentioned:boolean|null;
 failure_category:string|null;created_at:string;
};
type SampleInfo={enabled:boolean;provider:string;quota:string;automaticSchedulingEnabled:false;
 consumerChatGPTSearchEquivalent:false;samples:SampleRow[]};

export function VisibilityAiProviderSamples(){
 const [data,setData]=useState<SampleInfo|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [running,setRunning]=useState(false);
 const [promptId,setPromptId]=useState<string>(ZENECO_AI_PROMPT_PANEL[0].id);
 const [confirmation,setConfirmation]=useState("");
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const response=await fetch("/api/visibility/ai-search-samples",{cache:"no-store",credentials:"same-origin"});
   if(!response.ok)throw new Error("API-observasjonsloggen er ikke tilgjengelig ennå.");
   const result=await response.json() as SampleInfo;
   setData(result);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Ukjent feil");setData(null);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);

 async function run(){
  if(!data?.enabled||running)return;
  setRunning(true);setConfirmation("");
  try{
   const response=await fetch("/api/visibility/ai-search-samples",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({brandId:"zeneco",promptId,confirmRun:true}),
   });
   const result=await response.json();
   if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Søket feilet");
   setConfirmation("Én OpenAI API-websøkeprøve er dokumentert. Dette er ikke en måling av ChatGPT Search.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Søket feilet");}
  finally{setRunning(false);}
 }
 const usedToday=data?.samples.some(row=>row.sample_day===new Date().toISOString().slice(0,10));
 return <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="OpenAI API-websøkeprøver">
  <h4 className="font-bold text-slate-950">OpenAI API – dokumenterte websøkeprøver</h4>
  <p className="mt-1 text-sm text-slate-600">
   Egen datakilde for søk kjørt gjennom OpenAI API. Dette viser <strong>ikke</strong>
   plasseringer i ChatGPT-appen, Google AI Overviews eller representative søkeresultater.
  </p>
  {loading&&<p className="mt-2 text-sm text-slate-600">Kontrollerer API-oppsettet …</p>}
  {error&&<p role="status" className="mt-2 text-sm text-amber-900">{error}</p>}
  {data&&<div className="mt-3">
   <p className="text-sm text-slate-700">API-kjøringer: <strong>{data.enabled?"Aktivert":"Avslått"}</strong> · Automatisk planlegging: <strong>Av</strong> · Maks én reservering per UTC-døgn.</p>
   {!data.enabled&&<p className="mt-2 text-xs text-slate-600">Systemansvarlig må eksplisitt aktivere en separat API-nøkkel og modell før noen søk kan kjøres. Ingen betalte søk starter automatisk.</p>}
   {data.enabled&&<div className="mt-3 flex flex-wrap items-end gap-2">
    <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-700">Fast søkespørsmål
     <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" value={promptId} onChange={e=>setPromptId(e.target.value)}>
      {ZENECO_AI_PROMPT_PANEL.map(p=><option key={p.id} value={p.id}>{p.id} · {p.prompt}</option>)}
     </select>
    </label>
    <button type="button" onClick={run} disabled={running||usedToday}
     className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
     {running?"Kjører ett søk …":usedToday?"Dagens kvote brukt":"Kjør ett betalt API-websøk"}
    </button>
   </div>}
   {confirmation&&<p role="status" className="mt-2 text-sm text-green-900">{confirmation}</p>}
   {!data.samples.length&&<p className="mt-3 text-xs text-slate-600">Ingen OpenAI API-websøkeprøver registrert.</p>}
   {data.samples.slice(0,10).map(row=><div key={row.id} className="mt-3 border-t border-slate-200 pt-3 text-sm">
    <p className="font-semibold text-slate-900">{row.sample_day} · {row.prompt_id} · {row.status}</p>
    <p className="mt-1 text-xs text-slate-600">{row.prompt}</p>
    {row.status==="COMPLETED"&&<>
     <p className="mt-1 text-xs text-slate-700">Merkevare nevnt: {row.brand_mentioned?"Ja":"Nei"} · Siterte kilder: {row.cited_urls.length} · Konsulterte kilder: {row.consulted_urls.length}</p>
     <p className="mt-1 text-xs text-slate-500">Respons-ID: {row.provider_response_id} · Modell: {row.model}</p>
     <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{row.answer?.slice(0,1200)}</p>
    </>}
    {row.status==="FAILED"&&<p className="mt-1 text-xs text-amber-800">Feilet. Døgnkvoten beholdes for å forhindre utilsiktede gjentatte belastninger.</p>}
   </div>)}
  </div>}
 </section>;
}
