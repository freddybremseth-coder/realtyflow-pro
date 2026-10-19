"use client";

import { useEffect, useState } from "react";

type GateState = "verified" | "blocked" | "not_configured" | "needs_external_verification";
type Checklist = {
  id: string;
  label: string;
  state: GateState;
  owner: string;
  verification: "automatic" | "manual";
  nextAction: string;
};
type Result = {
  ok: true; brand: "altovena"; readyForPublicForm: false;
  checks: Checklist[]; nextSteps: Checklist[];
  checkedAt: string;
};
const stateLabel: Record<GateState,string> = {
  verified: "Verifisert",
  blocked: "Blokkert",
  not_configured: "Ikke konfigurert",
  needs_external_verification: "Må kontrolleres",
};

export function AltovenaLaunchReadiness() {
  const [data,setData]=useState<Result|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError("");
    fetch("/api/workspaces/altovena/launch-readiness",{
      cache:"no-store",credentials:"same-origin",signal:controller.signal,
    }).then(async r=>{
      if(!r.ok)throw Error("Kunne ikke hente aktiveringskontroll.");
      return r.json();
    }).then(body=>{
      if(body.ok!==true||body.brand!=="altovena"||!Array.isArray(body.checks)||
         !Array.isArray(body.nextSteps)||body.readyForPublicForm!==false)throw Error("Ugyldig aktiveringsstatus.");
      if(!controller.signal.aborted)setData(body);
    }).catch(e=>{
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Status utilgjengelig");
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  },[refresh]);
  const verified=data?.checks.filter(c=>c.state==="verified").length||0;
  const all=data?.checks.length||0;
  return <section aria-label="Altovena – aktiveringskontroll"
    className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">ALTOVENA · EIERKONTROLL</p>
        <h3 className="mt-1 text-lg font-semibold">Klar for lansering?</h3>
        <p className="mt-1 text-sm text-slate-300">
          {data?verified+" av "+all+" kontrollpunkter verifisert":"Kontrollerer oppsettet…"}
          {" "}Skjemaaktivering er blokkert inntil en reell ende-til-ende-test er godkjent.
        </p>
      </div>
      <button type="button" onClick={()=>setRefresh(v=>v+1)}
        className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Kontroller på nytt</button>
    </div>
    {error&&<p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
    {loading&&!data&&<p className="mt-3 text-sm text-slate-400">Henter teknisk status…</p>}
    {data&&data.nextSteps.length>0&&<section aria-label="Neste handlinger"
      className="mt-4 space-y-3 rounded-xl border border-cyan-900/70 bg-cyan-950/20 p-4">
      <h4 className="font-semibold text-cyan-100">Dette må gjøres videre</h4>
      <p className="text-xs text-slate-300">
        Ingen oppgaver godkjennes eller utføres av denne listen.
        Automatiske kontroller er kun en teknisk status; manuelle kontroller krever egen gjennomgang.
      </p>
      <ol className="space-y-3">
        {data.nextSteps.slice(0,3).map((step,index)=><li key={step.id}
          className="rounded-lg border border-slate-700/70 p-3 text-sm">
          <p className="font-medium text-slate-100">{index+1}. {step.label}</p>
          <p className="mt-1 text-slate-300">{step.nextAction}</p>
          <p className="mt-2 text-xs text-slate-400">Ansvar: {step.owner} ·
            {step.verification==="manual"?" Manuell kontroll":" Systemkontroll"}
          </p>
        </li>)}
      </ol>
      {data.nextSteps.length>3&&<p className="text-xs text-slate-400">
        {data.nextSteps.length-3} flere krav står i oversikten nedenfor.
      </p>}
    </section>}
    {data&&<ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {data.checks.map(check=><li key={check.id}
        className="rounded-lg border border-slate-700/70 p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span>{check.label}</span>
          <span className={check.state==="verified"?"shrink-0 text-teal-300":"shrink-0 text-amber-300"}>
            {stateLabel[check.state]||"Ukjent"}
          </span>
        </div>
        {check.state!=="verified"&&<p className="mt-2 text-xs leading-5 text-slate-400">
          {check.nextAction} Ansvar: {check.owner}.
        </p>}
      </li>)}
    </ul>}
    <p className="mt-3 text-xs text-slate-400">
      Kun lesetilgang. Ingen API-nøkler, personopplysninger eller skjemahenvendelser vises.
      Denne kontrollen aktiverer ingenting.
    </p>
  </section>;
}
