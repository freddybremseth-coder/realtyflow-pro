"use client";
import { useCallback, useEffect, useState } from "react";

type Work = {id:string;title:string;brand_id:string;visibility_state:string;updated_at:string;next_action:string|null};
export function VisibilityWorkQueue(){
 const [items,setItems]=useState<Work[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
  const r=await fetch("/api/visibility/work-items",{cache:"no-store",credentials:"same-origin"});
  if(!r.ok)throw new Error("Arbeidskøen er ikke tilgjengelig");
  const data=await r.json();setItems(data.work_items||[]);
 },[]);
 useEffect(()=>{refresh().catch(()=>setMessage("Arbeidskø ikke tilgjengelig. Ingen status er bekreftet."));},[refresh]);
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
   <button type="button" onClick={sync} disabled={busy}
    className="rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
    {busy?"Registrerer…":"Registrer funn som oppgaver"}</button>
  </div>
  {message&&<p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
  <div className="mt-4 space-y-2">
   {items.length===0?<p className="text-sm text-slate-500">Ingen lagrede Visibility-oppgaver registrert eller arbeidskøen er ikke tilgjengelig.</p>:
    items.slice(0,30).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
     <div><div className="text-sm font-semibold text-slate-900">{item.title}</div>
      <div className="text-xs text-slate-500">{item.brand_id} · {item.next_action||"Ingen neste handling registrert"}</div></div>
     <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{item.visibility_state==="PROPOSED"?"Foreslått":item.visibility_state}</span>
    </div>)}
  </div>
 </section>;
}
