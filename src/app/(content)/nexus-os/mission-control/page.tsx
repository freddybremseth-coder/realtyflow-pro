"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Loader2, RefreshCw, ShieldCheck, Sparkles, Target, Users } from "lucide-react";
import type { RevenuePriorityItem } from "@/lib/revenue/today";
import { revenuePrioritiesToRealEstateOpportunities } from "@/lib/nexus-opportunity-adapters";
import { buildNexusGrowthMission, rankNexusGrowthMissions, type NexusGrowthMission } from "@/lib/nexus-growth-mission";

type RevenuePayload = { priorities?: RevenuePriorityItem[]; warnings?: string[] };

const roleLabel: Record<NexusGrowthMission["role"], string> = {
  growth_director: "Growth Director",
  demand_generation: "Demand Generation",
  content_influencer: "Content / Influencer",
  sales_sdr: "Sales / SDR",
  closer: "Closer",
  customer_success: "Customer Success",
};

export default function MissionControlPage() {
  const [payload, setPayload] = useState<RevenuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/revenue/today", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Revenue Today feilet (${response.status})`);
      setPayload(body as RevenuePayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const missions = useMemo(() => {
    const opportunities = revenuePrioritiesToRealEstateOpportunities(payload?.priorities ?? []);
    return rankNexusGrowthMissions(opportunities.map(buildNexusGrowthMission), 20);
  }, [payload?.priorities]);

  const closing = missions.filter((mission) => mission.role === "closer").length;
  const sales = missions.filter((mission) => mission.role === "sales_sdr").length;
  const pipelineValue = missions.reduce((sum, mission) => sum + Number(mission.expectedValue || 0), 0);

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><Sparkles size={17} /> Nexus Mission Control</div><h1 className="mt-2 text-3xl font-black">Teamet som flytter business fremover</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Opportunities oversettes til konkrete missions med ansvarlig rolle, ønsket resultat, tidsfrist og riktig autonomy-nivå. Første live adapter er Real Estate Revenue Today; øvrige businesser kobles inn separat.</p></div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10 disabled:opacity-50">{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</button>
      </div>
    </header>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5" /><div><b>Selvgående betyr ikke ukontrollert.</b> Nexus kan prioritere og klargjøre arbeid automatisk. Kundekontakt, tilbud, closing-beslutninger og ekstern publisering følger autonomy-policy og approval-gates.</div></div></section>

    {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</section>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["Aktive missions", missions.length, Target], ["Closer-missions", closing, BriefcaseBusiness], ["Sales/SDR-missions", sales, Users], ["Synlig pipelineverdi", pipelineValue ? `€${Math.round(pipelineValue).toLocaleString("nb-NO")}` : "—", Sparkles]].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon size={19} className="text-cyan-700" /><div className="mt-3 text-3xl font-black text-slate-950">{value}</div><div className="mt-1 text-sm font-semibold text-slate-500">{label}</div></div>)}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Real Estate Revenue Team · live</div><h2 className="mt-1 text-xl font-black text-slate-950">Prioriterte missions</h2></div><Link href="/today" className="text-sm font-black text-cyan-700">Åpne Revenue Today →</Link></div>
      <div className="mt-4 space-y-3">
        {missions.map((mission, index) => <Link key={mission.id} href={mission.href} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-cyan-300 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black uppercase text-white">#{index + 1}</span><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black uppercase text-cyan-800">{roleLabel[mission.role]}</span><span className="text-xs font-black text-slate-500">{mission.priority} · {mission.priorityScore}/100 · innen {mission.dueInHours}t</span></div><h3 className="mt-3 font-black text-slate-950">{mission.title}</h3><p className="mt-1 text-sm font-semibold text-slate-800">Gjør: {mission.nextAction}</p><p className="mt-1 text-xs leading-5 text-slate-500">Hvorfor nå: {mission.whyNow}</p><p className="mt-1 text-xs leading-5 text-slate-500">Mål: {mission.desiredOutcome} · Autonomy: {mission.autonomy}</p></div><ArrowRight size={17} className="mt-1 shrink-0 text-slate-400" /></div></Link>)}
        {!loading && missions.length === 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">Ingen aktive Revenue Today-missions akkurat nå.</div>}
      </div>
    </section>
  </main>;
}
