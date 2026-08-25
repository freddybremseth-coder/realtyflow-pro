"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Inbox, Loader2, Mail, RefreshCw, ShieldCheck, Sparkles, Wrench, PauseCircle } from "lucide-react";

const BRAND_LABELS: Record<string,string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
  chatgenius: "ChatGenius.pro",
  donaanna: "Doña Anna",
  freddyb: "Freddy Bremseth",
  freddypublishing: "Freddy Publishing",
  remasterfreddy: "Re-Master Freddy",
};

type InboxRow = {
  id:string; brand_id:string; from_address:string; from_name:string|null; subject:string|null; ai_summary:string|null; ai_intent:string|null; ai_urgency:string|null; ai_sentiment:string|null; ai_suggested_action:string|null; is_read:boolean; has_draft_reply:boolean; replied_at:string|null; received_at:string|null; ageHours:number|null; score:number; reasons:string[]; draft:null|{id:string;subject:string;body_text:string;confidence:number|null;status:string;created_at:string}; ownerFocus:any;
};
type Data = { generatedAt:string; summary:any; runtime:any[]; emailAccounts:any[]; ownerFocus:any[]; inbox:InboxRow[]; policy:any };

function fmtDate(v:string|null|undefined){ if(!v) return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?v:d.toLocaleString("nb-NO",{dateStyle:"short",timeStyle:"short"}); }
function urgencyClass(v:string|null){ const x=String(v||"").toLowerCase(); if(["critical","urgent","high"].includes(x)) return "bg-rose-100 text-rose-900"; if(["medium","normal"].includes(x)) return "bg-amber-100 text-amber-900"; return "bg-slate-100 text-slate-800"; }
function healthStyle(status:string|undefined){ const s=String(status||"unknown"); if(s==="healthy") return "border-emerald-300 bg-emerald-50 text-emerald-950"; if(s==="paused") return "border-rose-300 bg-rose-50 text-rose-950"; if(s==="degraded") return "border-amber-300 bg-amber-50 text-amber-950"; return "border-slate-300 bg-slate-50 text-slate-950"; }
function healthLabel(status:string|undefined){ const s=String(status||"unknown"); if(s==="healthy") return "Frisk"; if(s==="paused") return "Pauset"; if(s==="degraded") return "Degradert"; return "Ukjent"; }

export default function NexusCommunicationsPage(){
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [brand,setBrand]=useState("all");

  async function load(){ setLoading(true); setError(""); try{ const r=await fetch("/api/nexus/communications",{cache:"no-store"}); const b=await r.json(); if(!r.ok) throw new Error(b?.error||`HTTP ${r.status}`); setData(b);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);} }
  useEffect(()=>{void load();},[]);

  async function analyze(emailId:string){
    setBusy(emailId); setError("");
    try{
      const r=await fetch("/api/email/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email_id:emailId})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(b?.error||`HTTP ${r.status}`);
      await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(null);}
  }

  const brands=useMemo(()=>Array.from(new Set((data?.inbox||[]).map(x=>x.brand_id))).sort(),[data]);
  const rows=useMemo(()=>brand==="all"?(data?.inbox||[]):(data?.inbox||[]).filter(x=>x.brand_id===brand),[data,brand]);
  const runtime=(key:string)=>data?.runtime.find((x:any)=>x.control_key===key)?.enabled;
  const autoDraftConfig=data?.runtime.find((x:any)=>x.control_key==="cron:/api/cron/email-auto-draft")?.config;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 text-slate-950 sm:p-6">
    <header className="rounded-3xl border border-cyan-800 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[.22em] text-cyan-200">Nexus OS · Communications</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black text-white">Communications Director</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">Én prioritert arbeidskø for innkommende e-post, AI-analyse, svarutkast og nurture. Nexus prioriterer Owner Focus og svarforsinkelser, men sender ikke automatisk uten at runtime/autonomy-policy eksplisitt tillater det.</p></div>
        <button onClick={load} disabled={loading} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{loading?<><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Oppdaterer</>:<><RefreshCw className="mr-2 inline h-4 w-4"/>Oppdater</>}</button>
      </div>
    </header>

    {error&&<div className="rounded-xl border border-rose-400 bg-rose-50 p-4 text-sm font-semibold text-rose-950"><AlertTriangle className="mr-2 inline h-4 w-4"/>{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {[
        ["Innboks",data?.summary?.inbox??"—",Inbox],
        ["Ulest",data?.summary?.unread??"—",Mail],
        ["Uten utkast",data?.summary?.withoutDraft??"—",Sparkles],
        [">24t uten svar",data?.summary?.unreplied24h??"—",Clock3],
        ["Kontoer med feil",data?.summary?.unhealthyEmailAccounts??"—",AlertTriangle],
        ["Nurture sent 30d",data?.summary?.nurture30d?.sent??0,CheckCircle2],
      ].map(([label,value,Icon]:any)=><div key={label} className="rounded-2xl border border-slate-300 bg-white p-4 text-slate-950 shadow-sm"><Icon className="h-5 w-5 text-cyan-800"/><div className="mt-3 text-xs font-bold uppercase text-slate-600">{label}</div><div className="mt-1 text-2xl font-black text-slate-950">{value}</div></div>)}
    </section>

    <section className="grid gap-3 lg:grid-cols-4">
      <div className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-950"><div className="text-xs font-black uppercase text-slate-600">Email ingest</div><div className={`mt-2 text-lg font-black ${runtime("cron:/api/cron/email-ingest")?"text-emerald-800":"text-slate-600"}`}>{runtime("cron:/api/cron/email-ingest")?"PÅ":"AV"}</div><Link href="/nexus-os/runtime" className="mt-3 inline-block text-sm font-black text-cyan-800">Endre i Runtime →</Link></div>
      <div className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-950"><div className="text-xs font-black uppercase text-slate-600">AI Auto-draft</div><div className={`mt-2 text-lg font-black ${runtime("cron:/api/cron/email-auto-draft")?"text-emerald-800":"text-slate-600"}`}>{runtime("cron:/api/cron/email-auto-draft")?"PÅ":"AV"}</div><div className="mt-2 text-sm text-slate-600">Batch: {autoDraftConfig?.max_per_run??"—"} per kjøring</div></div>
      <div className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-950"><div className="text-xs font-black uppercase text-slate-600">Nurture LIVE</div><div className={`mt-2 text-lg font-black ${runtime("feature:nurture_live")?"text-emerald-800":"text-slate-600"}`}>{runtime("feature:nurture_live")?"PÅ":"AV / dry-run"}</div><div className="mt-2 text-sm text-slate-600">Dry-run 30d: {data?.summary?.nurture30d?.dryRun??0}</div></div>
      <div className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-950"><div className="text-xs font-black uppercase text-slate-600">Routine auto-reply</div><div className={`mt-2 text-lg font-black ${runtime("feature:routine_email_reply_live")?"text-emerald-800":"text-slate-600"}`}>{runtime("feature:routine_email_reply_live")?"PÅ":"AV"}</div><div className="mt-2 text-sm text-slate-600">AI kan analysere og lage draft selv om sending er av.</div></div>
    </section>

    <section className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-950 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">E-postkontoer</h2><p className="mt-1 text-sm text-slate-600">Frisk = henting fungerer. Degradert = feil oppdaget. Pauset = Nexus har stoppet auto-fetch for å unngå gjentatte feil.</p></div><Link href="/settings" className="rounded-xl border border-slate-300 bg-slate-950 px-3 py-2 text-sm font-black text-white">Administrer e-postkontoer</Link></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{(data?.emailAccounts||[]).map((a:any)=><div key={`${a.brand_id}:${a.email_address}`} className={`rounded-xl border p-4 ${healthStyle(a.health_status)}`}>
        <div className="flex items-start justify-between gap-3"><div><div className="font-black">{BRAND_LABELS[a.brand_id]||a.brand_id}</div><div className="mt-1 text-xs opacity-80">{a.email_address}</div></div><span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-[10px] font-black uppercase">{healthLabel(a.health_status)}</span></div>
        <div className="mt-3 text-xs opacity-80">Sist hentet: {fmtDate(a.last_fetched_at)}</div>
        {a.health_message&&<div className="mt-3 rounded-lg border border-current/20 bg-white/70 p-2 text-xs font-semibold">{a.health_message}</div>}
        <div className="mt-2 text-xs opacity-80">Feil på rad: {Number(a.consecutive_failures||0)}</div>
        {a.needsReconnect&&<Link href="/settings" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white"><Wrench className="h-3.5 w-3.5"/>Koble/reparer</Link>}
        {a.auto_fetch_paused_by_system&&<div className="mt-2 flex items-center gap-1 text-xs font-black"><PauseCircle className="h-3.5 w-3.5"/>Auto-fetch stoppet av Nexus</div>}
      </div>)}</div>
    </section>

    <section className="rounded-2xl border border-slate-300 bg-white text-slate-950 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 p-5"><div><h2 className="text-xl font-black text-slate-950">Prioritert innboks</h2><p className="mt-1 text-sm text-slate-600">Score løftes av ulest, urgency, manglende draft, svartid og aktiv Owner Focus.</p></div><select value={brand} onChange={e=>setBrand(e.target.value)} className="rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-950"><option value="all">Alle brands</option>{brands.map(b=><option key={b} value={b}>{BRAND_LABELS[b]||b}</option>)}</select></div>
      <div className="divide-y divide-slate-200">{rows.length===0?<div className="p-8 text-center text-sm text-slate-600">Ingen meldinger i valgt filter.</div>:rows.map(row=><article key={row.id} className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black text-white">Score {row.score}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${urgencyClass(row.ai_urgency)}`}>{row.ai_urgency||"uanalysert"}</span>{row.ownerFocus&&<span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-[10px] font-black text-fuchsia-900">OWNER FOCUS</span>}{!row.is_read&&<span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-black text-cyan-900">ULEST</span>}</div><h3 className="mt-3 text-lg font-black text-slate-950">{row.subject||"(uten emne)"}</h3><div className="mt-1 text-sm text-slate-700">{row.from_name||row.from_address} · {BRAND_LABELS[row.brand_id]||row.brand_id} · {fmtDate(row.received_at)}</div>{row.ai_summary&&<p className="mt-3 text-sm leading-6 text-slate-800">{row.ai_summary}</p>}<div className="mt-3 flex flex-wrap gap-1.5">{row.reasons.map(r=><span key={r} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">{r}</span>)}</div>{row.ai_suggested_action&&<div className="mt-3 text-sm text-slate-900"><b>AI foreslår:</b> {row.ai_suggested_action}</div>}
            {row.draft&&<details className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3"><summary className="cursor-pointer text-sm font-black text-emerald-950">Svarutkast · confidence {row.draft.confidence==null?"—":Math.round(Number(row.draft.confidence)*100)+"%"}</summary><div className="mt-3 whitespace-pre-wrap text-sm text-slate-800"><b>{row.draft.subject}</b>{"\n\n"}{row.draft.body_text}</div></details>}
          </div>
          <div className="shrink-0"><button onClick={()=>analyze(row.id)} disabled={busy===row.id} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{busy===row.id?<Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>:<Sparkles className="mr-2 inline h-4 w-4"/>}{row.has_draft_reply?"Analyser på nytt":"Analyser + lag utkast"}</button></div>
        </div>
      </article>)}</div>
    </section>

    <div className="flex gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-sm text-cyan-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><div><b>Ny standard:</b> Nexus forbereder kommunikasjon 24/7. Evidensstyrt læring kan påvirke drafts, men autonom sending går fortsatt gjennom Runtime + Autonomy. Juridiske, økonomiske, prisbindende eller lav-confidence svar eskaleres.</div></div>
  </div>;
}
