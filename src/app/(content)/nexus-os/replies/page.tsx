"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Brain, Clock3, Flame, HelpCircle, Inbox, Loader2, MailCheck, RefreshCw, Send, ShieldOff, ThumbsDown, ThumbsUp } from "lucide-react";

type PropertySuggestion = { id:string; ref?:string|null; title?:string|null; price?:number|null; location?:string|null; bedrooms?:number|null; bathrooms?:number|null; primaryImage?:string|null; feedbackScore?:number; matchReason?:string|null };
type CustomerMemory = { known:string[]; avoid:string[]; evidenceCount:number; confidence:"high"|"medium"|"low" };
type ImportantReply = {
  messageId:string;
  brandId:string;
  contactId?:string|null;
  from:{ name?:string|null; email:string };
  subject?:string|null;
  summary?:string|null;
  intent?:string|null;
  urgency?:string|null;
  suggestedAction?:string|null;
  receivedAt?:string|null;
  ageMinutes?:number|null;
  priorityScore:number;
  hotLeadScore:number;
  hotLeadLabel:"HOT"|"WARM"|"ACTIVE"|"NORMAL";
  nextBestQuestion?:string|null;
  customerMemory?:CustomerMemory;
  draft?:{ id:string; subject?:string|null; bodyText?:string|null; confidence?:number|null; status?:string|null }|null;
  suggestedProperties:PropertySuggestion[];
};
type Payload = {
  generatedAt:string;
  memoryWindowDays?:number;
  summary:{ sent:number; inboundReplies:number; actionableUnanswered:number; hotLeads:number; slaAtRisk:number; purchasedLost:number; unsubscribed:number; suppressedContacts:number };
  importantReplies:ImportantReply[];
  note?:string;
};

function ageLabel(minutes:number|null|undefined) {
  if (minutes == null) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}t${mins ? ` ${mins}m` : ""}`;
}

function sla(reply: ImportantReply) {
  const urgency = String(reply.urgency || "").toLowerCase();
  const target = urgency === "critical" || urgency === "high" ? 15 : urgency === "medium" ? 30 : 60;
  const age = Number(reply.ageMinutes || 0);
  return { target, breached: age > target, dueIn: Math.max(0, target - age) };
}

export default function NexusReplyCommandCenter() {
  const [data, setData] = useState<Payload|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/nexus/communications/daily-summary", { cache:"no-store", credentials:"same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Kunne ikke lese communications (${response.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <main className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Inbox size={16}/> Nexus Reply Command</div>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Svar kundene mens de er aktive</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Hot Lead Score, svar-SLA, dokumentert kundehistorikk, AI-utkast, Next Best Question og boligforslag som tar hensyn til tidligere interesse og avvisninger.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 size={16} className="mr-2 animate-spin"/> : <RefreshCw size={16} className="mr-2"/>}Oppdater</button>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><div className="flex gap-2"><AlertTriangle size={18}/><div><b>Kunne ikke lese Reply Command.</b><div className="mt-1">{error}</div></div></div></div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
      <Metric icon={<Send size={18}/>} label="Sendt 24t" value={data?.summary.sent ?? 0}/>
      <Metric icon={<MailCheck size={18}/>} label="Svar mottatt" value={data?.summary.inboundReplies ?? 0}/>
      <Metric icon={<Clock3 size={18}/>} label="Må besvares" value={data?.summary.actionableUnanswered ?? 0}/>
      <Metric icon={<Flame size={18}/>} label="HOT leads" value={data?.summary.hotLeads ?? 0}/>
      <Metric icon={<Clock3 size={18}/>} label="SLA risiko" value={data?.summary.slaAtRisk ?? 0}/>
      <Metric icon={<ShieldOff size={18}/>} label="Kjøpt / tapt" value={data?.summary.purchasedLost ?? 0}/>
      <Metric icon={<ShieldOff size={18}/>} label="Avmeldt" value={data?.summary.unsubscribed ?? 0}/>
      <Metric icon={<ShieldOff size={18}/>} label="Suppressed" value={data?.summary.suppressedContacts ?? 0}/>
    </section>

    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">Svar nå</h2><p className="mt-1 text-sm text-slate-500">Sortert etter Hot Lead Score. Kundeminne bygger på CRM, dialog og eksplisitt boligfeedback.</p></div><Link href="/nexus-os/communications" className="text-sm font-black text-cyan-700">Åpne Communications <ArrowRight size={14} className="inline"/></Link></div>
      {(data?.importantReplies ?? []).map(reply => {
        const s = sla(reply);
        const memory = reply.customerMemory;
        return <article key={reply.messageId} className={`rounded-2xl border p-5 shadow-sm ${s.breached ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                <span>{reply.brandId}</span><span>·</span><span>{reply.urgency || "normal"}</span><span>·</span><span>{ageLabel(reply.ageMinutes)} siden</span>
                <span className={`rounded-full px-2 py-1 ${reply.hotLeadLabel === "HOT" ? "bg-orange-100 text-orange-900" : reply.hotLeadLabel === "WARM" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}><Flame size={12} className="mr-1 inline"/>{reply.hotLeadLabel} {reply.hotLeadScore}/100</span>
                <span className={`rounded-full px-2 py-1 ${s.breached ? "bg-rose-200 text-rose-950" : "bg-emerald-100 text-emerald-800"}`}>{s.breached ? `SLA brutt · mål ${s.target} min` : `Svar innen ${s.dueIn} min`}</span>
              </div>
              <h3 className="mt-2 text-lg font-black text-slate-950">{reply.from.name || reply.from.email}</h3>
              <div className="mt-1 text-sm font-bold text-slate-700">{reply.subject || "Uten emne"}</div>
              {reply.summary && <p className="mt-3 text-sm leading-6 text-slate-700">{reply.summary}</p>}

              {memory && memory.evidenceCount > 0 && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700"><Brain size={15}/>Kjent om kunden</div><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{memory.confidence} confidence · {memory.evidenceCount} signaler</span></div>
                {memory.known.length > 0 && <ul className="mt-3 space-y-1 text-sm leading-5 text-slate-700">{memory.known.slice(0,5).map((item,index)=><li key={`${reply.messageId}-known-${index}`} className="flex gap-2"><ThumbsUp size={14} className="mt-0.5 shrink-0 text-emerald-600"/><span>{item}</span></li>)}</ul>}
                {memory.avoid.length > 0 && <div className="mt-3 border-t border-slate-100 pt-3"><div className="text-xs font-black uppercase tracking-wider text-rose-700">Unngå</div><ul className="mt-2 space-y-1 text-sm leading-5 text-rose-900">{memory.avoid.map((item,index)=><li key={`${reply.messageId}-avoid-${index}`} className="flex gap-2"><ThumbsDown size={14} className="mt-0.5 shrink-0"/><span>{item}</span></li>)}</ul></div>}
              </div>}

              {reply.nextBestQuestion && <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 p-3 text-sm text-violet-950"><HelpCircle size={16} className="mr-2 inline"/><b>Next Best Question:</b> {reply.nextBestQuestion}</div>}
              {reply.suggestedAction && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><b>Nexus foreslår:</b> {reply.suggestedAction}</div>}
              {reply.draft?.bodyText && <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 p-4"><div className="text-xs font-black uppercase tracking-wider text-cyan-800">Foreslått svar {reply.draft.confidence != null ? `· ${Math.round(reply.draft.confidence * 100)}% confidence` : ""}</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{reply.draft.bodyText}</div></div>}
            </div>
            <div className="w-full xl:w-[360px]">
              <div className="text-xs font-black uppercase tracking-wider text-slate-500">Aktuelle boliger</div>
              <div className="mt-2 space-y-2">{reply.suggestedProperties.length ? reply.suggestedProperties.map(property => <div key={property.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="font-black text-slate-950">{property.ref || property.title || property.id}</div><div className="mt-1 text-slate-600">{[property.location, property.bedrooms ? `${property.bedrooms} sov` : null, property.bathrooms ? `${property.bathrooms} bad` : null].filter(Boolean).join(" · ")}</div>{property.price ? <div className="mt-1 font-bold text-slate-800">€{Number(property.price).toLocaleString("nb-NO")}</div> : null}{property.matchReason && <div className={`mt-2 text-xs leading-5 ${Number(property.feedbackScore || 0) > 0 ? "text-emerald-700" : "text-slate-500"}`}>{property.matchReason}</div>}</div>) : <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Ingen sikker boligmatch ennå, eller tidligere avviste boliger er filtrert bort.</div>}</div>
            </div>
          </div>
        </article>;
      })}
      {!loading && data && data.importantReplies.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><b>Ingen aktive kundesvar venter akkurat nå.</b></div>}
    </section>

    {data?.note && <div className="text-xs leading-5 text-slate-500">{data.note}</div>}
  </main>;
}

function Metric({ icon, label, value }:{ icon:React.ReactNode; label:string; value:number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-cyan-700">{icon}</div><div className="mt-3 text-3xl font-black text-slate-950">{value}</div><div className="text-sm font-semibold text-slate-500">{label}</div></div>;
}
