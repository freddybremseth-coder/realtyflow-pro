"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, UserRoundSearch } from "lucide-react";

type Item = {
  contact:{id:string;name?:string|null;email?:string|null;pipelineStatus?:string|null;pipelineValue?:number|null;propertyInterest?:string|null;brandId?:string|null};
  candidate:{persona:string|null;confidence:number;reason:string;evidence:Array<{field:string;signal:string;excerpt:string;weight:number}>;missingInformation:string[]};
};

type Payload = { items:Item[]; requestedContactId?:string|null; summary:{alreadyApproved:number} };

const PERSONA_LABELS:Record<string,string>={retiree:"Retirement Spain",family:"Family",investor:"Investment / Rental",holiday_home:"Holiday Home",permanent_resident:"Permanent Relocation",nature_seeker:"Nature / Inland",coastal_social:"Coastal / Social"};
const APPROVABLE_BRANDS=new Set(["zeneco","soleada","pinosoecolife"]);

export default function ProfileActivationPage(){
  const params=useSearchParams();
  const contactId=String(params.get("contactId")||"");
  const [data,setData]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    if(!contactId){setError("contactId mangler");setLoading(false);return;}
    setLoading(true);setError("");
    try{
      const r=await fetch(`/api/nexus/persona-backfill/preview?contactId=${encodeURIComponent(contactId)}&limit=1`,{cache:"no-store",credentials:"same-origin"});
      const b=await r.json().catch(()=>null);
      if(!r.ok)throw new Error(b?.error||"Kunne ikke analysere buyer profile-aktivering");
      setData(b as Payload);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[contactId]);
  const item=data?.items?.[0]||null;
  const brand=String(item?.contact.brandId||"").trim().toLowerCase();
  const canApprove=Boolean(item?.candidate.persona)&&Number(item?.candidate.confidence||0)>=80&&APPROVABLE_BRANDS.has(brand);

  async function approve(){
    if(!item?.candidate.persona||!canApprove)return;
    if(!window.confirm(`Godkjenn Persona «${PERSONA_LABELS[item.candidate.persona]||item.candidate.persona}» for ${item.contact.name||item.contact.email||"kunden"}?\n\nDette bruker den eksisterende, kontrollerte Buyer Profile-writeren. Serveren rekalkulerer evidensen før lagring. Ingen e-post sendes og pipeline-status endres ikke.`))return;
    setSaving(true);setError("");setSuccess("");
    try{
      const r=await fetch("/api/nexus/persona-backfill/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactId:item.contact.id,persona:item.candidate.persona,brand})});
      const b=await r.json().catch(()=>null);
      if(!r.ok)throw new Error(b?.error?.message||b?.error||"Kunne ikke opprette Buyer Profile");
      setSuccess("Buyer Profile/Persona er godkjent. Ingen e-post er sendt, og pipeline-status er uendret.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  }

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700"><UserRoundSearch size={16}/> Buyer Profile Activation</div><h1 className="mt-2 text-3xl font-black text-slate-950">Aktiver buyer profile for én kunde</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Bruker eksisterende Persona Backfill-evidens og den allerede kontrollerte approval-writeren. Ingen massebackfill og ingen antakelser om kriterier.</p></header>
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><ShieldCheck size={16} className="mr-2 inline"/><b>Sikker modus:</b> godkjenning krever minst 80 % confidence, server-side revalidering og eksplisitt handling. Ingen kundemelding, nurture-endring eller pipeline-endring skjer.</div>
    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={16} className="mr-2 inline"/>{error}</div>}
    {success&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-950"><CheckCircle2 size={16} className="mr-2 inline"/>{success}</div>}
    {loading?<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"><Loader2 size={18} className="mr-2 inline animate-spin"/>Analyserer eksisterende CRM-evidens…</div>:item?<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-black text-slate-950">{item.contact.name||item.contact.email||"Ukjent kunde"}</h2><div className="mt-1 text-sm text-slate-500">{item.contact.email} · {item.contact.pipelineStatus} · {item.contact.brandId||"ukjent brand"}</div><p className="mt-3 text-sm leading-6 text-slate-700">{item.candidate.reason}</p></div><div className="rounded-2xl bg-slate-100 px-5 py-3 text-center"><div className="text-2xl font-black">{item.candidate.confidence}%</div><div className="text-[11px] font-black uppercase text-slate-500">confidence</div></div></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Dokumentert evidens</div><div className="mt-3 space-y-2">{item.candidate.evidence.length?item.candidate.evidence.map((e,i)=><div key={`${e.field}-${i}`} className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-black text-slate-800">{e.signal}</div><div className="mt-1 text-xs text-slate-600">{e.excerpt}</div></div>):<div className="text-sm text-slate-500">Ingen sterk evidens funnet.</div>}</div></div><div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Må avklares</div><div className="mt-3 flex flex-wrap gap-2">{item.candidate.missingInformation.length?item.candidate.missingInformation.map(v=><span key={v} className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">{v}</span>):<span className="text-sm text-emerald-700">Ingen åpenbare Persona-gap.</span>}</div></div></div><div className="mt-5 flex flex-wrap gap-2"><Link href={`/customers?contactId=${encodeURIComponent(item.contact.id)}`} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Customer 360</Link>{canApprove?<button onClick={()=>void approve()} disabled={saving} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{saving?<Loader2 size={15} className="mr-2 inline animate-spin"/>:null}Godkjenn Buyer Profile/Persona</button>:<Link href="/nexus-os/buyer-intake/reviews" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700">Buyer Intake Review</Link>}<Link href="/nexus-os/stage-readiness" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700">Tilbake til Stage Readiness</Link></div>{!canApprove&&<p className="mt-3 text-xs text-slate-500">Denne kunden kan ikke godkjennes direkte fra CRM-evidensen. Buyer Intake Review er riktig neste steg for å innhente eller godkjenne eksplisitte kriterier.</p>}</section>:<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">Ingen Persona Backfill-kandidat ble returnert for denne kontakten. Kunden kan allerede ha godkjent Persona, eller må behandles gjennom Buyer Intake Review.</div>}
  </main>;
}
