"use client";
import { useEffect, useState } from "react";

const services = [
  {name:"ChatGPT Search",detail:"Omtale eller kildehenvisning i dokumentert AI-svar"},
  {name:"Google AI",detail:"Kildehenvisning eller omtale i observert AI-søkeresultat"},
  {name:"Perplexity",detail:"Kilder og merkevareomtale i observert AI-svar"},
  {name:"Microsoft Copilot",detail:"Kilder og merkevareomtale i observert AI-svar"},
];
export function VisibilityAiMonitor() {
  const [observations,setObservations]=useState<Array<{id:string;provider:string;prompt:string;observed_at:string;evidence_state:string;captured_by:string;cited_urls:string[];verification_state:string}>>([]);
  const [status,setStatus]=useState("Henter registrerte observasjoner …");
  useEffect(()=>{const controller=new AbortController();fetch("/api/visibility/ai-observations",{credentials:"same-origin",cache:"no-store",signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error("Observasjoner er ikke tilgjengelige.");return r.json();}).then(data=>{if(!controller.signal.aborted){setObservations(data.observations||[]);setStatus("");}}).catch(()=>{if(!controller.signal.aborted)setStatus("Kunne ikke hente observasjoner. Ingen AI-synlighet er bekreftet.");});return ()=>controller.abort();},[]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="AI Visibility Monitor">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-bold text-slate-950">AI Visibility Monitor</h3>
        <p className="mt-1 text-sm text-slate-600">Dokumenterbare omtaler og kildehenvisninger i AI-svar. Separate data fra Google Search Console.</p></div>
      <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Innsamling ikke koblet til</span>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {services.map(service=><div key={service.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="font-semibold text-slate-900">{service.name}</h4>
        <p className="mt-1 text-xs text-slate-600">{service.detail}</p>
        <div className="mt-3 text-xs font-semibold text-amber-800">Ingen verifiserte observasjoner hentet</div>
      </div>)}
    </div>
    <div className="mt-4 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">Registrerte enkeltobservasjoner</h4>{status&&<p role="status" className="mt-2 text-sm text-slate-600">{status}</p>}{!status&&!observations.length&&<p className="mt-2 text-sm text-slate-600">Ingen observasjoner registrert.</p>}{observations.slice(0,20).map(item=><div key={item.id} className="mt-3 border-t border-slate-100 pt-3 text-sm"><div className="font-semibold">{item.provider} · {item.evidence_state} · {item.verification_state==="INDEPENDENTLY_VERIFIED"?"Uavhengig verifisert":"Ikke uavhengig verifisert"}</div><div className="text-xs text-slate-600">{item.prompt} · {item.observed_at} · {item.captured_by==="manual"?"Manuelt oppgitt":"API-observasjon"}</div><p className="mt-1 text-xs text-slate-500">Ingen uavhengig autentisering av AI-leverandørens svar er utført.</p></div>)}</div>
    <p className="mt-4 text-xs leading-5 text-slate-600">Ingen målt omtale betyr ikke at AI-tjenesten aldri nevner nettstedet. Klassifisering av enkeltobservasjoner er kodet; automatisert innhenting, lagring, tilgangskontroll og kildebevis må ferdigstilles før vi kan vise reelle AI-resultater.</p>
  </section>;
}
