"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Brain, Clock3, Flame, HelpCircle, Inbox, KeyRound, Loader2, MailCheck, MessageSquareText, RefreshCw, Send, ShieldOff, ThumbsDown, ThumbsUp } from "lucide-react";

type PropertySuggestion = { id:string; ref?:string|null; title?:string|null; price?:number|null; location?:string|null; bedrooms?:number|null; bathrooms?:number|null; matchScore?:number; matchLabel?:"STRONG"|"GOOD"|"POSSIBLE"|"WEAK"; matchReasons?:string[]; matchCautions?:string[]; learningConfidence?:"high"|"medium"|"low" };
type CustomerMemory = { known:string[]; avoid:string[]; evidenceCount:number; confidence:"high"|"medium"|"low" };
type PortalSignal = { status?:string|null; invitedAt?:string|null; lastLoginAt?:string|null; lastLoginMinutes?:number|null; interested24h?:number; customerMessages24h?:number; priorityBoost?:number; reasons?:string[] };
type ImportantReply = {
  messageId:string; brandId:string; contactId?:string|null; from:{ name?:string|null; email:string };
  subject?:string|null; summary?:string|null; intent?:string|null; urgency?:string|null; suggestedAction?:string|null;
  receivedAt?:string|null; ageMinutes?:number|null; priorityScore:number; hotLeadScore:number; hotLeadLabel:"HOT"|"WARM"|"ACTIVE"|"NORMAL";
  portal?:PortalSignal|null; nextBestQuestion?:string|null; customerMemory?:CustomerMemory;
  draft?:{ id:string; subject?:string|null; bodyText?:string|null; confidence?:number|null; status?:string|null }|null;
  suggestedProperties:PropertySuggestion[];
};
type Payload = {
  generatedAt:string; memoryWindowDays?:number; propertyMatchVersion?:number; portalPriorityVersion?:number;
  summary:{ sent:number; inboundReplies:number; actionableUnanswered:number; hotLeads:number; slaAtRisk:number; portalActive2h?:number; portalInterested24h?:number; portalMessages24h?:number; purchasedLost:number; unsubscribed:number; suppressedContacts:number };
  importantReplies:ImportantReply[]; note?:string;
};
type PortalActionState = { status:"sending"|"sent"|"error"; message?:string };

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

function portalActivityLabel(portal?:PortalSignal|null) {
  if (!portal) return null;
  const minutes = portal.lastLoginMinutes;
  if (minutes == null) return portal.status === "active" ? "Min side aktiv" : "Min side invitert";
  if (minutes <= 30) return "Min side: aktiv siste 30 min";
  if (minutes <= 120) return "Min side: aktiv siste 2 timer";
  if (minutes <= 1440) return "Min side: brukt siste 24t";
  return `Min side: sist brukt ${ageLabel(minutes)} siden`;
}

function matchBadge(property: PropertySuggestion) {
  const label = property.matchLabel || "POSSIBLE";
  const cls = label === "STRONG" ? "bg-emerald-100 text-emerald-800" : label === "GOOD" ? "bg-cyan-100 text-cyan-800" : label === "POSSIBLE" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${cls}`}>{label} {property.matchScore ?? "–"}/100</span>;
}

export default function NexusReplyCommandCenter() {
  const [data, setData] = useState<Payload|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [portalActions, setPortalActions] = useState<Record<string, PortalActionState>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/nexus/communications/daily-summary", { cache:"no-store", credentials:"same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Kunne ikke lese communications (${response.status})`);
      setData(body as Payload);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  async function sendPortalLink(reply: ImportantReply) {
    if (!reply.contactId) return;
    setPortalActions(current => ({ ...current, [reply.messageId]: { status:"sending" } }));
    try {
      const response = await fetch("/api/portal/invite", { method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({contactId:reply.contactId,sendInvite:true}) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Kunne ikke sende Min side-lenke (${response.status})`);
      setPortalActions(current => ({ ...current, [reply.messageId]: { status:body?.emailSent ? "sent" : "error", message:body?.emailSent ? "Min side-lenke sendt" : body?.emailError || "Lenken ble opprettet, men e-posten ble ikke sendt" } }));
    } catch (e) { setPortalActions(current => ({ ...current, [reply.messageId]: { status:"error", message:e instanceof Error ? e.message : String(e) } })); }
  }

  useEffect(() => { void load(); }, [load]);

  return <main className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Inbox size={16}/> Nexus Reply Command</div>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Svar kundene mens de er aktive</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Hot Lead Score kombinerer e-postdialog, kundehistorikk, boligfeedback og dokumentert Min side-aktivitet. Portalaktivitet betyr nylig bruk, ikke sanntids presence.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 size={16} className="mr-2 animate-spin"/> : <RefreshCw size={16} className="mr-2"/>}Oppdater</button>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={18} className="mr-2 inline"/><b>Kunne ikke lese Reply Command.</b> {error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={<Send size={18}/>} label="Sendt 24t" value={data?.summary.sent ?? 0}/>
      <Metric icon={<MailCheck size={18}/>} label="Svar mottatt" value={data?.summary.inboundReplies ?? 0}/>
      <Metric icon={<Clock3 size={18}/>} label="Må besvares" value={data?.summary.actionableUnanswered ?? 0}/>
      <Metric icon={<Flame size={18}/>} label="HOT leads" value={data?.summary.hotLeads ?? 0}/>
      <Metric icon={<KeyRound size={18}/>} label="Min side aktiv ≤2t" value={data?.summary.portalActive2h ?? 0}/>
      <Metric icon={<MessageSquareText size={18}/>} label="Portal meldinger 24t" value={data?.summary.portalMessages24h ?? 0}/>
    </section>

    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">Svar nå</h2><p className="mt-1 text-sm text-slate-500">Sortert etter Hot Lead Score. Min side kan gi maks +30 poeng og vises alltid med årsak.</p></div><div className="flex gap-4"><Link href="/nexus-os/portal-engagement" className="text-sm font-black text-cyan-700">Min side aktivitet</Link><Link href="/nexus-os/communications" className="text-sm font-black text-cyan-700">Communications <ArrowRight size={14} className="inline"/></Link></div></div>

      {(data?.importantReplies ?? []).map(reply => {
        const s = sla(reply); const memory = reply.customerMemory; const portalAction = portalActions[reply.messageId]; const portal = reply.portal; const portalLabel = portalActivityLabel(portal);
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

              {portal && <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                <div className="flex flex-wrap items-center gap-2"><KeyRound size={15} className="text-cyan-800"/><b className="text-sm text-cyan-950">{portalLabel}</b>{Number(portal.priorityBoost || 0) > 0 && <span className="rounded-full bg-cyan-200 px-2 py-1 text-[10px] font-black text-cyan-950">+{portal.priorityBoost} Hot Lead</span>}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-cyan-900"><span>{portal.interested24h || 0} interessant 24t</span><span>·</span><span>{portal.customerMessages24h || 0} meldinger 24t</span><span>·</span><span>Status: {portal.status || "ukjent"}</span></div>
                {(portal.reasons || []).length > 0 && <ul className="mt-2 space-y-1 text-xs text-cyan-950">{portal.reasons?.map((reason,index)=><li key={`${reply.messageId}-portal-${index}`}>• {reason}</li>)}</ul>}
              </div>}

              {reply.contactId && <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => void sendPortalLink(reply)} disabled={portalAction?.status === "sending" || portalAction?.status === "sent"} className="inline-flex items-center rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-900 disabled:opacity-60">{portalAction?.status === "sending" ? <Loader2 size={15} className="mr-2 animate-spin"/> : <KeyRound size={15} className="mr-2"/>}{portalAction?.status === "sent" ? "Min side-lenke sendt" : portalAction?.status === "sending" ? "Sender Min side…" : portal ? "Send ny Min side-lenke" : "Send Min side-lenke"}</button>{portalAction?.message && <span className={`text-xs font-semibold ${portalAction.status === "error" ? "text-rose-700" : "text-emerald-700"}`}>{portalAction.message}</span>}</div>}

              {memory && memory.evidenceCount > 0 && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700"><Brain size={15}/>Kjent om kunden</div><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{memory.confidence} · {memory.evidenceCount} signaler</span></div>{memory.known.length > 0 && <ul className="mt-3 space-y-1 text-sm leading-5 text-slate-700">{memory.known.slice(0,5).map((item,index)=><li key={`known-${index}`} className="flex gap-2"><ThumbsUp size={14} className="mt-0.5 shrink-0 text-emerald-600"/><span>{item}</span></li>)}</ul>}{memory.avoid.length > 0 && <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm leading-5 text-rose-900">{memory.avoid.map((item,index)=><li key={`avoid-${index}`} className="flex gap-2"><ThumbsDown size={14} className="mt-0.5 shrink-0"/><span>{item}</span></li>)}</ul>}</div>}

              {reply.nextBestQuestion && <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 p-3 text-sm text-violet-950"><HelpCircle size={16} className="mr-2 inline"/><b>Next Best Question:</b> {reply.nextBestQuestion}</div>}
              {reply.suggestedAction && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><b>Nexus foreslår:</b> {reply.suggestedAction}</div>}
              {reply.draft?.bodyText && <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 p-4"><div className="text-xs font-black uppercase tracking-wider text-cyan-800">Foreslått svar {reply.draft.confidence != null ? `· ${Math.round(reply.draft.confidence * 100)}% confidence` : ""}</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{reply.draft.bodyText}</div></div>}
            </div>

            <div className="w-full xl:w-[390px]"><div className="text-xs font-black uppercase tracking-wider text-slate-500">Next Best Property</div><div className="mt-2 space-y-2">{reply.suggestedProperties.length ? reply.suggestedProperties.map((property,index)=><div key={property.id} className={`rounded-xl border bg-white p-3 text-sm ${index === 0 && Number(property.matchScore || 0) >= 65 ? "border-emerald-200 shadow-sm" : "border-slate-200"}`}><div className="flex items-start justify-between gap-2"><div className="font-black text-slate-950">{property.ref || property.title || property.id}</div>{matchBadge(property)}</div><div className="mt-1 text-slate-600">{[property.location, property.bedrooms ? `${property.bedrooms} sov` : null, property.bathrooms ? `${property.bathrooms} bad` : null].filter(Boolean).join(" · ")}</div>{property.price ? <div className="mt-1 font-bold text-slate-800">€{Number(property.price).toLocaleString("nb-NO")}</div> : null}{(property.matchReasons || []).length > 0 && <ul className="mt-2 space-y-1 text-xs leading-5 text-emerald-800">{property.matchReasons?.map((reason,i)=><li key={`r-${i}`}>• {reason}</li>)}</ul>}{(property.matchCautions || []).length > 0 && <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">{property.matchCautions?.map((warning,i)=><li key={`w-${i}`}>• {warning}</li>)}</ul>}</div>) : <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Ingen sikker boligmatch ennå.</div>}</div></div>
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
