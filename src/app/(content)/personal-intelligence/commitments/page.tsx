"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDot, Loader2, Target } from "lucide-react";

type Goal = { id:string; title:string; status:string; priority:number; target_date?:string|null; why_it_matters?:string|null };
type Action = { id:string; title:string; commitment_status:string; priority:number; scheduled_at?:string|null; related_goal_id?:string|null };
type Payload = { goals:Goal[]; actions:Action[]; summary:{goalIdeas:number;activeGoals:number;actionIdeas:number;considering:number;committed:number}; principles:{ideaIsNotCommitment:boolean;activeGoalIsDirectionNotExecution:boolean;statusChangesRequireExplicitOwnerAction:boolean} };
const STATUSES = ["idea","considering","committed","scheduled","in_progress","done","dropped"];

async function jsonRequest<T>(url:string, options?:RequestInit):Promise<T>{
  const response = await fetch(url,{credentials:"same-origin",cache:"no-store",...options,headers:{"Content-Type":"application/json",...(options?.headers||{})}});
  const body = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body?.error || `${url} failed (${response.status})`);
  return body as T;
}

export default function CommitmentsPage(){
  const [data,setData]=useState<Payload|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState<string|null>(null); const [error,setError]=useState<string|null>(null);
  async function load(){ setLoading(true); setError(null); try{setData(await jsonRequest<Payload>("/api/personal-intelligence/commitments"));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);} }
  useEffect(()=>{void load();},[]);
  async function update(actionId:string,status:string){ setSaving(actionId); setError(null); try{await jsonRequest("/api/personal-intelligence/commitments",{method:"PATCH",body:JSON.stringify({actionId,commitmentStatus:status})}); await load();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(null);} }
  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-700"><Target size={17}/> Goals & Commitments</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Direction is not commitment.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Goals show direction. Actions show commitment state. Nothing moves from idea to considering or committed without an explicit choice.</p>
    </header>
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
    {loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={16}/> Loading…</div> : data && <>
      <section className="grid gap-3 sm:grid-cols-5">
        {[['Goal ideas',data.summary.goalIdeas],['Active goals',data.summary.activeGoals],['Action ideas',data.summary.actionIdeas],['Considering',data.summary.considering],['Committed',data.summary.committed]].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>)}
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black"><CircleDot size={15}/> Goals</div>
        <p className="mt-1 text-xs text-slate-500">An active goal is a chosen direction, not proof that execution is committed.</p>
        <div className="mt-4 space-y-3">{data.goals.length ? data.goals.map(goal=><div key={goal.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><div className="font-black">{goal.title}</div><div className="mt-1 text-xs text-slate-500">status {goal.status} · priority {goal.priority}{goal.target_date?` · target ${goal.target_date}`:""}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase">{goal.status}</span></div>{goal.why_it_matters&&<p className="mt-2 text-sm text-slate-600">{goal.why_it_matters}</p>}</div>) : <p className="text-sm text-slate-500">No goals captured yet.</p>}</div>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={15}/> Actions & commitment state</div>
        <div className="mt-4 space-y-3">{data.actions.length ? data.actions.map(action=><div key={action.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-black">{action.title}</div><div className="mt-1 text-xs text-slate-500">priority {action.priority}{action.scheduled_at?` · ${new Date(action.scheduled_at).toLocaleString()}`:""}</div><div className="mt-3 flex flex-wrap items-center gap-2"><select disabled={saving===action.id} value={action.commitment_status} onChange={(e)=>void update(action.id,e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">{STATUSES.map(status=><option key={status} value={status}>{status}</option>)}</select>{saving===action.id&&<Loader2 size={14} className="animate-spin"/>}</div></div>) : <p className="text-sm text-slate-500">No actions captured yet.</p>}</div>
      </section>
    </>}
  </main>;
}
