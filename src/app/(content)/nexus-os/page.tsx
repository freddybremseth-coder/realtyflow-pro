"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OWNED_GROWTH_BRANDS } from "@/lib/marketing/brand-registry";

type ReadinessRow = { brandId: string; brandName: string; platform: string | null; connected: boolean; pilotReady: boolean; liveLearning: boolean; pilotBlockReason: string | null; published: number; measuredEligible: number; evaluatedRules: number; actionableRules: number };
type MarketingPayload = { controlGate?: { status?: string; reason?: string }; rows?: ReadinessRow[] };
type BookPayload = { summary?: { totalBooks?: number; pendingRecommendations?: number; approvedRecommendations?: number; appliedRecommendations?: number; booksWithEconomicData?: number; asinLinkedBooks?: number } };
type ApprovalPayload = { summary?: Record<string, number>; items?: unknown[] };
type AgentPayload = { agents?: unknown[]; providers?: unknown[] };
type AttentionPayload = {
  sourceState?: { healthy?: boolean; errors?: Array<{ source: string; message: string; href: string }> };
  attention?: Array<{ id: string; severity: "high" | "medium" | "low"; score: number; title: string; detail: string; href: string; source: string }>;
};
type PortfolioBrand = {
  brand_id: string; website: string; status: string; autonomy_mode: string; planned_channels: string[]; conversion_goals: string[]; primary_ctas: string[];
  sourceSummary: { total: number; ready: number; blocked: number; drafted: number; byType: Record<string, number>; byStatus: Record<string, number> };
  publications30d: { total: number; published: number; scheduled: number; draft: number; byState: Record<string, number> };
  learning: { rules: number; actionable: number };
};
type PortfolioPayload = { summary?: { brands?: number; activeBrands?: number; setupBrands?: number; sources?: number; readySources?: number; blockedSources?: number; publications30d?: number; published30d?: number; learningRules?: number; connectedChannels?: number }; brands?: PortfolioBrand[] };
type SourceState<T> = { data: T | null; error: string | null };

function countApprovals(data: ApprovalPayload | null) {
  if (Array.isArray(data?.items)) return data.items.length;
  const s = data?.summary ?? {};
  return Number(s.pending ?? s.total ?? s.awaitingApproval ?? 0) || 0;
}

function StatusPill({ good, label }: { good: boolean; label: string }) {
  return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${good ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{label}</span>;
}

export default function NexusOsPage() {
  const [marketing, setMarketing] = useState<SourceState<MarketingPayload>>({ data: null, error: null });
  const [books, setBooks] = useState<SourceState<BookPayload>>({ data: null, error: null });
  const [approvals, setApprovals] = useState<SourceState<ApprovalPayload>>({ data: null, error: null });
  const [agents, setAgents] = useState<SourceState<AgentPayload>>({ data: null, error: null });
  const [portfolio, setPortfolio] = useState<SourceState<PortfolioPayload>>({ data: null, error: null });
  const [attentionSource, setAttentionSource] = useState<SourceState<AttentionPayload>>({ data: null, error: null });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const fetchOne = async <T,>(url: string): Promise<SourceState<T>> => {
      try {
        const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `${url} feilet (${res.status})`);
        return { data: body as T, error: null };
      } catch (e) {
        return { data: null, error: e instanceof Error ? e.message : String(e) };
      }
    };
    const [m, b, a, ag, p, os] = await Promise.all([
      fetchOne<MarketingPayload>("/api/marketing/readiness"),
      fetchOne<BookPayload>("/api/book-growth/overview"),
      fetchOne<ApprovalPayload>("/api/approvals"),
      fetchOne<AgentPayload>("/api/agents"),
      fetchOne<PortfolioPayload>("/api/nexus/portfolio"),
      fetchOne<AttentionPayload>("/api/os/status"),
    ]);
    setMarketing(m); setBooks(b); setApprovals(a); setAgents(ag); setPortfolio(p); setAttentionSource(os); setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const readinessRows = marketing.data?.rows ?? [];
  const portfolioByBrand = useMemo(() => new Map((portfolio.data?.brands ?? []).map((b) => [b.brand_id, b])), [portfolio.data]);
  const attention = attentionSource.data?.attention ?? [];
  const secondarySourceErrors = [marketing, books, approvals, agents, portfolio].map((source) => source.error).filter((value): value is string => Boolean(value));

  return <div className="mx-auto max-w-[1600px] space-y-6 p-6">
    <header className="rounded-3xl border border-cyan-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-7 text-white shadow-2xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Nexus OS · Master Control Layer</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-4xl font-black tracking-tight">Nexus OS</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Overordnet kontrollsenter for hele RealtyFlow: brands, kilder, publisering, annonser, AI-agenter, approvals, måling og læring. Underliggende moduler utfører arbeidet; canonical Attention Center bestemmer hva som bør gjøres først.</p></div>
        <button onClick={load} disabled={loading} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? "Oppdaterer…" : "Oppdater Nexus"}</button>
      </div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Link href="/social-automation" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-bold text-slate-500">CONNECTED</div><div className="mt-2 text-3xl font-black">{portfolio.data?.summary?.connectedChannels ?? readinessRows.filter(r => r.connected).length}</div><div className="text-sm text-slate-500">brand-kanaler</div></Link>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-bold text-slate-500">SOURCES</div><div className="mt-2 text-3xl font-black">{portfolio.data?.summary?.sources ?? "—"}</div><div className="text-sm text-slate-500">verifiserte kilder</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-bold text-slate-500">READY</div><div className="mt-2 text-3xl font-black">{portfolio.data?.summary?.readySources ?? "—"}</div><div className="text-sm text-slate-500">kampanjeklare kilder</div></div>
      <Link href="/book-growth" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-bold text-slate-500">BOOKS</div><div className="mt-2 text-3xl font-black">{books.data?.summary?.totalBooks ?? "—"}</div><div className="text-sm text-slate-500">publiserte titler</div></Link>
      <Link href="/approvals" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-bold text-slate-500">APPROVALS</div><div className="mt-2 text-3xl font-black">{approvals.data ? countApprovals(approvals.data) : "—"}</div><div className="text-sm text-slate-500">venter kontroll</div></Link>
      <Link href="/agents" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-bold text-slate-500">AI AGENTS</div><div className="mt-2 text-3xl font-black">{agents.data?.agents?.length ?? "—"}</div><div className="text-sm text-slate-500">capabilities</div></Link>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1fr_2fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Canonical Attention</div><h2 className="mt-1 text-xl font-black">Hva krever oppmerksomhet nå?</h2></div><Link href="/os" className="text-xs font-black text-cyan-700">Åpne Attention Center →</Link></div>
        {attentionSource.error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">Canonical Attention kan ikke leses: {attentionSource.error}</div> : <div className="mt-4 space-y-3">{attention.slice(0, 6).map((x) => <Link key={x.id} href={x.href} className={`block rounded-xl border p-4 ${x.severity === "high" ? "border-rose-200 bg-rose-50" : x.severity === "medium" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{x.source} · score {x.score}</div><div className="mt-1 font-black text-slate-900">{x.title}</div><div className="mt-1 text-sm text-slate-600">{x.detail}</div></div><span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{x.severity}</span></div></Link>)}{!loading && !attention.length && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Ingen canonical Attention-items tilgjengelig.</div>}</div>}
        {secondarySourceErrors.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><b>Andre Nexus-kilder:</b> {secondarySourceErrors.join(" · ")}. Disse vises separat og endrer ikke canonical prioriteringsrekkefølge.</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">Portfolio Growth Map</div><h2 className="mt-1 text-xl font-black">Brands under Nexus</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{OWNED_GROWTH_BRANDS.map((brand) => {
          const rows = readinessRows.filter(r => r.brandId === brand.id);
          const connected = rows.filter(r => r.connected).length;
          const live = rows.some(r => r.liveLearning);
          const blockers = rows.filter(r => r.pilotBlockReason).map(r => `${r.platform ?? "kanal"}: ${r.pilotBlockReason}`);
          const p = portfolioByBrand.get(brand.id);
          return <div key={brand.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-2"><div><div className="font-black text-slate-900">{brand.name}</div><a href={brand.website} target="_blank" rel="noreferrer" className="text-xs font-bold text-cyan-700">{brand.website.replace(/^https?:\/\//, "")}</a></div><StatusPill good={live || connected > 0} label={live ? "Live learning" : connected ? `${connected} connected` : "Connect"} /></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white p-2"><div className="text-lg font-black">{p?.sourceSummary.total ?? 0}</div><div className="text-[10px] text-slate-500">sources</div></div><div className="rounded-lg bg-white p-2"><div className="text-lg font-black text-emerald-700">{p?.sourceSummary.ready ?? 0}</div><div className="text-[10px] text-slate-500">ready</div></div><div className="rounded-lg bg-white p-2"><div className="text-lg font-black">{p?.learning.rules ?? 0}</div><div className="text-[10px] text-slate-500">rules</div></div></div>
            <div className="mt-3 text-xs text-slate-500">Plan: {brand.plannedChannels.join(" · ")}</div>
            <div className="mt-2 text-xs text-slate-600">{Object.entries(p?.sourceSummary.byType ?? {}).map(([k,v]) => `${k}:${v}`).join(" · ") || brand.contentPillars?.slice(0, 3).join(" · ")}</div>
            {p && <div className="mt-2 text-[11px] text-slate-500">30d: {p.publications30d.published} published · {p.publications30d.draft} draft · {p.learning.actionable} actionable learning</div>}
            {(p?.sourceSummary.blocked ?? 0) > 0 && <div className="mt-3 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-800">{p?.sourceSummary.blocked} source(s) blocked</div>}
            {blockers.length > 0 && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">{blockers.slice(0, 2).join(" | ")}</div>}
          </div>;
        })}</div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Autonomous growth lifecycle</div><h2 className="mt-1 text-xl font-black">Én læringssløyfe for alle brands</h2></div><Link href="/social-automation" className="text-sm font-black text-cyan-700">Åpne Growth operations →</Link></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">{[["1", "Source", "Bøker, eiendommer, sanger, produkter, demosider"],["2", "Create", "Tekst, bilder, video, ads og CTA-varianter"],["3", "Approve", "Claims, brand, budsjett og publisering"],["4", "Publish", "SoMe, nettside, email og ads"],["5", "Measure", "Views, clicks, leads, sales og kost"],["6", "Learn", "Favor / avoid / timing / creative / CTA"]].map(([n,t,x]) => <div key={n} className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-black text-cyan-700">{n}</div><div className="mt-1 font-black">{t}</div><div className="mt-2 text-xs leading-5 text-slate-500">{x}</div></div>)}</div>
    </section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Link href="/nexus" className="rounded-xl border border-slate-200 bg-white p-4"><b>Dealflow Cockpit</b><div className="mt-1 text-sm text-slate-500">Eiendomsagentenes operative cockpit under Nexus.</div></Link>
      <Link href="/automation" className="rounded-xl border border-slate-200 bg-white p-4"><b>Automation Center</b><div className="mt-1 text-sm text-slate-500">Cron, workflows og systemrutiner.</div></Link>
      <Link href="/content-studio" className="rounded-xl border border-slate-200 bg-white p-4"><b>Content Factory</b><div className="mt-1 text-sm text-slate-500">Tekst, kreativ og kampanjeproduksjon.</div></Link>
      <Link href="/ad-campaigns" className="rounded-xl border border-slate-200 bg-white p-4"><b>Ads</b><div className="mt-1 text-sm text-slate-500">Betalt distribusjon og kampanjer.</div></Link>
    </section>
  </div>;
}