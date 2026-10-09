"use client";

import { useEffect, useState } from "react";

type Item = { id:string; source_url:string; thumbnail_url?:string|null; processing_status:string; position:number };
type Payload = { items?:Item[]; visual_format?:string; error?:string };

export function CarouselPublishPreview({ draftId, onStatus }: {
  draftId:string;
  onStatus:(ready:boolean,carousel:boolean)=>void;
}) {
  const [items,setItems]=useState<Item[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [carousel,setCarousel]=useState(false);
  const [active,setActive]=useState(0);

  useEffect(()=>{
    let current=true;
    onStatus(false,false);
    setLoading(true);
    setError("");
    fetch(`/api/content-hub/drafts/${encodeURIComponent(draftId)}/media`,{cache:"no-store"})
      .then(async response=>{
        const result=await response.json() as Payload;
        if(!response.ok) throw new Error(result.error||"Bildene kunne ikke kontrolleres");
        if(!current)return;
        const series=result.items||[];
        const isCarousel=result.visual_format==="carousel";
        const valid=series.length>=2&&series.length<=10&&
          series.every(item=>item.processing_status==="ready"&&item.source_url.startsWith("https://"));
        setItems(series);
        setCarousel(isCarousel);
        onStatus(!isCarousel||valid,isCarousel);
        if(isCarousel&&!valid) setError("Karusellen krever 2–10 ferdige bilder. Kontroller bildene i Content Hub.");
      }).catch(cause=>{
        if(!current)return;
        setError(cause instanceof Error?cause.message:"Kunne ikke kontrollere bildene");
        onStatus(false,false);
      }).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[draftId,onStatus]);

  return <section className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3" aria-label="Publiseringsklar bildeforhåndsvisning">
    <p className="mb-2 text-sm font-semibold">Bilder som følger med innlegget</p>
    {loading&&<p className="text-xs text-zinc-400">Kontrollerer bildene…</p>}
    {error&&<p role="alert" className="text-xs text-amber-300">{error}</p>}
    {!loading&&items.length>0&&<>
      <div className="mx-auto max-w-[210px]">
        <img src={items[Math.min(active,items.length-1)].thumbnail_url||items[Math.min(active,items.length-1)].source_url}
          alt={`Forhåndsvisning av bilde ${active+1}`} className="aspect-[4/5] w-full rounded-lg object-cover" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <button type="button" disabled={active===0} className="rounded border border-zinc-600 px-2 py-1 disabled:opacity-30"
          onClick={()=>setActive(value=>Math.max(0,value-1))}>Forrige</button>
        <span>{active+1} / {items.length}{carousel?" · Karusell":" · Enkeltbilde"}</span>
        <button type="button" disabled={active===items.length-1} className="rounded border border-zinc-600 px-2 py-1 disabled:opacity-30"
          onClick={()=>setActive(value=>Math.min(items.length-1,value+1))}>Neste</button>
      </div>
    </>}
    {!loading&&!error&&items.length===0&&<p className="text-xs text-amber-300">Ingen bilder registrert. Velg et bilde før publisering til Instagram.</p>}
  </section>;
}
