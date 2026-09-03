"use client";

import { useEffect, useState } from "react";
import { Check, Compass, Loader2, Save, Trash2 } from "lucide-react";

type PrivacyLevel = "public" | "internal" | "private" | "sensitive" | "restricted";
type Candidate = { id:string; type:string; predicate:string; statement:string; confidence:number; privacyLevel:PrivacyLevel; reason:string; sourceQuestionId:string; sourceExcerpt:string; status?:"pending"|"saved"|"discarded" };
type Subject = { id:string; display_name:string };

const QUESTIONS = [
  ["priorities", "Hva prøver du å få fremdrift på akkurat nå?"],
  ["learning", "Hva vil du lære eller forstå bedre de neste månedene?"],
  ["mentor_help", "Hva slags hjelp fra Mentor er mest nyttig for deg?"],
  ["important_areas", "Hvilke prosjekter eller livsområder er viktigst å holde oversikt over nå?"],
  ["avoid_assumptions", "Hva bør systemet være forsiktig med å anta om deg?"],
] as const;

async function jsonRequest<T>(url:string, options?:RequestInit):Promise<T>{
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options,headers:{"Content-Type":"application/json",...(options?.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body?.error||`${url} feilet (${response.status})`);
  return body as T;
}

export default function OrientationPage(){
  const [subject,setSubject]=useState<Subject|null>(null);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [extracting,setExtracting]=useState(false);
  const [saving,setSaving]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{void (async()=>{try{const b=await jsonRequest<{subject:Subject}>("/api/personal-intelligence/bootstrap",{method:"POST",body:"{}"});setSubject(b.subject);}catch(e){setError(e instanceof Error?e.message:String(e));}})();},[]);

  async function extract(){
    setExtracting(true);setError(null);setCandidates([]);
    try{
      const payload=QUESTIONS.map(([questionId])=>({questionId,answer:answers[questionId]||""})).filter(x=>x.answer.trim());
      const result=await jsonRequest<{candidates:Candidate[];writesPerformed:number}>("/api/personal-intelligence/orientation/candidates",{method:"POST",body:JSON.stringify({answers:payload})});
      setCandidates(result.candidates.map(c=>({...c,status:"pending"})));
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setExtracting(false);}
  }

  async function remember(candidate:Candidate){
    if(!subject)return;setSaving(candidate.id);setError(null);
    try{
      if(candidate.type==="goal"){
        await jsonRequest("/api/personal-intelligence/goals/confirm",{method:"POST",body:JSON.stringify({subjectEntityId:subject.id,title:candidate.statement,description:candidate.reason,privacyLevel:candidate.privacyLevel,sourceExcerpt:candidate.sourceExcerpt})});
      }else{
        await jsonRequest("/api/personal-intelligence/memory/confirm",{method:"POST",body:JSON.stringify({subjectEntityId:subject.id,predicate:candidate.predicate,statement:candidate.statement,claimType:candidate.type,confidence:candidate.confidence,privacyLevel:candidate.privacyLevel,sourceExcerpt:candidate.sourceExcerpt})});
      }
      setCandidates(current=>current.map(x=>x.id===candidate.id?{...x,status:"saved"}:x));
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(null);}
  }

  return <main className="mx-auto max-w-[1050px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Compass size={17}/> Orientation</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Help Personal Intelligence learn from evidence.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Svar bare på det du vil. Svarene analyseres til mulige memory candidates, men ingenting lagres før du eksplisitt velger Remember. Mål lagres først som idé, aldri som commitment.</p>
    </header>
    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
      {QUESTIONS.map(([id,label])=><label key={id} className="block"><span className="text-sm font-black text-slate-900">{label}</span><textarea rows={3} value={answers[id]||""} onChange={e=>setAnswers(v=>({...v,[id]:e.target.value}))} className="mt-2 w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-cyan-400" placeholder="Valgfritt svar…"/></label>)}
      <button disabled={extracting||!Object.values(answers).some(v=>v.trim())} onClick={()=>void extract()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{extracting?<Loader2 size={16} className="animate-spin"/>:<Compass size={16}/>} Find possible memories</button>
    </section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-black">Review candidates</div>
      <p className="mt-1 text-xs text-slate-500">Candidates er forslag, ikke sannheter. Du kan redigere teksten og privacy før lagring.</p>
      <div className="mt-4 space-y-3">
        {!candidates.length&&<div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Ingen candidates ennå.</div>}
        {candidates.filter(c=>c.status==="pending").map(candidate=><div key={candidate.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-black uppercase tracking-wide text-cyan-700">{candidate.type} · {Math.round(candidate.confidence*100)}% evidence confidence</span><span className="text-[11px] text-slate-400">CONFIRM required</span></div>
          <textarea value={candidate.statement} onChange={e=>setCandidates(v=>v.map(x=>x.id===candidate.id?{...x,statement:e.target.value}:x))} rows={2} className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm"/>
          <div className="mt-3 flex flex-wrap items-center gap-2"><select value={candidate.privacyLevel} onChange={e=>setCandidates(v=>v.map(x=>x.id===candidate.id?{...x,privacyLevel:e.target.value as PrivacyLevel}:x))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">{["internal","private","sensitive","restricted","public"].map(p=><option key={p}>{p}</option>)}</select><button disabled={saving===candidate.id||!candidate.statement.trim()} onClick={()=>void remember(candidate)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">{saving===candidate.id?<Loader2 size={13} className="animate-spin"/>:<Save size={13}/>} Remember</button><button onClick={()=>setCandidates(v=>v.map(x=>x.id===candidate.id?{...x,status:"discarded"}:x))} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Trash2 size={13}/> Drop</button></div>
          <div className="mt-3 text-[11px] leading-5 text-slate-400">Source: your answer to {candidate.sourceQuestionId}. {candidate.reason}</div>
        </div>)}
        {candidates.some(c=>c.status==="saved")&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><Check size={14} className="mr-1 inline"/>Saved items are now visible in Me/Freddy Core and remain correctable.</div>}
      </div>
    </section>
  </main>;
}
