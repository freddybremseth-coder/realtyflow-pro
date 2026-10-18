"use client";
import { useEffect, useState } from "react";
import { VisibilityAiManualEntry } from "./visibility-ai-manual-entry";
import { summarizeAiVisibilityLedger, type AiVisibilityLedgerRow } from "@/services/agents/visibility-ai-summary";
import { aiVisibilityMonthlyHistory } from "@/services/agents/visibility-ai-history";
import { ZENECO_AI_PROMPT_PANEL } from "@/services/agents/visibility-ai-prompt-panel";

const services = [
  {name:"ChatGPT Search",detail:"Omtale eller kildehenvisning i dokumentert AI-svar"},
  {name:"Google AI",detail:"Kildehenvisning eller omtale i observert AI-søkeresultat"},
  {name:"Perplexity",detail:"Kilder og merkevareomtale i observert AI-svar"},
  {name:"Microsoft Copilot",detail:"Kilder og merkevareomtale i observert AI-svar"},
];
export function VisibilityAiMonitor() {
  const [observations,setObservations]=useState<Array<{id:string;provider:string;prompt:string;observed_at:string;evidence_state:string;captured_by:string;cited_urls:string[];verification_state:string}>>([]);
  const [status,setStatus]=useState("Henter registrerte observasjoner …");
  useEffect(()=>{const controller=new AbortController();fetch("/api/visibility/ai-observations",{credentials:"same-origin",cache:"no-store",signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error("Observasjoner er ikke tilgjengelige.");return r.json();}).then(data=>{if(!controller.signal.aborted){setObservations(data.observations||[]);setStatus("");}}).catch(()=>{if(!controller.signal.aborted)setStatus("Kunne ikke hente observasjoner. Ingen AI-synlighet er bekreftet.");});return ()=>controller.abort();},[revision]);
  const summaries=summarizeAiVisibilityLedger(observations as AiVisibilityLedgerRow[]);
  const history=aiVisibilityMonthlyHistory(observations as AiVisibilityLedgerRow[]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="AI Visibility Monitor">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-bold text-slate-950">AI Visibility Monitor</h3>
        <p className="mt-1 text-sm text-slate-600">Dokumenterbare omtaler og kildehenvisninger i AI-svar. Separate data fra Google Search Console.</p></div>
      <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Innsamling ikke koblet til</span>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {services.map((service,index)=><div key={service.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="font-semibold text-slate-900">{service.name}</h4>
        <p className="mt-1 text-xs text-slate-600">{service.detail}</p>
        <div className="mt-3 text-xs font-semibold text-slate-700">Registrert: {summaries[index].recorded} · Uavhengig verifiserte siteringer: {summaries[index].verifiedCitations}</div><div className="mt-1 text-xs text-amber-800">Ikke verifisert: {summaries[index].manualUnverified} · Ingen representativ dekning målt</div>
      </div>)}
    </div>
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <h4 className="font-bold">AI-historikk per måned</h4>
      <p className="mt-1 text-xs text-slate-600">Antall lagrede observasjoner i begrenset utvalg (maks 100 siste registreringer). Ikke markedsandel, prosentvis AI-synlighet eller fullstendig historikk.</p>
      {!status&&!history.length&&<p className="mt-2 text-sm text-slate-600">Ingen registrerte observasjoner ennå.</p>}
      {history.length>0&&<div className="mt-3 overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm">
        <thead><tr className="border-b"><th className="py-2">Måned</th><th className="py-2 text-right">Registrert</th><th className="py-2 text-right">Uavhengig verifiserte siteringer</th><th className="py-2 text-right">Ikke verifisert</th></tr></thead>
        <tbody>{history.map(item=><tr key={item.month} className="border-b border-slate-100"><td className="py-2">{item.month}</td><td className="py-2 text-right">{item.recorded}</td><td className="py-2 text-right">{item.verifiedCitations}</td><td className="py-2 text-right">{item.unverified}</td></tr>)}</tbody>
      </table></div>}
    </div>
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <h4 className="font-bold">Standardiserte AI-søkespørsmål</h4>
      <p className="mt-1 text-xs text-slate-600">Faste, nøytrale spørsmål for fremtidige sammenligninger. Listen betyr ikke at søkene er kjørt eller at resultatene er kontrollert.</p>
      <ul className="mt-3 space-y-2">{ZENECO_AI_PROMPT_PANEL.map(item=><li key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="font-medium">{item.prompt}</div>
        <div className="mt-1 text-xs text-slate-500">{item.id} · {item.locale} · {item.intent}</div>
      </li>)}</ul>
    </div>
    <VisibilityAiManualEntry onSaved={()=>setRevision(x=>x+1)}/>
    <div className="mt-4 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">Registrerte enkeltobservasjoner</h4>{status&&<p role="status" className="mt-2 text-sm text-slate-600">{status}</p>}{!status&&!observations.length&&<p className="mt-2 text-sm text-slate-600">Ingen observasjoner registrert.</p>}{observations.slice(0,20).map(item=><div key={item.id} className="mt-3 border-t border-slate-100 pt-3 text-sm"><div className="font-semibold">{item.provider} · {item.verification_state==="INDEPENDENTLY_VERIFIED" ? item.evidence_state : item.evidence_state==="CITED" ? "Kildehenvisning oppgitt, ikke verifisert" : item.evidence_state==="MENTIONED_NOT_CITED" ? "Omtale oppgitt, ikke verifisert" : "Ingen omtale oppgitt, ikke verifisert"} · {item.verification_state==="INDEPENDENTLY_VERIFIED"?"Uavhengig verifisert":"Manuell observasjon"}</div><div className="text-xs text-slate-600">{item.prompt} · {item.observed_at} · {item.captured_by==="manual"?"Manuelt oppgitt":"API-observasjon"}</div><p className="mt-1 text-xs text-slate-500">Ingen uavhengig autentisering av AI-leverandørens svar er utført.</p></div>)}</div>
    <p className="mt-4 text-xs leading-5 text-slate-600">Ingen målt omtale betyr ikke at AI-tjenesten aldri nevner nettstedet. Klassifisering av enkeltobservasjoner er kodet; automatisert innhenting, lagring, tilgangskontroll og kildebevis må ferdigstilles før vi kan vise reelle AI-resultater.</p>
  </section>;
}
