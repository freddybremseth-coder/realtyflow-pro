"use client";

import { useEffect, useState } from "react";

type GateState = "verified" | "blocked" | "not_configured" | "needs_external_verification";
type Checklist = { id: string; label: string; state: GateState };
type Result = { ok: true; brand: "altovena"; readyForPublicForm: false; checks: Checklist[]; checkedAt: string };
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
         body.readyForPublicForm!==false)throw Error("Ugyldig aktiveringsstatus.");
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
    {data&&<ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {data.checks.map(check=><li key={check.id}
        className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/70 p-3 text-sm">
        <span>{check.label}</span>
        <span className={check.state==="verified"?"shrink-0 text-teal-300":"shrink-0 text-amber-300"}>
          {stateLabel[check.state]||"Ukjent"}
        </span>
      </li>)}
    </ul>}
    <p className="mt-3 text-xs text-slate-400">
      Kun lesetilgang. Ingen API-nøkler, personopplysninger eller skjemahenvendelser vises.
      Denne kontrollen aktiverer ingenting.
    </p>
  </section>;
}
