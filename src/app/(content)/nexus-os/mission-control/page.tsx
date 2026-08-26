"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Bot, BriefcaseBusiness, Loader2, RefreshCw, ShieldCheck, Sparkles, Target, Users } from "lucide-react";
import type { RevenuePriorityItem } from "@/lib/revenue/today";
import { revenuePrioritiesToRealEstateOpportunities } from "@/lib/nexus-opportunity-adapters";
import { bookGrowthPrioritiesToPublishingOpportunities, type BookGrowthPriorityInput } from "@/lib/nexus-publishing-opportunity-adapter";
import { demoSiteOrdersToAiOpportunities, type DemoSiteEventInput, type DemoSiteOrderInput } from "@/lib/nexus-ai-demosites-adapter";
import { buildNexusMissionPortfolio } from "@/lib/nexus-mission-portfolio";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";

type RevenuePayload = { priorities?: RevenuePriorityItem[]; warnings?: string[] };
type BookGrowthPayload = { priority?: BookGrowthPriorityInput[] };
type DemoSitesPayload = { orders?: DemoSiteOrderInput[]; events?: DemoSiteEventInput[] };

const roleLabel: Record<NexusGrowthMission["role"], string> = {
  growth_director: "Growth Director",
  demand_generation: "Demand Generation",
  content_influencer: "Content / Influencer",
  sales_sdr: "Sales / SDR",
  closer: "Closer",
  customer_success: "Customer Success",
};

async function readJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} feilet (${response.status})`);
  return body as T;
}

function MissionCard({ mission, index }: { mission: NexusGrowthMission; index: number }) {
  return <Link href={mission.href} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-cyan-300 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black uppercase text-white">#{index + 1}</span><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black uppercase text-cyan-800">{roleLabel[mission.role]}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{mission.pipelineId.replaceAll("_", " ")}</span><span className="text-xs font-black text-slate-500">{mission.priority} · {mission.priorityScore}/100 · innen {mission.dueInHours}t</span></div><h3 className="mt-3 font-black text-slate-950">{mission.title}</h3><p className="mt-1 text-sm font-semibold text-slate-800">Gjør: {mission.nextAction}</p><p className="mt-1 text-xs leading-5 text-slate-500">Hvorfor nå: {mission.whyNow}</p><p className="mt-1 text-xs leading-5 text-slate-500">Mål: {mission.desiredOutcome} · Autonomy: {mission.autonomy}</p></div><ArrowRight size={17} className="mt-1 shrink-0 text-slate-400" /></div></Link>;
}

export default function MissionControlPage() {
  const [revenue, setRevenue] = useState<RevenuePayload | null>(null);
  const [books, setBooks] = useState<BookGrowthPayload | null>(null);
  const [demosites, setDemosites] = useState<DemoSitesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setErrors([]);
    const [revenueResult, booksResult, demositesResult] = await Promise.allSettled([
      readJson<RevenuePayload>("/api/revenue/today"),
      readJson<BookGrowthPayload>("/api/book-growth/overview"),
      readJson<DemoSitesPayload>("/api/saas/demosites"),
    ]);
    if (revenueResult.status === "fulfilled") setRevenue(revenueResult.value); else setErrors((rows) => [...rows, revenueResult.reason instanceof Error ? revenueResult.reason.message : String(revenueResult.reason)]);
    if (booksResult.status === "fulfilled") setBooks(booksResult.value); else setErrors((rows) => [...rows, booksResult.reason instanceof Error ? booksResult.reason.message : String(booksResult.reason)]);
    if (demositesResult.status === "fulfilled") setDemosites(demositesResult.value); else setErrors((rows) => [...rows, demositesResult.reason instanceof Error ? demositesResult.reason.message : String(demositesResult.reason)]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const portfolio = useMemo(() => {
    const realEstate = revenuePrioritiesToRealEstateOpportunities(revenue?.priorities ?? []);
    const publishing = bookGrowthPrioritiesToPublishingOpportunities(books?.priority ?? []);
    const ai = demoSiteOrdersToAiOpportunities(demosites?.orders ?? [], demosites?.events ?? []);
    return buildNexusMissionPortfolio([...realEstate, ...publishing, ...ai], 50);
  }, [revenue?.priorities, books?.priority, demosites?.orders, demosites?.events]);

  const realEstateMissions = portfolio.missions.filter((mission) => mission.pipelineId === "real_estate_sales");
  const publishingMissions = portfolio.missions.filter((mission) => mission.pipelineId === "publishing");
  const aiMissions = portfolio.missions.filter((mission) => mission.pipelineId === "ai_products_services");
  const closing = portfolio.byRole.closer || 0;
  const content = portfolio.byRole.content_influencer || 0;
  const sales = portfolio.byRole.sales_sdr || 0;
  const valueText = Object.entries(portfolio.valueByCurrency).map(([currency, value]) => `${currency} ${Math.round(value).toLocaleString("nb-NO")}`).join(" · ") || "—";

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><Sparkles size={17} /> Nexus Mission Control</div><h1 className="mt-2 text-3xl font-black">Teamet som flytter hele businessen fremover</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Nexus rangerer missions på tvers av businesser, men beholder separate pipelines, roller og arbeidsmåter. Live nå: Real Estate Revenue Team, Freddy Publishing Growth Team og ChatGenius AI Sales Team.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10 disabled:opacity-50">{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</button></div>
    </header>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5" /><div><b>Selvgående betyr koordinert, ikke ukontrollert.</b> Nexus prioriterer og klargjør arbeid automatisk. Kundekontakt, tilbud, closing-beslutninger, KDP/Amazon-endringer og ekstern publisering følger autonomy-policy og approval-gates. DemoSites sin eksisterende idempotente follow-up-cron forblir den eneste automatiske e-postflyten for demooppfølging.</div></div></section>

    {errors.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><b>En datakilde mangler:</b> {errors.join(" · ")}. Mission Control viser fortsatt de kildene som fungerer.</section>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[["Aktive missions", portfolio.missions.length, Target], ["Closer-missions", closing, BriefcaseBusiness], ["Sales/SDR", sales, Users], ["Content/Influencer", content, Users], ["Synlig verdi", valueText, Sparkles]].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon size={19} className="text-cyan-700" /><div className="mt-3 text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-sm font-semibold text-slate-500">{label}</div></div>)}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Executive priority board</div><h2 className="mt-1 text-xl font-black text-slate-950">Det viktigste teamet skal gjøre nå</h2><p className="mt-1 text-xs text-slate-500">Closing, varme demo-signaler og høyverdi opportunities kan slå ut lavere-prioritert vekstarbeid på tvers av businessene.</p></div><div className="mt-4 space-y-3">{portfolio.missions.slice(0, 12).map((mission, index) => <MissionCard key={mission.id} mission={mission} index={index} />)}{!loading && portfolio.missions.length === 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">Ingen aktive missions fra tilkoblede business-kilder akkurat nå.</div>}</div></section>

    <section className="grid gap-5 xl:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-end justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-cyan-700">Real Estate Revenue Team · live</div><h2 className="mt-1 text-xl font-black text-slate-950">Sales / Closer</h2></div><Link href="/today" className="text-sm font-black text-cyan-700">Revenue Today →</Link></div><div className="mt-4 text-sm text-slate-600">{realEstateMissions.length} missions fra aktive eiendomsleads. Visning, forhandling og closing beholder egne eiendomsregler.</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-end justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-violet-700"><BookOpen size={15} /> Freddy Publishing Growth Team · live</div><h2 className="mt-1 text-xl font-black text-slate-950">Content / Conversion</h2></div><Link href="/book-growth" className="text-sm font-black text-violet-700">Book Growth OS →</Link></div><div className="mt-4 text-sm text-slate-600">{publishingMissions.length} missions fra bokvisninger, sample-intent, retailer-klikk og Book Report/økonomisignaler. Ingen eiendoms-CRM-semantikk brukes.</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-end justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-700"><Bot size={15} /> ChatGenius AI Sales Team · live</div><h2 className="mt-1 text-xl font-black text-slate-950">SDR / Demo / Closer</h2></div><Link href="/demosites" className="text-sm font-black text-indigo-700">DemoSites →</Link></div><div className="mt-4 text-sm text-slate-600">{aiMissions.length} missions fra DemoSites orders og events. Ekte demo-inquiry, claim og checkout løfter urgency; eksisterende automatiske follow-ups beholdes idempotente og uendret.</div></div>
    </section>
  </main>;
}
