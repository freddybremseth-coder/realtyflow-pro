"use client";

import { useEffect, useState } from "react";

type SeriesRow = {
  id:string; slug:string; title:string; books:number; asinLinked:number; samples:number; covers:number;
  royalties90d:number; units90d:number; pagesRead90d:number; adSpend90d:number; adSales90d:number; roas:number|null;
  events90d:{bookViews:number;seriesClicks:number;amazonClicks:number;sampleClicks:number}; estimatedReadthrough:number|null;
  entryBook:{id:string;title:string;slug:string;seriesNumber:number|null;asinLinked:boolean}|null; opportunityScore:number;
};

type Payload={generatedAt:string;windowDays:number;series:SeriesRow[]};

export default function SeriesGrowthPage(){
  const [data,setData]=useState<Payload|null>(null); const [error,setError]=useState<string|null>(null); const [loading,setLoading]=useState(true);
  async function load(){ setLoading(true); setError(null); try{ const r=await fetch('/api/book-growth/series',{cache:'no-store',credentials:'same-origin'}); const b=await r.json(); if(!r.ok) throw new Error(b?.error||`Feil ${r.status}`); setData(b);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);} }
  useEffect(()=>{void load();},[]);
  return <div style={{maxWidth:1500,margin:'0 auto',padding:24,fontFamily:'system-ui,sans-serif'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h1 style={{margin:0,fontSize:27}}>Series Growth Intelligence</h1><p style={{margin:'6px 0 0',color:'#64748b'}}>Entry books, ASIN coverage, read-through og økonomisk opportunity per serie.</p></div><button onClick={load} disabled={loading} style={{border:0,borderRadius:9,padding:'9px 13px',background:'#0f172a',color:'white',fontWeight:800}}>{loading?'Laster…':'Oppdater'}</button></div>
    {error&&<div style={{marginTop:16,padding:12,borderRadius:8,background:'#fef2f2',color:'#b91c1c'}}>{error}</div>}
    <section style={{marginTop:18,padding:14,borderRadius:12,background:'#f8fafc',border:'1px solid #e2e8f0'}}><b>Modell v1</b><div style={{marginTop:5,fontSize:13,color:'#475569'}}>Opportunity = reader intent + kataloggap + økonomiske signaler. Read-through vises først når Book Report har units per bok; null betyr manglende evidens, ikke 0%.</div></section>
    <div style={{display:'grid',gap:12,marginTop:18}}>{(data?.series??[]).map((s,i)=><article key={s.id} style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><div><div style={{fontSize:11,fontWeight:900,color:'#64748b'}}>#{i+1} · OPPORTUNITY {s.opportunityScore}</div><h2 style={{margin:'4px 0 0',fontSize:20}}>{s.title}</h2><div style={{marginTop:4,color:'#64748b',fontSize:12}}>{s.books} bøker · entry: {s.entryBook?.title??'—'}</div></div><div style={{fontSize:12,textAlign:'right'}}><b>ASIN {s.asinLinked}/{s.books}</b><div>Samples {s.samples}/{s.books}</div><div>Covers {s.covers}/{s.books}</div></div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginTop:12}}>
        {[
          ['Royalties 90d',s.royalties90d.toFixed(2)],['Units 90d',s.units90d],['KU pages',s.pagesRead90d],['Ad spend',s.adSpend90d.toFixed(2)],['ROAS',s.roas??'—'],['Read-through',s.estimatedReadthrough===null?'—':`${Math.round(s.estimatedReadthrough*100)}%`],['Views',s.events90d.bookViews],['Amazon clicks',s.events90d.amazonClicks],['Sample clicks',s.events90d.sampleClicks]
        ].map(([k,v])=><div key={String(k)} style={{border:'1px solid #f1f5f9',borderRadius:9,padding:10}}><div style={{fontSize:10,color:'#94a3b8',fontWeight:800}}>{k}</div><div style={{fontSize:18,fontWeight:900,marginTop:2}}>{v}</div></div>)}
      </div>
    </article>)}</div>
  </div>;
}
