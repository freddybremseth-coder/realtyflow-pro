"use client";
import { useState } from "react";

const reviewItems=[
 {key:"desktop",label:"Kontrollert forside på desktop i en faktisk nettleser"},
 {key:"mobile",label:"Kontrollert forside på mobil i en faktisk nettleser"},
 {key:"adminNoindex",label:"Kontrollert /admin og underliggende admin-ruter (inkl. noindex)"},
 {key:"singleH1AfterHydration",label:"Kontrollert én synlig H1 også etter at React har lastet"},
 {key:"noVisualRegression",label:"Ingen uønsket blinking, duplikatoverskrift eller layoutfeil"},
] as const;
type ReviewKey=(typeof reviewItems)[number]["key"];
type Outcome="VISUALLY_PASSED"|"ISSUES_FOUND";
type Props={workItemId:string;sha:string;onRecorded:()=>Promise<void>;onMessage:(value:string)=>void};
export function VisibilityVisualReviewForm({workItemId,sha,onRecorded,onMessage}:Props){
 const [checks,setChecks]=useState<Record<ReviewKey,boolean>>({
  desktop:false,mobile:false,adminNoindex:false,
  singleH1AfterHydration:false,noVisualRegression:false,
 });
 const [notes,setNotes]=useState("");
 const [outcome,setOutcome]=useState<Outcome>("ISSUES_FOUND");
 const [busy,setBusy]=useState(false);
 const allPass=reviewItems.every(x=>checks[x.key]);
 const canSubmit=notes.trim().length>=10 && (! (outcome==="VISUALLY_PASSED") || allPass);
 async function submit(){
  if(!canSubmit||busy)return;
  setBusy(true);onMessage("");
  try{
   const res=await fetch("/api/visibility/work-items/visual-review",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workItemId,commitSha:sha,outcome,checks,notes}),
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error||"Visuell kontroll kunne ikke lagres");
   await onRecorded();
   onMessage("Visuell gjennomgang er journalført for eksakt commit. Ingen sammenslåing eller publisering er godkjent.");
  }catch(e){onMessage(e instanceof Error?e.message:"Gjennomgangen kunne ikke registreres");}
  finally{setBusy(false);}
 }
 return <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-800">
   <div className="font-semibold">Manuell visuell kontroll – ingen publisering</div>
   <p className="mt-1 text-slate-600">Undersøk først PR-forhåndsvisningen i en ekte nettleser. Du kan kontrollere et GitHub-utkast, men kontrollen gjør det ikke klart for sammenslåing. Ikke kryss av noe som ikke er testet. Kontroll gjelder bare commit {sha.slice(0,7)}.</p>
   <div className="mt-2 space-y-2">
    {reviewItems.map(item=><label key={item.key} className="flex items-start gap-2">
      <input type="checkbox" checked={checks[item.key]}
       onChange={e=>setChecks(old=>({...old,[item.key]:e.target.checked}))}
       className="mt-0.5"/>
      <span>{item.label}</span>
     </label>)}
   </div>
   <label className="mt-3 block font-semibold">Din vurdering
    <select value={outcome} onChange={e=>setOutcome(e.target.value as Outcome)}
      className="mt-1 block w-full rounded-md border border-slate-300 p-2">
      <option value="ISSUES_FOUND">Trenger videre kontroll / feil funnet</option>
      <option value="VISUALLY_PASSED">Visuell kontroll bestått (alle punkter kreves)</option>
    </select>
   </label>
   <label className="mt-3 block font-semibold">Observasjoner (minst 10 tegn)
    <textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000}
      rows={3} className="mt-1 block w-full rounded-md border border-slate-300 p-2"
      placeholder="Beskriv hva du faktisk så, på hvilke enheter, og eventuelle feil"/>
   </label>
   <button type="button" onClick={submit} disabled={!canSubmit||busy}
    className="mt-3 rounded-lg border border-teal-800 px-3 py-2 font-semibold text-teal-900 disabled:opacity-50">
    {busy?"Registrerer…":"Journalfør visuell kontroll"}
   </button>
   <p className="mt-2 text-slate-500">Dette er kun din kontrollrapport. Den godkjenner verken PR-sammenslåing, deploy eller SEO-verifisering.</p>
 </div>;
}
