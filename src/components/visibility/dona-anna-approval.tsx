"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole, AlertTriangle } from "lucide-react";

type ConsentState = {
  brandId:"donaanna"; approved:boolean;approvedAt:string|null;expiresAt:string|null;
  scope:{version:"v1";title:string;description:string;origin:string;repository:string;file:string;fingerprint:string};
};
export function DonaAnnaVisibilityApproval(){
  const [data,setData]=useState<ConsentState|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [checked,setChecked]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);

  useEffect(()=>{
    let active=true;
    fetch("/api/visibility/approval",{credentials:"same-origin",cache:"no-store"})
      .then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||"Ingen tilgang");return body as ConsentState;})
      .then(body=>{if(active){setData(body);setLoading(false);}})
      .catch(e=>{if(active){setError(e instanceof Error?e.message:"Ukjent feil");setLoading(false);}});
    return ()=>{active=false};
  },[]);

  async function save(action:"approve"|"revoke"){
    if(!data||saving)return;
    setError(null);setMessage(null);setSaving(true);
    try{
      const response=await fetch("/api/visibility/approval",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,brandId:"donaanna",version:"v1",expectedFingerprint:data.scope.fingerprint}),
      });
      const body=await response.json();
      if(!response.ok||!body.persisted)throw new Error(body.error||"Kunne ikke lagre beslutningen");
      setData({...data,approved:body.approved,approvedAt:body.approvedAt,expiresAt:body.expiresAt});
      setMessage(body.nextStep);
      setConfirm(false);setChecked(false);
    }catch(e){setError(e instanceof Error?e.message:"Kunne ikke lagre beslutningen");}
    finally{setSaving(false);}
  }
  return <section aria-label="Doña Anna metadata-godkjenning" className="mt-4 rounded-xl border border-teal-200 bg-white p-4">
    <div className="flex items-center gap-2"><LockKeyhole size={16} className="text-teal-700"/><h4 className="text-sm font-bold text-slate-950">Eierbeslutning · Doña Anna</h4></div>
    <p className="mt-2 text-sm leading-6 text-slate-700">
      Gi Sam tillatelse til **bare** metadata-tittel og -beskrivelse på Doña Annas hovedside.
      Tillatelsen gjelder én eksakt variant i maksimalt 30 dager. Den overstyrer ikke kildeavvik,
      Google-krav, GitHub-kontroll eller offentlig verifisering.
    </p>
    {loading&&<p role="status" className="mt-3 text-xs text-slate-500">Henter godkjenningsstatus …</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {message&&<p role="status" className="mt-3 text-sm text-teal-900">{message}</p>}
    {data&&<div className="mt-3">
      {data.approved?<>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800"><CheckCircle2 size={17}/> Eierens tillatelse er lagret – ikke bekreftet publisert</p>
        <p className="mt-2 text-xs text-slate-600">Gyldig til {data.expiresAt?new Date(data.expiresAt).toLocaleDateString("nb-NO"):"ukjent"}. Sam fortsetter bare ved bestått teknisk preflight.</p>
        <button type="button" disabled={saving} onClick={()=>void save("revoke")} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Trekk tilbake tillatelsen</button>
      </>:!confirm?<>
        <button type="button" onClick={()=>setConfirm(true)} className="rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-900">Gi begrenset publiseringstillatelse</button>
        <p className="mt-2 text-xs text-slate-500">Ingen endring utføres når du åpner dette skjemaet.</p>
      </>:<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h5 className="font-bold text-slate-950">Kontroller endringsomfanget</h5>
        <p className="mt-2 break-words text-xs text-slate-600">{data.scope.origin}/ · {data.scope.repository} · {data.scope.file}</p>
        <p className="mt-3 text-sm"><strong>Ny metatittel:</strong> {data.scope.title}</p>
        <p className="mt-2 text-sm"><strong>Ny metabeskrivelse:</strong> {data.scope.description}</p>
        <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} className="mt-1"/>
          <span>Jeg godkjenner bare denne varianten. Jeg forstår at Sam må verifisere at kilde og offentlig side samsvarer før publisering.</span></label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={!checked||saving} onClick={()=>void save("approve")}
            className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving?"Lagrer …":"Bekreft begrenset tillatelse"}</button>
          <button type="button" disabled={saving} onClick={()=>{setConfirm(false);setChecked(false);}} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Avbryt</button>
        </div>
      </div>}
    </div>}
    <p className="mt-3 flex gap-2 text-xs leading-5 text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0"/> Lagret godkjenning er ikke det samme som fullført oppgave. Ferdig-status krever verifisert offentlig publisering.</p>
  </section>;
}
