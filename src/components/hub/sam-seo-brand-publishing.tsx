"use client";
import { useState } from "react";
import type { BrandPublicationStatus } from "@/services/agents/seo-brand-publisher";
import { SEO_BRAND_PUBLISHERS } from "@/services/agents/seo-brand-publishing";
const NAMES: Record<string,string> = {pinosoecolife:"Pinoso EcoLife",freddyb:"FreddyBremseth.com",
  freddypublishing:"Books",freddyart:"Art",remasterfreddy:"Re-Master Freddy",donaanna:"Doña Anna",chatgenius:"ChatGenius.pro"};
const STATUS = {monitor:"Overvåkes",blocked:"Publisering blokkert",pending:"Pågår",verified:"Publisering verifisert",rollback:"Tilbakeført"};

export function SamSEOBrandPublishing({statuses,onChanged}:{statuses:BrandPublicationStatus[];onChanged:()=>Promise<void>}) {
  const [confirm,setConfirm]=useState<string|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  async function rollback(item:BrandPublicationStatus) {
    setBusy(item.brandId); setError("");
    try {
      const response=await fetch("/api/agents/seo-brand-publishing",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"rollback",brandId:item.brandId,revision:item.revision})});
      const data=await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Kunne ikke registrere tilbakeføring");
      setConfirm(null); await onChanged();
    } catch(cause) {setError(cause instanceof Error?cause.message:"Tilbakeføringen kunne ikke registreres");}
    finally {setBusy(null);}
  }
  return <section aria-label="Automatisk publisering per brand" className="mt-3 rounded-xl border border-emerald-200 bg-white p-4">
    <h3 className="font-black">Automatisk publisering · de øvrige sju nettstedene</h3>
    <p className="mt-1 text-sm">Sam kan forbedre hovedsidens tittel og metabeskrivelse når søketallene gir grunnlag for det.
      Hvert forslag må bestå bygg og publiseringskontroller. Bare endringer bekreftet på den offentlige nettsiden telles som publisert.</p>
    <p className="mt-2 text-xs text-slate-600">Ett avgrenset metadataforsøk per hovedside i denne versjonen. Den daglige syklusen følger opp forslag, publisering og måling automatisk.
      Effekt vurderes etter en full 30-dagersperiode. Høyere rangering eller flere leads kan ikke garanteres.</p>
    {error && <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p>}
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {SEO_BRAND_PUBLISHERS.map(site=>{
        const item=statuses.find(row=>row.brandId===site.brandId);
        const pullUrl=item?.pullUrl?.startsWith("https://github.com/"+site.repository+"/pull/")?item.pullUrl:null;
        return <article key={site.brandId} className="rounded-lg border border-slate-200 p-3 text-sm">
          <h4 className="font-bold">{NAMES[site.brandId]} · {item?STATUS[item.status]:"Ikke målt ennå"}</h4>
          <a className="text-xs underline" href={site.origin+"/"} target="_blank" rel="noreferrer">Hovedside</a>
          <p className="mt-2">{item?.reason||"Venter på første automatiske kontroll av publiseringsadgangen."}</p>
          {pullUrl && <a className="mt-2 inline-block font-semibold underline" href={pullUrl} target="_blank" rel="noreferrer">Se endringsforslaget</a>}
          {item?.rollbackAvailable && item.revision && <div className="mt-2">
            {confirm===site.brandId ? <>
              <p className="text-xs">Gjenopprett tittelen og beskrivelsen fra før dette forsøket? Sam starter tilbakeføringen i neste daglige syklus.</p>
              <button type="button" disabled={busy!==null} onClick={()=>void rollback(item)} className="mt-2 rounded border border-amber-600 px-3 py-2 font-bold disabled:opacity-50">{busy===site.brandId?"Registrerer…":"Bekreft tilbakeføring"}</button>
              <button type="button" disabled={busy!==null} onClick={()=>setConfirm(null)} className="ml-3 underline">Avbryt</button>
            </> : <button type="button" onClick={()=>setConfirm(site.brandId)} className="font-semibold underline">Gjenopprett tidligere metadata</button>}
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
