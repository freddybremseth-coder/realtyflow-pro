"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Clock3, Flame, Inbox, Loader2, Mail, RefreshCw, ThumbsDown, ThumbsUp, UserCheck, UserPlus } from "lucide-react";

type PortalCustomer = {
  portalUserId:string;
  contactId:string;
  name:string;
  email:string;
  phone?:string|null;
  brandId?:string|null;
  pipelineStatus?:string|null;
  pipelineValue?:number|null;
  nextFollowup?:string|null;
  suppressed:boolean;
  portalStatus:"invited"|"active"|"disabled"|string;
  invitedAt?:string|null;
  lastLoginAt?:string|null;
  lastLoginMinutes?:number|null;
  activityLabel:string;
  engagementScore:number;
  interested24h:number;
  notForMe24h:number;
  customerMessages24h:number;
  latestFeedback?:{action?:string|null;propertyId?:string|null;createdAt?:string|null}|null;
  latestCustomerMessage?:{body?:string|null;createdAt?:string|null}|null;
};

type Payload = {
  generatedAt:string;
  summary:{total:number;invited:number;active:number;active30m:number;active2h:number;interested24h:number;messages24h:number};
  customers:PortalCustomer[];
  note?:string;
};

function ageLabel(minutes?:number|null) {
  if (minutes == null) return "Ikke åpnet ennå";
  if (minutes < 60) return `${minutes} min siden`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} t siden`;
  return `${Math.floor(minutes / (24 * 60))} d siden`;
}

function activityBadge(customer:PortalCustomer) {
  if (customer.lastLoginMinutes != null && customer.lastLoginMinutes <= 30) return { label:"Aktiv siste 30 min", cls:"bg-orange-100 text-orange-900" };
  if (customer.lastLoginMinutes != null && customer.lastLoginMinutes <= 120) return { label:"Aktiv siste 2 timer", cls:"bg-amber-100 text-amber-900" };
  if (customer.portalStatus === "active") return { label:"Min side aktiv", cls:"bg-emerald-100 text-emerald-800" };
  if (customer.portalStatus === "invited") return { label:"Invitert", cls:"bg-cyan-100 text-cyan-800" };
  return { label:customer.portalStatus || "Ukjent", cls:"bg-slate-100 text-slate-700" };
}

export default function PortalEngagementPage() {
  const [data,setData] = useState<Payload|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [filter,setFilter] = useState<"all"|"recent"|"invited"|"active">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/nexus/portal-engagement", { cache:"no-store", credentials:"same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Kunne ikke lese portalaktivitet (${response.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const customers = useMemo(() => {
    const rows = data?.customers || [];
    if (filter === "recent") return rows.filter(row => row.lastLoginMinutes != null && row.lastLoginMinutes <= 120);
    if (filter === "invited") return rows.filter(row => row.portalStatus === "invited");
    if (filter === "active") return rows.filter(row => row.portalStatus === "active");
    return rows;
  }, [data,filter]);

  return <main className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Activity size={16}/> Nexus Portal Engagement</div>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Se hvem som faktisk bruker Min side</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Invitasjon, nylig portalaktivitet, boliginteresse og kundemeldinger samles her. Nylig aktivitet betyr ikke sanntids-online, men er et sterkt signal om at kunden er i kjøpsmodus.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/nexus-os/replies" className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-800">Reply Command <ArrowRight size={15} className="ml-2"/></Link>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 size={16} className="mr-2 animate-spin"/> : <RefreshCw size={16} className="mr-2"/>}Oppdater</button>
        </div>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={18} className="mr-2 inline"/><b>Kunne ikke lese portalaktivitet:</b> {error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <Metric icon={<UserPlus size={18}/>} label="Portalbrukere" value={data?.summary.total ?? 0}/>
      <Metric icon={<UserPlus size={18}/>} label="Invitert" value={data?.summary.invited ?? 0}/>
      <Metric icon={<UserCheck size={18}/>} label="Aktive" value={data?.summary.active ?? 0}/>
      <Metric icon={<Flame size={18}/>} label="Aktiv 30 min" value={data?.summary.active30m ?? 0}/>
      <Metric icon={<Clock3 size={18}/>} label="Aktiv 2 timer" value={data?.summary.active2h ?? 0}/>
      <Metric icon={<ThumbsUp size={18}/>} label="Interessert 24t" value={data?.summary.interested24h ?? 0}/>
      <Metric icon={<Mail size={18}/>} label="Meldinger 24t" value={data?.summary.messages24h ?? 0}/>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {([['all','Alle'],['recent','Aktive siste 2t'],['invited','Kun invitert'],['active','Aktiv Min side']] as const).map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-2 text-xs font-black ${filter === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>)}
      </div>
    </section>

    <section className="space-y-3">
      {customers.map(customer => {
        const badge = activityBadge(customer);
        const urgent = customer.lastLoginMinutes != null && customer.lastLoginMinutes <= 30 || customer.interested24h > 0 || customer.customerMessages24h > 0;
        return <article key={customer.portalUserId} className={`rounded-2xl border p-5 shadow-sm ${urgent ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">{customer.brandId || "brand"}</span>
                {customer.pipelineStatus && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">{customer.pipelineStatus}</span>}
                {customer.suppressed && <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-rose-800">Suppressed</span>}
              </div>
              <h2 className="mt-2 text-lg font-black text-slate-950">{customer.name}</h2>
              <div className="mt-1 text-sm text-slate-600">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</div>
              <div className="mt-3 text-sm font-semibold text-slate-700">Siste Min side-aktivitet: {ageLabel(customer.lastLoginMinutes)}</div>
              {customer.latestCustomerMessage?.body && <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-sm text-slate-800"><b>Siste melding:</b> {customer.latestCustomerMessage.body.slice(0,300)}</div>}
            </div>
            <div className="w-full lg:w-[360px]">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wider text-slate-500">Engagement score</span><span className="text-2xl font-black text-slate-950">{customer.engagementScore}/100</span></div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Signal icon={<ThumbsUp size={14}/>} label="Interessert" value={customer.interested24h}/>
                  <Signal icon={<ThumbsDown size={14}/>} label="Ikke for meg" value={customer.notForMe24h}/>
                  <Signal icon={<Inbox size={14}/>} label="Meldinger" value={customer.customerMessages24h}/>
                </div>
                {urgent && <div className="mt-3 rounded-lg bg-orange-100 p-2 text-xs font-bold text-orange-950">Sterkt aktivitetssignal: vurder rask personlig oppfølging mens kunden er i kjøpsmodus.</div>}
              </div>
            </div>
          </div>
        </article>;
      })}
      {!loading && data && customers.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Ingen portalbrukere i dette filteret.</div>}
    </section>

    {data?.note && <p className="text-xs leading-5 text-slate-500">{data.note}</p>}
  </main>;
}

function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:number}) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-cyan-700">{icon}</div><div className="mt-3 text-3xl font-black text-slate-950">{value}</div><div className="text-sm font-semibold text-slate-500">{label}</div></div>;
}

function Signal({icon,label,value}:{icon:React.ReactNode;label:string;value:number}) {
  return <div className="rounded-lg bg-slate-50 p-2"><div className="flex justify-center text-slate-500">{icon}</div><div className="mt-1 text-lg font-black text-slate-950">{value}</div><div className="text-[10px] font-bold text-slate-500">{label}</div></div>;
}
