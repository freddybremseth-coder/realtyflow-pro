"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LoadState<T> = { data: T | null; error: string | null };

type MarketingReadiness = {
  controlGate?: {
    status?: string;
    eligibleObservations?: number;
    requiredObservations?: number;
    reason?: string;
    nextEvaluationAt?: string | null;
    nextRecommendedCanary?: { path?: string } | null;
  };
  rows?: Array<{
    brandName?: string;
    platform?: string | null;
    connected?: boolean;
    pilotReady?: boolean;
    liveLearning?: boolean;
    published?: number;
    measuredEligible?: number;
    status?: string;
  }>;
};

type BookGrowth = {
  summary?: {
    totalBooks?: number;
    asinLinkedBooks?: number;
    pendingRecommendations?: number;
    approvedRecommendations?: number;
    appliedRecommendations?: number;
    bookViews30d?: number;
    amazonClicks30d?: number;
    sampleClicks30d?: number;
    booksWithEconomicData?: number;
  };
  sourceStatus?: { bookReport?: { state?: string; rows90d?: number } };
};

type Approvals = {
  summary?: Record<string, unknown>;
  items?: unknown[];
  warnings?: string[];
};

type Agents = { agents?: unknown[]; providers?: unknown[] };

type Attention = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  href: string;
};

const primary = [
  { href: "/nexus", title: "Nexus OS", text: "Agentisk kommandosenter for dealflow, approvals, oppgaver og autonome arbeidsløp.", badge: "CORE OS" },
  { href: "/social-automation", title: "Social & Instagram Automation", text: "Instagram-intelligens, publisering, timing, innholdsproduksjon, analytics og readiness samlet.", badge: "GROWTH OS" },
  { href: "/book-growth", title: "Book Growth OS", text: "Amazon/ASIN, metadata, økonomi, serier, måling og læring for bokporteføljen.", badge: "PUBLISHING OS" },
  { href: "/automation", title: "Automation Center", text: "Automatiseringer, cron-flyter og systemrutiner samlet på ett sted.", badge: "AUTOMATION" },
];

function countSummary(summary: Record<string, unknown> | undefined) {
  if (!summary) return 0;
  for (const key of ["pending", "total", "count", "items", "needsApproval", "open"]) {
    const n = Number(summary[key] ?? NaN);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function StatusPill({ state }: { state: "ok" | "warn" | "error" | "idle" }) {
  const styles = {
    ok: "bg-emerald-100 text-emerald-700 border-emerald-200",
    warn: "bg-amber-100 text-amber-800 border-amber-200",
    error: "bg-rose-100 text-rose-700 border-rose-200",
    idle: "bg-slate-100 text-slate-600 border-slate-200",
  }[state];
  const label = { ok: "OK", warn: "Følg opp", error: "Feil", idle: "Ingen data" }[state];
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${styles}`}>{label}</span>;
}

export default function RealtyFlowOsPage() {
  const [marketing, setMarketing] = useState<LoadState<MarketingReadiness>>({ data: null, error: null });
  const [books, setBooks] = useState<LoadState<BookGrowth>>({ data: null, error: null });
  const [approvals, setApprovals] = useState<LoadState<Approvals>>({ data: null, error: null });
  const [agents, setAgents] = useState<LoadState<Agents>>({ data: null, error: null });
  const [loading, setLoading] = useState(true);

  const fetchJson = useCallback(async <T,>(url: string): Promise<LoadState<T>> => {
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `${url} feilet (${res.status})`);
      return { data: body as T, error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, b, a, g] = await Promise.all([
      fetchJson<MarketingReadiness>("/api/marketing/readiness"),
      fetchJson<BookGrowth>("/api/book-growth/overview"),
      fetchJson<Approvals>("/api/approvals"),
      fetchJson<Agents>("/api/agents"),
    ]);
    setMarketing(m); setBooks(b); setApprovals(a); setAgents(g);
    setLoading(false);
  }, [fetchJson]);

  useEffect(() => { void load(); }, [load]);

  const instagramRows = (marketing.data?.rows ?? []).filter((r) => r.platform === "instagram");
  const connectedInstagram = instagramRows.filter((r) => r.connected).length;
  const liveInstagram = instagramRows.filter((r) => r.liveLearning).length;
  const publishedInstagram = instagramRows.reduce((sum, r) => sum + Number(r.published ?? 0), 0);
  const eligibleInstagram = instagramRows.reduce((sum, r) => sum + Number(r.measuredEligible ?? 0), 0);
  const approvalCount = approvals.data?.items?.length ?? countSummary(approvals.data?.summary);
  const agentCount = agents.data?.agents?.length ?? 0;
  const bs = books.data?.summary;

  const attention = useMemo<Attention[]>(() => {
    const rows: Attention[] = [];
    if (marketing.error) rows.push({ severity: "high", title: "Social readiness kan ikke leses", detail: marketing.error, href: "/social-automation" });
    else if ((marketing.data?.controlGate?.status ?? "WAIT") !== "RUN_NEXT_CANARY") rows.push({
      severity: "medium",
      title: "Instagram learning gate venter",
      detail: marketing.data?.controlGate?.reason ?? `Eligible observations: ${eligibleInstagram}`,
      href: "/marketing-readiness",
    });
    if (books.error) rows.push({ severity: "high", title: "Book Growth-status kan ikke leses", detail: books.error, href: "/book-growth" });
    else if (Number(bs?.pendingRecommendations ?? 0) > 0) rows.push({
      severity: "medium",
      title: `${bs?.pendingRecommendations ?? 0} Book Growth-forslag venter review`,
      detail: `${bs?.approvedRecommendations ?? 0} approved · ${bs?.appliedRecommendations ?? 0} applied`,
      href: "/book-growth",
    });
    if (approvalCount > 0) rows.push({ severity: "high", title: `${approvalCount} approvals krever menneskelig vurdering`, detail: "Åpne Approval Center før automatiserte arbeidsløp går videre.", href: "/approvals" });
    if (approvals.error) rows.push({ severity: "high", title: "Approval-køen kan ikke leses", detail: approvals.error, href: "/approvals" });
    if (agents.error) rows.push({ severity: "medium", title: "Agentstatus kan ikke leses", detail: agents.error, href: "/agents" });
    if (!rows.length) rows.push({ severity: "low", title: "Ingen kritiske OS-signaler", detail: "De tilkoblede kontrollflatene rapporterer ingen tydelige oppfølgingsbehov nå.", href: "/today" });
    return rows;
  }, [marketing, books, approvals, agents, approvalCount, eligibleInstagram, bs]);

  const errors = [marketing.error, books.error, approvals.error, agents.error].filter(Boolean).length;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-400">RealtyFlow Operating System</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Command Center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Sanntidsinngang til Nexus, Instagram/social automation, Book Growth, approvals og AI-agenter. Målet er at oppmerksomheten din styres hit — ikke til skjulte URL-er.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">{loading ? "Oppdaterer…" : "Oppdater status"}</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">
        <span>{errors ? `${errors} datakilder med feil` : "Alle tilkoblede statuskilder svarer"}</span>
        <span>·</span><span>{attention.length} oppmerksomhetssignal(er)</span>
      </div>
    </div>

    <section>
      <div className="mb-3"><h2 className="text-xl font-black text-slate-900">Hva krever oppmerksomhet nå?</h2><p className="text-sm text-slate-500">Prioritert fra approvals, social readiness, Book Growth og agents.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">
        {attention.slice(0, 6).map((item, i) => <Link key={`${item.title}-${i}`} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div><div className="font-black text-slate-900">{item.title}</div><div className="mt-1 text-sm leading-5 text-slate-600">{item.detail}</div></div>
            <StatusPill state={item.severity === "high" ? "error" : item.severity === "medium" ? "warn" : "ok"} />
          </div>
          <div className="mt-3 text-xs font-bold text-cyan-700">Åpne arbeidsflate →</div>
        </Link>)}
      </div>
    </section>

    <section>
      <div className="mb-3"><h2 className="text-xl font-black text-slate-900">Live OS-status</h2><p className="text-sm text-slate-500">Kortversjonen av de viktigste systemene.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/social-automation" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400">
          <div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Instagram / Social</div><StatusPill state={marketing.error ? "error" : connectedInstagram ? (liveInstagram ? "ok" : "warn") : "idle"} /></div>
          <div className="mt-3 text-3xl font-black text-slate-900">{connectedInstagram}</div>
          <div className="text-sm text-slate-500">tilkoblede Instagram-kanaler</div>
          <div className="mt-3 text-xs text-slate-500">{publishedInstagram} published · {eligibleInstagram} learning-eligible · {liveInstagram} live learning</div>
        </Link>

        <Link href="/book-growth" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400">
          <div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Book Growth</div><StatusPill state={books.error ? "error" : Number(bs?.pendingRecommendations ?? 0) ? "warn" : "ok"} /></div>
          <div className="mt-3 text-3xl font-black text-slate-900">{bs?.pendingRecommendations ?? "—"}</div>
          <div className="text-sm text-slate-500">pending recommendations</div>
          <div className="mt-3 text-xs text-slate-500">{bs?.asinLinkedBooks ?? 0}/{bs?.totalBooks ?? 0} ASIN-linked · {bs?.booksWithEconomicData ?? 0} med økonomidata</div>
        </Link>

        <Link href="/approvals" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400">
          <div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Approvals</div><StatusPill state={approvals.error ? "error" : approvalCount ? "warn" : "ok"} /></div>
          <div className="mt-3 text-3xl font-black text-slate-900">{approvals.error ? "—" : approvalCount}</div>
          <div className="text-sm text-slate-500">venter menneskelig beslutning</div>
          <div className="mt-3 text-xs text-slate-500">Automasjon går ikke forbi approval-gates uten eksplisitt kontroll.</div>
        </Link>

        <Link href="/agents" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400">
          <div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-wider text-slate-400">AI Agents</div><StatusPill state={agents.error ? "error" : agentCount ? "ok" : "idle"} /></div>
          <div className="mt-3 text-3xl font-black text-slate-900">{agents.error ? "—" : agentCount}</div>
          <div className="text-sm text-slate-500">registrerte agent capabilities</div>
          <div className="mt-3 text-xs text-slate-500">Åpne Agents eller Nexus OS for utførelse og koordinering.</div>
        </Link>
      </div>
    </section>

    <section>
      <div className="mb-3"><h2 className="text-xl font-black text-slate-900">Operativsystemer</h2><p className="text-sm text-slate-500">Direkte innganger til de viktigste arbeidsflatene.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {primary.map((item) => <Link key={item.href} href={item.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{item.badge}</div>
          <h3 className="mt-2 text-lg font-black text-slate-900 group-hover:text-cyan-700">{item.title}</h3>
          <p className="mt-2 text-sm leading-5 text-slate-600">{item.text}</p>
          <div className="mt-4 text-xs font-bold text-cyan-700">Åpne →</div>
        </Link>)}
      </div>
    </section>

    <section>
      <h2 className="text-lg font-black text-slate-900">Kontroll & støtte</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          ["/growth-hub", "Growth Hub"], ["/data-health", "Data Health"], ["/audit-log", "Audit Log"], ["/marketing-readiness", "Marketing Readiness"], ["/today", "I dag"],
        ].map(([href, title]) => <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-white p-4 font-bold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50">{title}</Link>)}
      </div>
    </section>
  </div>;
}
