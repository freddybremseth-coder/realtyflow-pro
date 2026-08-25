"use client";

import { useEffect, useState } from "react";

type Row = { id:string; book_id:string; channel:string; marketplace:string|null; external_id:string|null; product_url:string|null; format:string|null; language:string|null; title:string|null; subtitle:string|null; book?:{title:string;slug:string;language:string|null}|null };
type Candidate = { id:string; book_id:string; channel:string; marketplace:string|null; external_id:string|null; proposed_format:string|null; proposed_language:string|null; proposed_title:string|null; proposed_subtitle:string|null; proposed_product_url:string|null; source:string; confidence:number; status:string; book?:{title:string;slug:string;language:string|null}|null };
type Payload = { summary:{ channelRows:number; amazonRows:number; missingFormat:number; missingLanguage:number; missingTitle:number; pending:number; approved:number; applied:number }; rows:Row[]; candidates:Candidate[] };

function Metric({label,value}:{label:string;value:string|number}) { return <div style={{border:'1px solid #e2e8f0',borderRadius:12,padding:14,background:'white'}}><div style={{fontSize:12,color:'#64748b',fontWeight:800}}>{label}</div><div style={{fontSize:26,fontWeight:900,marginTop:4}}>{value}</div></div>; }

export default function ChannelMetadataPage(){
  const [data,setData]=useState<Payload|null>(null); const [error,setError]=useState<string|null>(null); const [busy,setBusy]=useState<string|null>(null);
  const load=async()=>{ const r=await fetch('/api/book-growth/channel-metadata',{cache:'no-store',credentials:'same-origin'}); const b=await r.json().catch(()=>({})); if(!r.ok) throw new Error(b?.error||`HTTP ${r.status}`); setData(b); };
  useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:String(e)))},[]);
  const act=async(id:string,action:'approve'|'reject'|'apply')=>{ setBusy(id); setError(null); try{ const r=await fetch('/api/book-growth/channel-metadata',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId:id,action})}); const b=await r.json().catch(()=>({})); if(!r.ok) throw new Error(b?.error||`HTTP ${r.status}`); await load(); }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(null)} };
  const s=data?.summary;
  return <div style={{maxWidth:1500,margin:'0 auto',padding:24,fontFamily:'system-ui,sans-serif'}}>
    <h1 style={{margin:0,fontSize:27}}>Channel Metadata Verification</h1>
    <p style={{color:'#64748b'}}>Verifisert metadata per kanal og marketplace. Ingen felt fylles fra antakelser; kandidat → approve → apply.</p>
    {error&&<div style={{padding:12,background:'#fef2f2',color:'#b91c1c',borderRadius:8}}>⛔ {error}</div>}
    {s&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginTop:16}}>
      <Metric label="Amazon rows" value={s.amazonRows}/><Metric label="Mangler format" value={s.missingFormat}/><Metric label="Mangler language" value={s.missingLanguage}/><Metric label="Mangler title" value={s.missingTitle}/><Metric label="Pending" value={s.pending}/><Metric label="Approved" value={s.approved}/><Metric label="Applied" value={s.applied}/>
    </div>}
    <section style={{marginTop:18,border:'1px solid #e2e8f0',borderRadius:12,background:'white',overflow:'hidden'}}>
      <div style={{padding:14,borderBottom:'1px solid #e2e8f0',fontWeight:900}}>Current channel metadata</div>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:'#f8fafc',textAlign:'left'}}>{['Bok','Channel','Marketplace','External ID','Format','Language','Channel title'].map(h=><th key={h} style={{padding:9,borderBottom:'1px solid #e2e8f0'}}>{h}</th>)}</tr></thead><tbody>{(data?.rows??[]).map(r=><tr key={r.id}><td style={{padding:9,borderBottom:'1px solid #f1f5f9'}}><b>{r.book?.title??r.book_id}</b></td><td style={{padding:9,borderBottom:'1px solid #f1f5f9'}}>{r.channel}</td><td style={{padding:9,borderBottom:'1px solid #f1f5f9'}}>{r.marketplace??'—'}</td><td style={{padding:9,borderBottom:'1px solid #f1f5f9'}}>{r.external_id??'—'}</td><td style={{padding:9,borderBottom:'1px solid #f1f5f9'}}>{r.format??'Mangler'}</td><td style={{padding:9,borderBottom:'1px solid #f1f5f9'}}>{r.language??'Mangler'}</td><td style={{padding:9,borderBottom:'1px solid #f1f5f9'}}>{r.title??'Mangler'}</td></tr>)}</tbody></table></div>
    </section>
    <section style={{marginTop:18}}><h2>Verification candidates</h2><div style={{display:'grid',gap:10}}>{(data?.candidates??[]).map(c=><article key={c.id} style={{border:'1px solid #e2e8f0',borderRadius:12,padding:14,background:'white'}}><div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><div><b>{c.book?.title??c.book_id}</b><div style={{fontSize:12,color:'#64748b'}}>{c.channel} · {c.marketplace??'global'} · {c.external_id??'—'} · source {c.source} · confidence {c.confidence}</div></div><b>{c.status.toUpperCase()}</b></div><div style={{marginTop:8,fontSize:13}}>format: <b>{c.proposed_format??'—'}</b> · language: <b>{c.proposed_language??'—'}</b> · title: <b>{c.proposed_title??'—'}</b></div>{c.status==='pending'&&<div style={{display:'flex',gap:8,marginTop:10}}><button disabled={busy===c.id} onClick={()=>void act(c.id,'approve')}>Godkjenn</button><button disabled={busy===c.id} onClick={()=>void act(c.id,'reject')}>Avvis</button></div>}{c.status==='approved'&&<button disabled={busy===c.id} onClick={()=>void act(c.id,'apply')} style={{marginTop:10}}>Apply metadata</button>}</article>)}</div></section>
  </div>;
}
