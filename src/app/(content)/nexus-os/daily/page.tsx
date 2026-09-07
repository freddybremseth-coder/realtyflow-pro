"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, Flame, Gauge, Home, Inbox, Loader2, MailCheck, MessageSquare, RefreshCw, ThumbsUp, UserRoundCheck } from "lucide-react";

type Reply = {
  messageId:string;
  contactId?:string|null;
  from:{ name?:string|null; email:string };
  subject?:string|null;
  summary?:string|null;
  intent?:string|null;
  suggestedAction?:string|null;
  urgency?:string|null;
  hotLeadScore:number;
  hotLeadLabel:"HOT"|"WARM"|"ACTIVE"|"NORMAL";
  ageMinutes?:number|null;
  nextBestQuestion?:string|null;
  portal?:{
    status?:string|null;
    lastLoginMinutes?:number|null;
    interested24h?:number;
    customerMessages24h?:number;
    priorityBoost?:number;
    reasons?:string[];
  }|null;
  suggestedProperties?:Array<{ id:string; ref?:string|null; title?:string|null; matchScore?:number; location?:string|null }>;
};

type Communications = {
  generatedAt:string;
  summary:{
    sent:number;
    inboundReplies:number;
    actionableUnanswered:number;
    hotLeads:number;
    slaAtRisk:number;
    portalActive2h?:number;
    portalInterested24h?:number;
    portalMessages24h?:number;
  };
  importantReplies:Reply[];
};

type PortalCustomer = {
  contactId:string;
  name:string;
  email:string;
  portalStatus:string;
  lastLoginMinutes:number|null;
  activityLabel:string;
  engagementScore:number;
  interested24h:number;
  customerMessages24h:number;
  latestCustomerMessage?:{ body:string; createdAt:string }|null;
};

type Portal = {
  generatedAt:string;
  summary:{ total:number; invited:number; active:number; active30m:number; active2h:number; interested24h:number; messages24h:number };
  customers:PortalCustomer[];
};

type NextBestAction = {
  label:string;
  reason:string;
  href:string;
  priority:"NOW"|"SOON"|"FOLLOW_UP";
};

function age(minutes:number|null|undefined) {
  if (minutes == null) return "ingen nylig aktivitet";
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.floor(minutes / 60);
  return `${hours} t siden`;
}

function priorityLabel(reply: Reply) {
  if (reply.hotLeadScore >= 85) return "Svar nå";
  if (reply.hotLeadScore >= 70) return "Svar snart";
  return "Følg opp";
}

function nextBestAction(reply: Reply): NextBestAction {
  const intent = String(reply.intent || "").toLowerCase();
  const portalMessages = Number(reply.portal?.customerMessages24h || 0);
  const interested = Number(reply.portal?.interested24h || 0);
  const bestProperty = reply.suggestedProperties?.[0];

  if (intent === "viewing_request") {
    return {
      label:"Foreslå visning",
      reason:"Kunden har et dokumentert visningssignal. Avklar tidspunkt og bekreft aktuell bolig før interessen kjølner.",
      href:"/nexus-os/replies",
      priority:"NOW",
    };
  }
  if (portalMessages > 0) {
    return {
      label:"Svar på Min side-meldingen",
      reason:`Kunden har sendt ${portalMessages} melding${portalMessages === 1 ? "" : "er"} fra Min side siste 24 timer.`,
      href:"/nexus-os/portal-engagement",
      priority:"NOW",
    };
  }
  if (interested > 0 && bestProperty) {
    return {
      label:`Følg opp ${bestProperty.ref || bestProperty.title || "interessert bolig"}`,
      reason:`Kunden har markert bolig interessant, og beste dokumenterte match er ${bestProperty.matchScore ?? "–"}/100.`,
      href:"/nexus-os/replies",
      priority:reply.hotLeadScore >= 70 ? "NOW" : "SOON",
    };
  }
  if (reply.hotLeadScore >= 85) {
    return {
      label:"Svar kunden nå",
      reason:"Hot Lead Score er 85 eller høyere. E-postintent, aktualitet og øvrige salgssignaler tilsier rask respons.",
      href:"/nexus-os/replies",
      priority:"NOW",
    };
  }
  if (reply.nextBestQuestion) {
    return {
      label:"Still neste kvalifiserende spørsmål",
      reason:`Nexus mangler fortsatt viktig kjøperinformasjon: ${reply.nextBestQuestion}`,
      href:"/nexus-os/replies",
      priority:reply.hotLeadScore >= 70 ? "SOON" : "FOLLOW_UP",
    };
  }
  if (bestProperty) {
    return {
      label:`Foreslå ${bestProperty.ref || bestProperty.title || "beste bolig"}`,
      reason:`Dette er høyest rangerte dokumenterte boligmatch akkurat nå (${bestProperty.matchScore ?? "–"}/100).`,
      href:"/nexus-os/replies",
      priority:reply.hotLeadScore >= 70 ? "SOON" : "FOLLOW_UP",
    };
  }
  return {
    label:"Følg opp kunden",
    reason:reply.suggestedAction || "Ingen sterkere handling er dokumentert ennå. Åpne Reply Command og vurder siste dialog før neste kontakt.",
    href:"/nexus-os/replies",
    priority:"FOLLOW_UP",
  };
}

function actionClass(priority: NextBestAction["priority"]) {
  if (priority === "NOW") return "border-orange-200 bg-orange-50 text-orange-950";
  if (priority === "SOON") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-cyan-100 bg-cyan-50 text-cyan-950";
}

export default function NexusDailyPage() {
  const [communications, setCommunications] = useState<Communications|null>(null);
  const [portal, setPortal] = useState<Portal|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [communicationsResponse, portalResponse] = await Promise.all([
        fetch("/api/nexus/communications/daily-summary", { cache:"no-store", credentials:"same-origin" }),
        fetch("/api/nexus/portal-engagement", { cache:"no-store", credentials:"same-origin" }),
      ]);
      const [communicationsBody, portalBody] = await Promise.all([
        communicationsResponse.json().catch(() => ({})),
        portalResponse.json().catch(() => ({})),
      ]);
      if (!communicationsResponse.ok) throw new Error(communicationsBody?.error || "Kunne ikke lese communications");
      if (!portalResponse.ok) throw new Error(portalBody?.error || "Kunne ikke lese Min side-aktivitet");
      setCommunications(communicationsBody as Communications);
      setPortal(portalBody as Portal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const topReplies = useMemo(() => (communications?.importantReplies || []).slice(0, 8), [communications]);
  const activePortal = useMemo(() => (portal?.customers || [])
    .filter((customer) => customer.lastLoginMinutes != null && customer.lastLoginMinutes <= 120 || customer.interested24h > 0 || customer.customerMessages24h > 0)
    .slice(0, 8), [portal]);

  const headline = useMemo(() => {
    const hot = communications?.summary.hotLeads || 0;
    const portalActive = portal?.summary.active2h || 0;
    const messages = portal?.summary.messages24h || 0;
    if (hot > 0) return `${hot} HOT lead${hot === 1 ? "" : "s"} bør prioriteres nå.`;
    if (portalActive > 0 || messages > 0) return `${portalActive} kunde${portalActive === 1 ? "" : "r"} har nylig vært aktive på Min side.`;
    return "Ingen kritiske kundesignaler akkurat nå.";
  }, [communications, portal]);

  return <main className="mx-auto max-w-[1450px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Gauge size={16}/> Nexus Daily</div>
          <h1 className="mt-2 text-3xl font-black text-slate-950">{headline}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Daglig salgsbrief basert på utsendelser, kundesvar, Hot Lead Score og dokumentert Min side-aktivitet. Hver kunde får én forklarbar Next Best Action. Aktivitet betyr nylig bruk av portalen, ikke sanntids presence.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 size={16} className="mr-2 animate-spin"/> : <RefreshCw size={16} className="mr-2"/>}Oppdater</button>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={17} className="mr-2 inline"/>{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <Metric icon={<MailCheck size={18}/>} label="Sendt 24t" value={communications?.summary.sent ?? 0}/>
      <Metric icon={<Inbox size={18}/>} label="Svar mottatt" value={communications?.summary.inboundReplies ?? 0}/>
      <Metric icon={<Flame size={18}/>} label="HOT leads" value={communications?.summary.hotLeads ?? 0}/>
      <Metric icon={<Clock3 size={18}/>} label="SLA-risiko" value={communications?.summary.slaAtRisk ?? 0}/>
      <Metric icon={<UserRoundCheck size={18}/>} label="Min side · 2t" value={portal?.summary.active2h ?? 0}/>
      <Metric icon={<ThumbsUp size={18}/>} label="Interessert · 24t" value={portal?.summary.interested24h ?? 0}/>
      <Metric icon={<MessageSquare size={18}/>} label="Meldinger · 24t" value={portal?.summary.messages24h ?? 0}/>
      <Metric icon={<Home size={18}/>} label="Portal aktive" value={portal?.summary.active ?? 0}/>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div><h2 className="text-xl font-black text-slate-950">Kontakt først</h2><p className="mt-1 text-sm text-slate-500">Samme prioritering som Reply Command, inkludert begrenset Min side-boost og én forklarbar Next Best Action.</p></div>
          <Link href="/nexus-os/replies" className="text-sm font-black text-cyan-700">Åpne Reply Command <ArrowRight size={14} className="inline"/></Link>
        </div>
        {topReplies.map((reply, index) => {
          const action = nextBestAction(reply);
          return <article key={reply.messageId} className={`rounded-2xl border bg-white p-5 shadow-sm ${index === 0 && reply.hotLeadScore >= 85 ? "border-orange-200" : "border-slate-200"}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <span className={reply.hotLeadScore >= 85 ? "rounded-full bg-orange-100 px-2 py-1 text-orange-900" : "rounded-full bg-slate-100 px-2 py-1"}>{reply.hotLeadLabel} {reply.hotLeadScore}/100</span>
                  <span>{priorityLabel(reply)}</span>
                  <span>·</span><span>{age(reply.ageMinutes)}</span>
                </div>
                <h3 className="mt-2 text-lg font-black text-slate-950">{reply.from.name || reply.from.email}</h3>
                <div className="mt-1 text-sm font-bold text-slate-700">{reply.subject || "Uten emne"}</div>
                {reply.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{reply.summary}</p>}
                <div className={`mt-3 rounded-xl border p-3 text-sm ${actionClass(action.priority)}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div><div className="text-[10px] font-black uppercase tracking-wider">Next Best Action · {action.priority === "NOW" ? "nå" : action.priority === "SOON" ? "snart" : "oppfølging"}</div><div className="mt-1 font-black">{action.label}</div><div className="mt-1 leading-5 opacity-80">{action.reason}</div></div>
                    <Link href={action.href} className="shrink-0 text-xs font-black underline underline-offset-2">Åpne <ArrowRight size={12} className="inline"/></Link>
                  </div>
                </div>
                {reply.portal && Number(reply.portal.priorityBoost || 0) > 0 && <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950"><b>Min side +{reply.portal.priorityBoost}:</b> {(reply.portal.reasons || []).join(" · ")}</div>}
                {reply.nextBestQuestion && <div className="mt-2 text-sm text-violet-900"><b>Neste spørsmål:</b> {reply.nextBestQuestion}</div>}
              </div>
              <div className="shrink-0 lg:text-right">
                {reply.suggestedProperties?.[0] && <div className="rounded-xl bg-slate-50 p-3 text-sm"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Beste bolig nå</div><div className="mt-1 font-black text-slate-900">{reply.suggestedProperties[0].ref || reply.suggestedProperties[0].title}</div><div className="mt-1 text-slate-500">{reply.suggestedProperties[0].matchScore ?? "–"}/100 · {reply.suggestedProperties[0].location || ""}</div></div>}
              </div>
            </div>
          </article>;
        })}
        {!loading && communications && topReplies.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">Ingen ubesvarte aktive kundesvar akkurat nå.</div>}
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">Min side nå</h2><p className="mt-1 text-sm text-slate-500">Kunder med ferske portalsignaler.</p></div><Link href="/nexus-os/portal-engagement" className="text-sm font-black text-cyan-700">Alle <ArrowRight size={14} className="inline"/></Link></div>
        {activePortal.map((customer) => <article key={customer.contactId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-950">{customer.name}</div><div className="mt-1 text-xs text-slate-500">{customer.email}</div></div><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800">{customer.engagementScore}/100</span></div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            {customer.lastLoginMinutes != null && <span className="rounded-full bg-slate-100 px-2 py-1">Min side {age(customer.lastLoginMinutes)}</span>}
            {customer.interested24h > 0 && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">{customer.interested24h} interessert</span>}
            {customer.customerMessages24h > 0 && <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-800">{customer.customerMessages24h} melding{customer.customerMessages24h === 1 ? "" : "er"}</span>}
          </div>
          {customer.latestCustomerMessage?.body && <div className="mt-3 line-clamp-3 rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-700">{customer.latestCustomerMessage.body}</div>}
        </article>)}
        {!loading && portal && activePortal.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Ingen ferske Min side-signaler akkurat nå.</div>}
      </div>
    </section>

    <div className="flex flex-wrap gap-3 text-sm"><Link href="/executive-briefing" className="font-black text-cyan-700">Bred Executive Briefing <ArrowRight size={14} className="inline"/></Link><Link href="/nexus-os/portal-engagement" className="font-black text-cyan-700">Min side aktivitet <ArrowRight size={14} className="inline"/></Link></div>
  </main>;
}

function Metric({ icon, label, value }:{ icon:React.ReactNode; label:string; value:number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-cyan-700">{icon}</div><div className="mt-2 text-2xl font-black text-slate-950">{value}</div><div className="text-xs font-semibold text-slate-500">{label}</div></div>;
}
