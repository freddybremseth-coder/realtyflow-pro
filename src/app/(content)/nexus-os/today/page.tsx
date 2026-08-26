"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Flame,
  Loader2,
  Megaphone,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { summarizeSocialAutopilot, type SocialAutopilotRow } from "@/lib/social-autopilot";
import { buildNexusTodayTopActions } from "@/lib/nexus-today-priority";

type AttentionItem = {
  id: string;
  severity: "high" | "medium" | "low";
  score: number;
  title: string;
  detail: string;
  href: string;
  source: string;
};

type AttentionPayload = {
  attention?: AttentionItem[];
  sourceState?: { healthy?: boolean; errors?: Array<{ source: string; message: string; href: string }> };
};

type RevenuePayload = {
  summary?: {
    activeLeads?: number;
    newLeads?: number;
    overdueFollowups?: number;
    hotSignals?: number;
    closingOpportunities?: number;
    openWorkItems?: number;
  };
  recommendedPlay?: {
    title: string;
    primaryAction: string;
    reason: string;
    href: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    score: number;
  } | null;
  warnings?: string[];
};

type PortfolioPayload = {
  summary?: {
    brands?: number;
    activeBrands?: number;
    publications30d?: number;
    published30d?: number;
    connectedChannels?: number;
    blockedSources?: number;
  };
};

type MarketingPayload = { rows?: SocialAutopilotRow[] };
type LoadState<T> = { data: T | null; error: string | null };

async function readJson<T>(url: string): Promise<LoadState<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `${url} feilet (${response.status})`);
    return { data: body as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function attentionTone(severity: AttentionItem["severity"]) {
  if (severity === "high") return "border-rose-200 bg-rose-50 text-rose-950";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-emerald-200 bg-emerald-50 text-emerald-950";
}

function priorityTone(priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") {
  if (priority === "CRITICAL") return "border-rose-200 bg-rose-50 text-rose-950";
  if (priority === "HIGH") return "border-amber-200 bg-amber-50 text-amber-950";
  if (priority === "MEDIUM") return "border-cyan-200 bg-cyan-50 text-cyan-950";
  return "border-slate-200 bg-slate-50 text-slate-950";
}

export default function NexusTodayPage() {
  const [attention, setAttention] = useState<LoadState<AttentionPayload>>({ data: null, error: null });
  const [revenue, setRevenue] = useState<LoadState<RevenuePayload>>({ data: null, error: null });
  const [portfolio, setPortfolio] = useState<LoadState<PortfolioPayload>>({ data: null, error: null });
  const [marketing, setMarketing] = useState<LoadState<MarketingPayload>>({ data: null, error: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [attentionResult, revenueResult, portfolioResult, marketingResult] = await Promise.all([
      readJson<AttentionPayload>("/api/os/status"),
      readJson<RevenuePayload>("/api/revenue/today"),
      readJson<PortfolioPayload>("/api/nexus/portfolio"),
      readJson<MarketingPayload>("/api/marketing/readiness"),
    ]);
    setAttention(attentionResult);
    setRevenue(revenueResult);
    setPortfolio(portfolioResult);
    setMarketing(marketingResult);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const attentionItems = attention.data?.attention ?? [];
  const actionableAttention = useMemo(
    () => attentionItems.filter((item) => item.id !== "os:clear").slice(0, 5),
    [attentionItems],
  );
  const marketingSummary = useMemo(
    () => summarizeSocialAutopilot(marketing.data?.rows ?? []),
    [marketing.data?.rows],
  );
  const errors = [attention.error, revenue.error, portfolio.error, marketing.error].filter((value): value is string => Boolean(value));
  const summary = revenue.data?.summary;
  const portfolioSummary = portfolio.data?.summary;
  const totalAttention = actionableAttention.length + marketingSummary.needsAttention;
  const topActions = useMemo(
    () => buildNexusTodayTopActions({
      attention: actionableAttention,
      revenue: revenue.data?.recommendedPlay,
      marketingBlockers: marketingSummary.blockers,
      quarantined: marketingSummary.quarantined,
    }),
    [actionableAttention, marketingSummary.blockers, marketingSummary.quarantined, revenue.data?.recommendedPlay],
  );

  const topCards = [
    { label: "Trenger oppmerksomhet", value: totalAttention, icon: AlertTriangle, href: "/nexus-os/today#attention" },
    { label: "Varme leads", value: summary?.hotSignals ?? "—", icon: Flame, href: "/today?filter=hot" },
    { label: "Forsinket oppfølging", value: summary?.overdueFollowups ?? "—", icon: Users, href: "/today?filter=overdue" },
    { label: "Marketing attention", value: marketingSummary.needsAttention, icon: Megaphone, href: "/social-automation?view=attention" },
  ];

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Sparkles size={16} /> Nexus Today</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Hva trenger din oppmerksomhet i dag?</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Én arbeidsflate for salg, drift og merkevarer. Nexus gjenbruker canonical Attention, Revenue Inbox og Marketing Readiness — dette er et enklere beslutningslag, ikke en ny parallell motor.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
            {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater
          </button>
        </div>
      </header>

      {errors.length > 0 && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><strong>Nexus mangler én eller flere datakilder.</strong><div className="mt-1 text-rose-800">{errors.join(" · ")}</div></div></div></section>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="text-xs font-black uppercase tracking-wider text-cyan-700">Nexus recommends</div><h2 className="mt-1 text-xl font-black text-slate-950">De 3 viktigste tingene å gjøre nå</h2></div>
          <Link href="/nexus-os/inbox" className="text-xs font-black text-cyan-700">Åpne hele Inbox →</Link>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {topActions.map((item, index) => <Link key={item.id} href={item.href} className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${priorityTone(item.priority)}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black">{index + 1}</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase">{item.priority}</span></div><ArrowRight size={16} className="opacity-50 transition group-hover:translate-x-1" /></div><h3 className="mt-3 font-black">{item.title}</h3><p className="mt-2 text-sm font-semibold">{item.action}</p><p className="mt-2 text-xs leading-5 opacity-75"><strong>Hvorfor:</strong> {item.reason}</p><p className="mt-2 text-xs leading-5 opacity-75"><strong>Konsekvens:</strong> {item.impact}</p></Link>)}
          {!loading && topActions.length === 0 && <div className="lg:col-span-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><strong>Ingen presserende handlinger.</strong> Nexus finner ingen salg-, drift- eller marketingoppgaver som må løftes til topp 3 akkurat nå.</div>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {topCards.map(({ label, value, icon: Icon, href }) => <Link key={label} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between"><Icon size={20} className="text-cyan-700" /><ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-cyan-700" /></div><div className="mt-4 text-3xl font-black text-slate-950">{value}</div><div className="mt-1 text-sm font-semibold text-slate-500">{label}</div></Link>)}
      </section>

      <section id="attention" className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Nexus Inbox</div><h2 className="mt-1 text-xl font-black text-slate-950">Krever menneskelig oppmerksomhet</h2></div><Link href="/os" className="text-xs font-black text-cyan-700">OS-status →</Link></div>
          <div className="mt-4 space-y-3">
            {actionableAttention.map((item) => <Link key={item.id} href={item.href} className={`block rounded-xl border p-4 transition hover:shadow-sm ${attentionTone(item.severity)}`}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider opacity-60">{item.source} · score {item.score}</div><div className="mt-1 font-black">{item.title}</div><div className="mt-1 text-sm opacity-75">{item.detail}</div></div><ArrowRight size={16} className="mt-1 shrink-0 opacity-50" /></div></Link>)}

            {marketingSummary.blockers.slice(0, 3).map((row) => <Link key={`${row.brandId}-${row.platform ?? "none"}`} href="/social-automation?view=attention" className="block rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 transition hover:shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Marketing · blocker</div><div className="mt-1 font-black">{row.brandName} · {row.platform ?? "kanal"}</div><div className="mt-1 text-sm text-amber-800">{row.pilotBlockReason}</div></div><ArrowRight size={16} className="mt-1 shrink-0 text-amber-600" /></div></Link>)}

            {marketingSummary.quarantined > 0 && <Link href="/social-automation?view=attention" className="block rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-950 transition hover:shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-rose-700">Marketing · quarantine</div><div className="mt-1 font-black">{marketingSummary.quarantined} publiseringer krever kontroll</div><div className="mt-1 text-sm text-rose-800">Åpne Marketing Autopilot for å se og rydde det som er satt i quarantine.</div></div><ArrowRight size={16} className="mt-1 shrink-0 text-rose-600" /></div></Link>}

            {!loading && totalAttention === 0 && errors.length === 0 && <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 size={19} className="mt-0.5" /><div><div className="font-black">Ingen blokkering krever handling nå</div><div className="mt-1 text-sm text-emerald-800">Du kan prioritere salgs- og vekstarbeid.</div></div></div>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Next Best Action</div><h2 className="mt-1 text-xl font-black text-slate-950">Det viktigste salgssteget nå</h2>
          {revenue.data?.recommendedPlay ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2"><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-emerald-800">{revenue.data.recommendedPlay.priority}</span><span className="text-xs font-black text-emerald-700">{revenue.data.recommendedPlay.score}/100</span></div><h3 className="mt-3 text-lg font-black text-slate-950">{revenue.data.recommendedPlay.title}</h3><p className="mt-2 text-sm font-semibold text-slate-800">{revenue.data.recommendedPlay.primaryAction}</p><p className="mt-2 text-xs leading-5 text-slate-600">Hvorfor: {revenue.data.recommendedPlay.reason}</p><Link href={revenue.data.recommendedPlay.href} className="mt-4 inline-flex items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Gjør dette nå <ArrowRight size={15} className="ml-2" /></Link></div> : <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{loading ? "Analyserer salgsprioriteringer …" : "Ingen anbefalt salgsaktivitet tilgjengelig."}</div>}
          <Link href="/today" className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 p-4 text-sm font-black text-slate-800 hover:bg-slate-50"><span className="flex items-center gap-2"><Users size={17} className="text-cyan-700" />Åpne hele kundeprioriteringen</span><ArrowRight size={15} /></Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Arbeidsområder</div><h2 className="mt-1 text-xl font-black text-slate-950">Gå direkte til arbeidet</h2></div><div className="text-xs text-slate-500">{portfolioSummary?.connectedChannels ?? marketingSummary.connected ?? "—"} tilkoblede brand-kanaler · {portfolioSummary?.published30d ?? marketingSummary.published ?? "—"} publisert siste 30 dager</div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/today" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50"><Users size={19} className="text-cyan-700" /><div className="mt-3 font-black">Contacts & Sales</div><div className="mt-1 text-xs text-slate-500">Leads, oppfølging og next best action</div></Link>
          <Link href="/inventory" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50"><Building2 size={19} className="text-cyan-700" /><div className="mt-3 font-black">Properties</div><div className="mt-1 text-xs text-slate-500">Boliger, matching og inventory</div></Link>
          <Link href="/social-automation" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50"><Megaphone size={19} className="text-cyan-700" /><div className="mt-3 font-black">Marketing</div><div className="mt-1 text-xs text-slate-500">{marketingSummary.needsAttention > 0 ? `${marketingSummary.needsAttention} ting trenger oppmerksomhet` : "Autopilot, innhold og publisering"}</div></Link>
          <Link href="/nexus-os" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50"><Sparkles size={19} className="text-cyan-700" /><div className="mt-3 font-black">Nexus</div><div className="mt-1 text-xs text-slate-500">System, brands, læring og advanced control</div></Link>
        </div>
      </section>
    </main>
  );
}
