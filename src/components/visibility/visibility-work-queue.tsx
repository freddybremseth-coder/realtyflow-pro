"use client";
import { useCallback, useEffect, useState } from "react";

type Investigation = {result:string;checked_at:string;issue_code:string;
 evidence?:{homepageStatus:number|null;h1Count:number|null;robotsStatus:number|null;sitemapStatus:number|null;issues:string[];incomplete:boolean}};
type DesignProposal = {
 status:string;reason:string;target:string|null;change:string|null;verification:string[];
 rollback:string|null;fingerprint:string|null;canRequestDraft:boolean;publicationAuthorized:false;
};
type CodeCandidate = {
  url:string;repo:string;pullNumber:number;commitSha:string;recordedAt:string;
  reviewOnly:true;executionStarted:false;publicationAuthorized:false;
};
type Work = {id:string;title:string;brand_id:string;visibility_state:string;updated_at:string;next_action:string|null;investigation:Investigation|null;design_proposal:DesignProposal|null;design_requested:boolean;code_candidate:CodeCandidate|null};
type RunStatus={
 source:"cron"|"owner";outcome:"COMPLETED"|"SKIPPED"|"FAILED";
 reason:string;recordedAt:string;investigated:number;failed:number;skipped:number;
};
type AuditStatus={
 latestSourceAuditAt:string|null;latestIndependentAt:string|null;
 independentEvidenceLogged:boolean;cronOutcome:"NOT_PROVEN"|"COMPLETED"|"SKIPPED"|"FAILED";
 dailyScheduleUtc:string;lastRun:RunStatus|null;lastCronRun:RunStatus|null;
};
const runStatusLabels:Record<string,string>={
 COMPLETED:"Gjennomført",SKIPPED:"Hoppet over",FAILED:"Feilet",
};
const runReasonLabels:Record<string,string>={
 SAFE_MODE:"Stanset av Nexus eller sikkerhetsmodus",
 MISSING_DATABASE:"Database ikke tilgjengelig",
 SOURCE_REPORT_UNAVAILABLE:"SEO-rapporten kunne ikke leses",
 SOURCE_REPORT_STALE:"Ingen fersk SEO-rapport",
 NO_ELIGIBLE_TASKS:"Ingen aktuelle oppgaver (eller nylig undersøkt)",
 INVESTIGATION_ERROR:"Undersøkelsen feilet",
 NONE:"",
};
const investigationLabels:Record<string,string>={
 OBSERVED_AGAIN:"Observasjonen er gjentatt",NOT_REPRODUCED:"Ikke gjenskapt ved ny kontroll",
 DATA_STILL_INCOMPLETE:"Kontrollen er fortsatt ufullstendig",
 DATA_NOW_AVAILABLE:"Ny kontroll ga tilgjengelige data",
 INCONCLUSIVE:"Kontrollen gir ikke sikkert svar",
};
const displayState: Record<string,string> = {
 PROPOSED:"Foreslått",QUEUED:"I kø",RUNNING:"Pågår",AWAITING_APPROVAL:"Venter på godkjenning",
 BLOCKED:"Blokkert",VERIFYING:"Kontrolleres",UNVERIFIED:"Avsluttet uten verifisering",
 FAILED:"Feilet",CANCELLED:"Avbrutt",
};
export function VisibilityWorkQueue(){
 const [items,setItems]=useState<Work[]>([]);
 const [auditStatus,setAuditStatus]=useState<AuditStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
  const r=await fetch("/api/visibility/work-items",{cache:"no-store",credentials:"same-origin"});
  if(!r.ok)throw new Error("Arbeidskøen er ikke tilgjengelig");
  const data=await r.json();setItems(data.work_items||[]);setAuditStatus(data.audit_status||null);
 },[]);
 useEffect(()=>{refresh().catch(()=>setMessage("Arbeidskø ikke tilgjengelig. Ingen status er bekreftet."));},[refresh]);
 const investigate=async()=>{
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/visibility/investigations/run",{method:"POST",credentials:"same-origin"});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"Uavhengig kontroll kunne ikke fullføres");
   await refresh();
   setMessage(`Sam undersøkte ${data.investigated} oppgave(r), ${data.skipped} ble hoppet over (f.eks. nylig kontrollert). Ingen nettsider ble endret.`);
  }catch(e){setMessage(e instanceof Error?e.message:"Kontrollen kunne ikke fullføres");}
  finally{setBusy(false);}
 };
 const requestDesign=async(item:Work)=>{
  if(!item.design_proposal?.canRequestDraft||!item.design_proposal.fingerprint)return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/visibility/work-items/design-request",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workItemId:item.id,fingerprint:item.design_proposal.fingerprint}),
   });
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"Kunne ikke registrere forespørselen");
   await refresh();
   setMessage("Et konkret endringsutkast er etterspurt og journalført. Ingen implementering eller publisering er startet.");
  }catch(e){setMessage(e instanceof Error?e.message:"Kunne ikke registrere endringsutkast");}
  finally{setBusy(false);}
 };
 const sync=async()=>{
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/visibility/work-items/sync",{method:"POST",credentials:"same-origin"});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"Synkroniseringen ble avvist");
   await refresh();
   setMessage(`Registrerte/identifiserte ${data.accepted} undersøkelser fra lagret kontroll. Ingen reparasjoner er startet.`);
  }catch(e){setMessage(e instanceof Error?e.message:"Kunne ikke synkronisere");}
  finally{setBusy(false);}
 };
 return <section className="rounded-2xl border border-slate-200 bg-white p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="text-lg font-bold text-slate-900">Nexus arbeidskø</h2>
    <p className="mt-1 text-sm text-slate-600">Registrerte undersøkelser fra Sams lagrede SEO-kontroll. Oppgavene er forslag, ikke arbeid som utføres automatisk.</p></div>
   <div className="flex flex-wrap gap-2">
    <button type="button" onClick={sync} disabled={busy}
      className="rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {busy?"Arbeider…":"Registrer funn som oppgaver"}</button>
    <button type="button" onClick={investigate} disabled={busy}
      className="rounded-xl border border-teal-800 px-4 py-2 text-sm font-semibold text-teal-900 disabled:opacity-60">
      {busy?"Kontrollerer…":"Kontroller nå"}</button>
   </div>
  </div>
  {auditStatus&&<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" aria-label="Sams kontrollstatus">
    <div className="font-semibold">Dokumentert kontrollstatus</div>
    <div className="mt-1">Siste lagrede SEO-rapport: {auditStatus.latestSourceAuditAt?new Date(auditStatus.latestSourceAuditAt).toLocaleString("nb-NO"):"Ingen registrert"}</div>
    <div>Uavhengig etterkontroll: {auditStatus.latestIndependentAt?new Date(auditStatus.latestIndependentAt).toLocaleString("nb-NO"):"Ingen kontrollbevis registrert"}</div>
    <div className="mt-1 text-slate-600">Planlagt kontroll: {auditStatus.dailyScheduleUtc} UTC daglig. En planlagt kjøring er ikke bevis på gjennomføring.</div>
    <div className="mt-2 font-medium">Siste registrerte kjøring: {auditStatus.lastRun
      ? `${runStatusLabels[auditStatus.lastRun.outcome]} (${auditStatus.lastRun.source==="cron"?"automatisk":"manuelt"}) – ${new Date(auditStatus.lastRun.recordedAt).toLocaleString("nb-NO")}`
      : "Ingen registrerte kjøringer"}</div>
    {auditStatus.lastRun&&<div>
      {runReasonLabels[auditStatus.lastRun.reason]||"Kontroll utført"}.
      Undersøkt: {auditStatus.lastRun.investigated}, feil: {auditStatus.lastRun.failed}, hoppet over: {auditStatus.lastRun.skipped}.
    </div>}
    {auditStatus.lastCronRun&&<div className="mt-1 text-slate-600">
      Siste automatiske kjøring: {runStatusLabels[auditStatus.lastCronRun.outcome]||"Ukjent"} –
      {new Date(auditStatus.lastCronRun.recordedAt).toLocaleString("nb-NO")}.
    </div>}
    {!auditStatus.independentEvidenceLogged&&<div className="mt-1 font-semibold text-amber-800">Ingen loggført uavhengig kontroll. Eventuelle reparasjonsforslag er fortsatt sperret.</div>}
   </div>}
  {message&&<p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
  <div className="mt-4 space-y-2">
   {items.length===0?<p className="text-sm text-slate-500">Ingen lagrede Visibility-oppgaver registrert eller arbeidskøen er ikke tilgjengelig.</p>:
    items.slice(0,30).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
     <div><div className="text-sm font-semibold text-slate-900">{item.title}</div>
      <div className="text-xs text-slate-500">{item.brand_id} · {item.next_action||"Ingen neste handling registrert"}</div></div>
     <div className="text-right">
      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{displayState[item.visibility_state] || "Ukjent status"}</span>
      {item.investigation&&<div className="mt-2 text-xs text-slate-700">
       <strong>{investigationLabels[item.investigation.result]||"Undersøkt"}</strong>
       <div className="text-slate-500">Offentlig kontroll: {new Date(item.investigation.checked_at).toLocaleString("nb-NO")}</div>
       {item.investigation.evidence&&<div className="text-slate-500">
        HTTP: {item.investigation.evidence.homepageStatus??"ukjent"} · H1: {item.investigation.evidence.h1Count??"ukjent"}
       </div>}
       <div className="text-slate-500">Ingen reparasjon eller publisering utført</div>
      </div>}
      {!item.investigation&&<div className="mt-2 text-xs text-slate-500">Venter på uavhengig kontroll</div>}
      {item.code_candidate&&<div className="mt-3 max-w-md rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-800">
       <div className="font-semibold">Kodeforslag til gjennomgang</div>
       <p className="mt-1">Knyttet til din registrerte forespørsel om endringsutkast. Ingen sammenslåing eller publisering er godkjent.</p>
       <a href={item.code_candidate.url} target="_blank" rel="noopener noreferrer"
         className="mt-2 inline-block font-semibold text-teal-800 underline">
         Åpne GitHub PR #{item.code_candidate.pullNumber}
       </a>
       <p className="mt-1 text-slate-600">{item.code_candidate.repo} · Kodeversjon {item.code_candidate.commitSha.slice(0,7)}</p>
       <p className="mt-1 text-slate-500">Registrert: {new Date(item.code_candidate.recordedAt).toLocaleString("nb-NO")}. Status i GitHub må kontrolleres før eventuell godkjenning.</p>
       <p className="mt-1 font-semibold">Ikke publisert eller verifisert gjennom denne handlingen.</p>
      </div>}
      {item.design_proposal&&<div className="mt-3 max-w-md rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-xs text-slate-800">
       <div className="font-semibold">Endringsforslag – kun plan</div>
       <p className="mt-1">{item.design_proposal.reason}</p>
       {item.design_proposal.change&&<>
         <p className="mt-2 font-semibold">Foreslått endring</p><p>{item.design_proposal.change}</p>
         <p className="mt-2 font-semibold">Kontrollpunkter før og etter</p>
         <ul className="ml-4 mt-1 list-disc space-y-1">{item.design_proposal.verification.map((check,i)=><li key={i}>{check}</li>)}</ul>
         <p className="mt-2 font-semibold">Tilbakeføring</p><p>{item.design_proposal.rollback}</p>
       </>}
       {item.design_requested?<p className="mt-2 font-semibold">Endringsutkast er etterspurt – ingen publisering godkjent.</p>
       :item.design_proposal.canRequestDraft&&<button type="button" disabled={busy}
         onClick={()=>requestDesign(item)}
         className="mt-3 rounded-lg border border-teal-800 px-3 py-2 font-semibold text-teal-900 disabled:opacity-60">
         Be om endringsutkast
        </button>}
      </div>}
     </div>
    </div>)}
  </div>
 </section>;
}
