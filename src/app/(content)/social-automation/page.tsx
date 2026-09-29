"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { summarizeSocialAutopilot } from "@/lib/social-autopilot";

type Row = {
  brandId: string;
  brandName: string;
  platform: string | null;
  accountName: string | null;
  connected: boolean;
  brandBrainReady: boolean;
  planned: boolean;
  pilotReady: boolean;
  pilotBlockReason: string | null;
  published: number;
  measuredEligible: number;
  quarantined: number;
  evaluatedRules: number;
  actionableRules: number;
  liveLearning: boolean;
  surfaceKind: "destination" | "signal";
  attentionRequired: boolean;
  attentionReason: string | null;
  status: string;
};

type NextAction = {
  id: string;
  kind: string;
  brandId: string;
  brandName: string;
  channel: string | null;
  sourceChannel: string | null;
  title: string;
  reason: string;
  href: string | null;
  execution: "AUTO_READY" | "HUMAN_REQUIRED" | "SYSTEM_WORK" | "WAIT";
  priority: "HIGH" | "MEDIUM" | "LOW";
  evidence: string[];
  business: null | {
    trustedForPriority: boolean;
    unifiedScore: number;
    attributionCoveragePct: number;
    evidence: string;
    leads: number;
    qualifiedLeads: number;
    sales: number;
    commissionEur: number;
  };
};

type LearningInsight = {
  id: string;
  brandId: string;
  brandName: string;
  channel: string | null;
  verdict: "favor" | "avoid";
  dimension: string;
  value: string;
  sample: number;
  lift: number;
  evidence: string;
  evidenceRank: number;
  freshness: "fresh" | "recent" | "stale" | "unknown";
  ageDays: number | null;
  nextBehavior: string;
  finding: string | null;
  businessValue: number;
  qualifiedLeadRate: number;
  leads: number;
  qualified: number;
  sales: number;
  commissionEur: number;
  evidenceFirstAt: string | null;
  evidenceLastAt: string | null;
  updatedAt: string | null;
};

type SEOTopicJourney = {
  topicId: string;
  genomeTopic: string;
  brandId: string;
  title: string;
  canonicalUrl: string;
  sourceStatus: string;
  priority: number;
  recommendedChannels: string[];
  evidence: string | null;
  observation: string | null;
  nextAction: string | null;
  sourceUpdatedAt: string | null;
  sourceLastPlannedAt: string | null;
  stage: "MISSION_READY" | "CONTENT_CREATED" | "PUBLISHED" | "MEASURED" | "LEAD_SIGNAL" | "QUALIFIED_SIGNAL" | "BUSINESS_PROVEN";
  contentCount: number;
  publishedCount: number;
  measuredContentCount: number;
  latestPublishedAt: string | null;
  latestMetricsAt: string | null;
  channels: string[];
  metrics: {
    impressions: number;
    views: number;
    clicks: number;
    reactions: number;
    comments: number;
    saves: number;
    shares: number;
  };
  business: {
    leads: number;
    qualified: number;
    viewings: number;
    offers: number;
    sales: number;
    commissionEur: number;
  };
};

type SEOChangeJourney = {
  changeId: string;
  brandId: string;
  page: string;
  pageUrl: string | null;
  query: string;
  appliedAt: string;
  publisher: string | null;
  commitSha: string | null;
  metadataRevision: number | null;
  measurementStatus: "waiting" | "unavailable" | "incomplete" | "measured";
  measurementNote: string;
  baseline: {
    start: string;
    end: string;
    impressions: number;
    clicks: number;
    ctrPct: number;
    position: number;
  };
  current: null | {
    start: string;
    end: string;
    impressions: number;
    clicks: number;
    ctrPct: number;
    position: number;
  };
  observedDelta: null | {
    impressions: number;
    clicks: number;
    ctrPoints: number;
    position: number;
  };
  samePageTopics: Array<{
    topicId: string;
    title: string;
    stage: SEOTopicJourney["stage"];
    publishedCount: number;
    measuredContentCount: number;
    reach: number;
    clicks: number;
    leads: number;
    qualified: number;
    sales: number;
    commissionEur: number;
  }>;
};

type GrowthRow = {
  brandId: string;
  channel: string;
  unifiedScore: number;
  attributionCoveragePct: number;
  evidence: string;
  funnel: {
    impressions: number;
    views: number;
    clicks: number;
    leads: number;
    qualifiedLeads: number;
    viewings: number;
    offers: number;
    sales: number;
    commissionEur: number;
  };
  rates: {
    engagementRatePct: number;
    clickThroughRatePct: number;
    qualificationRatePct: number;
    closeRatePct: number;
  };
};

type Payload = {
  generatedAt: string;
  controlGate: {
    status: string;
    eligibleObservations: number;
    requiredObservations: number;
    maturityHours: number;
    evaluatedRules: number;
    actionableRules: number;
    nextEvaluationAt: string | null;
    nextRecommendedCanary: { path?: string } | null;
    reason: string;
  };
  automationSummary?: {
    autoReady: number;
    humanRequired: number;
    systemWork: number;
    waiting: number;
    connectedSignals: number;
    connectedDestinations: number;
  };
  nextActions?: NextAction[];
  learningInsights?: LearningInsight[];
  seoTopicJourneys?: SEOTopicJourney[];
  seoChangeJourneys?: SEOChangeJourney[];
  performanceSummary?: {
    periodDays: number;
    portfolio: GrowthRow;
    brands: GrowthRow[];
    channels: GrowthRow[];
    diagnostics: {
      marketingMetricRows: number;
      canonicalRevenueRows: number;
      attributionTouchpoints: number;
      canonicalLeads: number;
      attributedLeadTouches: number;
      portfolioAttributionCoveragePct: number;
    };
  } | null;
  rows: Row[];
};

type View = "today" | "calendar" | "attention" | "published" | "performance";

const TABS: Array<{ id: View; label: string }> = [
  { id: "today", label: "Today" },
  { id: "calendar", label: "Calendar" },
  { id: "attention", label: "Needs attention" },
  { id: "published", label: "Published" },
  { id: "performance", label: "Performance" },
];

function badge(status: string) {
  if (status === "LIVE_LEARNING") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "PILOT_READY") return "bg-cyan-100 text-cyan-700 border-cyan-200";
  if (status === "SIGNAL_READY") return "bg-violet-100 text-violet-700 border-violet-200";
  if (status === "BRAND_BRAIN_READY") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "CONNECTED") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function executionTone(execution: NextAction["execution"]) {
  if (execution === "HUMAN_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-950";
  if (execution === "AUTO_READY") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (execution === "SYSTEM_WORK") return "border-blue-200 bg-blue-50 text-blue-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function executionLabel(execution: NextAction["execution"]) {
  if (execution === "HUMAN_REQUIRED") return "Needs you";
  if (execution === "AUTO_READY") return "Auto ready";
  if (execution === "SYSTEM_WORK") return "System work";
  return "Watching";
}

function journeyStageLabel(stage: SEOTopicJourney["stage"]) {
  if (stage === "BUSINESS_PROVEN") return "Business proven";
  if (stage === "QUALIFIED_SIGNAL") return "Qualified signal";
  if (stage === "LEAD_SIGNAL") return "Lead signal";
  if (stage === "MEASURED") return "Measured";
  if (stage === "PUBLISHED") return "Published";
  if (stage === "CONTENT_CREATED") return "Content created";
  return "Mission ready";
}

function journeyStageTone(stage: SEOTopicJourney["stage"]) {
  if (stage === "BUSINESS_PROVEN") return "bg-emerald-100 text-emerald-800";
  if (stage === "QUALIFIED_SIGNAL") return "bg-teal-100 text-teal-800";
  if (stage === "LEAD_SIGNAL") return "bg-cyan-100 text-cyan-800";
  if (stage === "MEASURED") return "bg-violet-100 text-violet-800";
  if (stage === "PUBLISHED") return "bg-blue-100 text-blue-800";
  if (stage === "CONTENT_CREATED") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function seoMeasurementLabel(status: SEOChangeJourney["measurementStatus"]) {
  if (status === "measured") return "30d measured";
  if (status === "waiting") return "Waiting 30d";
  if (status === "incomplete") return "Measurement incomplete";
  return "GSC unavailable";
}

function seoMeasurementTone(status: SEOChangeJourney["measurementStatus"]) {
  if (status === "measured") return "bg-emerald-100 text-emerald-800";
  if (status === "waiting") return "bg-blue-100 text-blue-800";
  if (status === "incomplete") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function signed(value: number, digits = 0) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export default function SocialAutomationPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("today");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/readiness", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Readiness feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = data?.rows ?? [];
  const summary = useMemo(() => summarizeSocialAutopilot(rows), [rows]);
  const actions = data?.nextActions ?? [];
  const autoActions = actions.filter((action) => action.execution === "AUTO_READY");
  const humanActions = actions.filter((action) => action.execution === "HUMAN_REQUIRED");
  const systemActions = actions.filter((action) => action.execution === "SYSTEM_WORK");
  const signals = rows.filter((row) => row.surfaceKind === "signal");
  const destinations = rows.filter((row) => row.surfaceKind === "destination");
  const learningInsights = data?.learningInsights ?? [];
  const seoTopicJourneys = data?.seoTopicJourneys ?? [];
  const seoChangeJourneys = data?.seoChangeJourneys ?? [];
  const performance = data?.performanceSummary ?? null;
  const portfolio = performance?.portfolio;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header className="rounded-2xl border border-fuchsia-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-fuchsia-950 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Marketing Autopilot</div>
            <h1 className="mt-2 text-3xl font-black">Social Automation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Nexus velger neste sikre handling fra live learning, publisering, Search-signaler og CRM-evidens. Du skal primært se det som faktisk trenger deg.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-50">{loading ? "Oppdaterer…" : "Oppdater"}</button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Readiness-feil:</b> {error}</div>}

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setView(tab.id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${view === tab.id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
            {tab.label}{tab.id === "attention" && humanActions.length > 0 ? ` · ${humanActions.length}` : ""}
          </button>
        ))}
      </nav>

      {view === "today" && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Destinations", data?.automationSummary?.connectedDestinations ?? summary.connected],
              ["Signals", data?.automationSummary?.connectedSignals ?? summary.connectedSignals],
              ["Auto ready", data?.automationSummary?.autoReady ?? autoActions.length],
              ["Live learning", summary.liveLearning],
              ["Needs you", data?.automationSummary?.humanRequired ?? humanActions.length],
            ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-3xl font-black text-slate-900">{value}</div></div>)}
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Growth Autopilot queue</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Neste handlinger valgt av Nexus</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-700">AUTO READY køes automatisk av den timebaserte Marketing Autopilot. Hvis kanalen ikke er live-forhåndsgodkjent, lages bare kontrollert utkast/review; eksisterende claim-, account-, approval- og rollback-guards gjelder alltid.</p>
              </div>
              <Link href="/nexus-os/growth-scaling" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Scaling Control →</Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {actions.filter((action) => action.execution !== "WAIT").slice(0, 6).map((action) => (
                <div key={action.id} className={`rounded-xl border p-4 ${executionTone(action.execution)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-black uppercase">{executionLabel(action.execution)}</span>
                    <span className="text-[10px] font-black uppercase opacity-60">{action.priority}</span>
                  </div>
                  <div className="mt-3 font-black">{action.title}</div>
                  <p className="mt-2 text-sm leading-5 opacity-80">{action.reason}</p>
                  {action.sourceChannel && action.sourceChannel !== action.channel && <div className="mt-2 text-xs font-bold opacity-70">Utvidelsessignal: {action.sourceChannel} → {action.channel} · målkanalen lærer på egne data</div>}
                  {action.business && (
                    <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] font-bold leading-5 ${action.business.trustedForPriority ? "border-emerald-200 bg-white/80 text-emerald-950" : "border-slate-200 bg-white/60 text-slate-600"}`}>
                      <span className="font-black">{action.business.trustedForPriority ? "Business-prioritert" : "Business-signal, ikke styrende"}:</span>{" "}
                      {action.business.qualifiedLeads} qualified · {action.business.sales} sales
                      {action.business.commissionEur > 0 ? ` · €${Math.round(action.business.commissionEur).toLocaleString("nb-NO")}` : ""}
                      {" · "}{Math.round(action.business.attributionCoveragePct)}% attribution · {action.business.evidence}
                    </div>
                  )}
                  {action.execution === "AUTO_READY" && <div className="mt-3 text-xs font-black text-emerald-800">Kjøres automatisk · ingen knapp nødvendig</div>}
                  {action.href && action.execution !== "AUTO_READY" && <Link href={action.href} className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-900 shadow-sm">Åpne kontrollflate →</Link>}
                </div>
              ))}
              {!loading && actions.filter((action) => action.execution !== "WAIT").length === 0 && <div className="lg:col-span-3 rounded-xl border border-emerald-200 bg-white/70 p-4 text-sm text-emerald-900">Ingen ny handling må startes nå. Autopilot venter på nye modne signaler.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-violet-600">What Nexus learned</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Dokumentert læring som påvirker neste innhold</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">Bare favor/avoid-regler fra Learning Engine vises her. Sterkere evidens prioriteres først, deretter dokumenterte business-resultater. Du ser også hva Nexus faktisk endrer i neste generering.</p>
              </div>
              <Link href="/analytics" className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-900">Se full analyse →</Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {learningInsights.slice(0, 6).map((insight) => (
                <div key={insight.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${insight.verdict === "favor" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{insight.verdict}</span>
                    <span className="text-xs font-black text-slate-900">{insight.brandName}{insight.channel ? ` · ${insight.channel}` : ""}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="text-sm font-black text-slate-900">{insight.dimension}: {insight.value || "—"}</div>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">Evidens: {insight.evidence}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${insight.freshness === "fresh" ? "bg-emerald-100 text-emerald-700" : insight.freshness === "recent" ? "bg-cyan-100 text-cyan-700" : insight.freshness === "stale" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{insight.freshness === "fresh" ? "Fersk" : insight.freshness === "recent" ? "Nylig" : insight.freshness === "stale" ? "Eldre" : "Ukjent alder"}</span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{insight.finding || `${insight.sample} observasjoner · lift ${Math.round(insight.lift * 100) / 100}`}</p>
                  <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-bold leading-5 text-violet-950"><span className="text-violet-600">Dette endrer Nexus:</span> {insight.nextBehavior}</div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500">
                    <span>Sample {insight.sample}</span>
                    {insight.ageDays != null && <span>{insight.ageDays} dager siden siste evidens</span>}
                    {insight.leads > 0 && <span>{insight.leads} leads</span>}
                    {insight.qualified > 0 && <span>{insight.qualified} kvalifiserte</span>}
                    {insight.sales > 0 && <span>{insight.sales} salg</span>}
                    {insight.commissionEur > 0 && <span>€{Math.round(insight.commissionEur).toLocaleString("nb-NO")}</span>}
                  </div>
                </div>
              ))}
              {!loading && learningInsights.length === 0 && <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Nexus har ennå ingen handlingsregler med nok evidens til å vise her.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-cyan-700">SAM → Social → Business</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Topic Journey</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">Følg samme målte søkemulighet fra SAM/GSC til content mission, publisering, social metrics og attribuerte CRM-resultater. Ingen proxy-resultater blir fremstilt som leads eller salg.</p>
              </div>
              <Link href="/nexus-os/director" className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-950">Nexus Director →</Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {seoTopicJourneys.slice(0, 6).map((journey) => {
                const exposure = Math.max(journey.metrics.impressions, journey.metrics.views);
                const brandName = destinations.find((row) => row.brandId === journey.brandId)?.brandName ?? journey.brandId;
                return (
                  <div key={journey.topicId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-black text-slate-900">{brandName}</div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${journeyStageTone(journey.stage)}`}>{journeyStageLabel(journey.stage)}</span>
                    </div>
                    <div className="mt-2 text-sm font-black text-slate-950">{journey.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-black uppercase text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1">SAM signal ✓</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1">Mission ✓</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1">Content {journey.contentCount || "—"}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1">Published {journey.publishedCount || "—"}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1">Measured {journey.measuredContentCount || "—"}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white p-2"><div className="text-lg font-black text-slate-950">{exposure.toLocaleString("nb-NO")}</div><div className="text-[10px] font-bold uppercase text-slate-400">Reach</div></div>
                      <div className="rounded-lg bg-white p-2"><div className="text-lg font-black text-slate-950">{journey.metrics.clicks}</div><div className="text-[10px] font-bold uppercase text-slate-400">Clicks</div></div>
                      <div className="rounded-lg bg-white p-2"><div className="text-lg font-black text-cyan-900">{journey.business.leads}</div><div className="text-[10px] font-bold uppercase text-slate-400">Leads</div></div>
                    </div>
                    {(journey.business.qualified > 0 || journey.business.sales > 0 || journey.business.commissionEur > 0) && (
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-950">
                        {journey.business.qualified > 0 && <span>{journey.business.qualified} kvalifiserte · </span>}
                        {journey.business.sales > 0 && <span>{journey.business.sales} salg · </span>}
                        {journey.business.commissionEur > 0 && <span>€{journey.business.commissionEur.toLocaleString("nb-NO")} attribuert provisjon</span>}
                      </div>
                    )}
                    <a href={journey.canonicalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-black text-cyan-800">Åpne canonical side →</a>
                  </div>
                );
              })}
              {!loading && seoTopicJourneys.length === 0 && <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Ingen aktive SAM SEO topic-missions har ennå en målbar Topic Journey.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-700">SAM website change → Google → Social → CRM</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">SEO Change Journey</h2>
                <p className="mt-1 max-w-4xl text-sm text-slate-600">Viser bare endringer SAM faktisk har publisert og verifisert offentlig. Google-effekt vises først etter en komplett 30-dagersperiode for samme søk og side. Endringen og resultatet vises sammen som observasjon — ikke som bevist årsak.</p>
              </div>
              <Link href="/growth-hub" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-950">Åpne SEO SAM →</Link>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {seoChangeJourneys.slice(0, 6).map((change) => {
                const brandName = destinations.find((row) => row.brandId === change.brandId)?.brandName ?? change.brandId;
                return (
                  <article key={change.changeId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-black text-slate-900">{brandName} · {change.page}</div>
                        <div className="mt-1 text-sm font-black text-slate-950">Søk: “{change.query}”</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${seoMeasurementTone(change.measurementStatus)}`}>{seoMeasurementLabel(change.measurementStatus)}</span>
                    </div>

                    <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                      <b>Verifisert endring:</b> publisert {new Date(change.appliedAt).toLocaleDateString("nb-NO")}{change.publisher ? ` · ${change.publisher}` : ""}.
                    </div>

                    {change.current && change.observedDelta ? (
                      <>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="rounded-lg bg-white p-2"><div className="text-[10px] font-bold uppercase text-slate-400">Impressions</div><div className="text-lg font-black text-slate-950">{change.current.impressions.toLocaleString("nb-NO")}</div><div className="text-[10px] font-bold text-slate-500">{signed(change.observedDelta.impressions)}</div></div>
                          <div className="rounded-lg bg-white p-2"><div className="text-[10px] font-bold uppercase text-slate-400">Clicks</div><div className="text-lg font-black text-slate-950">{change.current.clicks}</div><div className="text-[10px] font-bold text-slate-500">{signed(change.observedDelta.clicks)}</div></div>
                          <div className="rounded-lg bg-white p-2"><div className="text-[10px] font-bold uppercase text-slate-400">CTR</div><div className="text-lg font-black text-slate-950">{change.current.ctrPct}%</div><div className="text-[10px] font-bold text-slate-500">{signed(change.observedDelta.ctrPoints, 2)} pp</div></div>
                          <div className="rounded-lg bg-white p-2"><div className="text-[10px] font-bold uppercase text-slate-400">Position</div><div className="text-lg font-black text-slate-950">{change.current.position.toFixed(1)}</div><div className="text-[10px] font-bold text-slate-500">{signed(change.observedDelta.position, 1)} pos.</div></div>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-500">Baseline: {change.baseline.impressions.toLocaleString("nb-NO")} impressions · {change.baseline.clicks} clicks · {change.baseline.ctrPct}% CTR · pos. {change.baseline.position.toFixed(1)}.</div>
                      </>
                    ) : (
                      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950">{change.measurementNote}</div>
                    )}

                    {change.samePageTopics.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-cyan-700">Samme canonical-side i Topic Journey</div>
                        {change.samePageTopics.slice(0, 3).map((topic) => (
                          <div key={topic.topicId} className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-cyan-950">
                            <div className="font-black">{topic.title}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-bold text-cyan-800">
                              <span>{topic.reach.toLocaleString("nb-NO")} reach</span>
                              <span>{topic.clicks} clicks</span>
                              <span>{topic.leads} leads</span>
                              {topic.qualified > 0 && <span>{topic.qualified} qualified</span>}
                              {topic.sales > 0 && <span>{topic.sales} sales</span>}
                              {topic.commissionEur > 0 && <span>€{topic.commissionEur.toLocaleString("nb-NO")}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-3 text-xs font-black">
                      {change.pageUrl && <a href={change.pageUrl} target="_blank" rel="noreferrer" className="text-emerald-800">Åpne live side →</a>}
                      <Link href="/analytics" className="text-slate-700">Se måling →</Link>
                    </div>
                  </article>
                );
              })}
              {!loading && seoChangeJourneys.length === 0 && <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">SAM har ennå ingen offentlig verifiserte SEO-endringer som kan følges i denne kjeden.</div>}
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Content Studio", "/content-studio", "Lag og klargjør dagens innhold."],
              ["Posts & publishing", "/posts", "Se planlagt og publiseringsklart innhold."],
              ["Approval Center", "/approvals", "Kun beslutninger som faktisk krever menneske."],
              ["Marketing Readiness", "/marketing-readiness", "Destinations og measurement-signaler separat."],
              ["Scaling Control", "/nexus-os/growth-scaling", "Skaler bare med dokumentert læring og CRM-resultater."],
            ].map(([title, href, text]) => <Link key={href} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-fuchsia-300"><h3 className="font-black text-slate-900">{title}</h3><p className="mt-2 text-sm leading-5 text-slate-600">{text}</p></Link>)}
          </section>
        </>
      )}

      {view === "calendar" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Calendar</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Planlegging og publisering bruker fortsatt samme sannhetskilde som Posts & publishing. Growth Autopilot skal ikke lage en parallell kalender.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Link href="/posts" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Åpne posts & publishing</Link><Link href="/content-studio" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Lag nytt innhold</Link></div>
        </section>
      )}

      {view === "attention" && (
        <section className="space-y-3">
          <div><h2 className="text-xl font-black text-slate-900">Needs attention</h2><p className="mt-1 text-sm text-slate-500">Kun beslutninger og sikkerhetsavvik som faktisk trenger et menneske. Publisher-governance og venting på data ligger ikke lenger her.</p></div>
          {humanActions.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">Ingen marketing-beslutninger krever deg akkurat nå.</div> : null}
          {humanActions.map((action) => (
            <Link key={action.id} href={action.href ?? "/marketing-readiness"} className="block rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">{action.priority} · {action.kind}</div>
              <div className="mt-1 font-black text-amber-950">{action.title}</div>
              <div className="mt-2 text-sm text-amber-900">{action.reason}</div>
              <div className="mt-3 text-xs font-bold text-amber-800">Åpne beslutning →</div>
            </Link>
          ))}
        </section>
      )}

      {view === "published" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Bekreftet fra publiseringssystemet</div>
          <div className="mt-2 text-5xl font-black text-slate-900">{summary.published}</div>
          <p className="mt-3 text-sm text-slate-600">Tallet inkluderer publiserings-destinations, ikke Search Console eller andre measurement-signaler.</p>
          <Link href="/posts" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Se publiserte poster →</Link>
        </section>
      )}

      {view === "performance" && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Impressions/views</div><div className="mt-2 text-3xl font-black text-slate-900">{Math.max(portfolio?.funnel.impressions ?? 0, portfolio?.funnel.views ?? 0).toLocaleString("nb-NO")}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Clicks</div><div className="mt-2 text-3xl font-black text-slate-900">{(portfolio?.funnel.clicks ?? 0).toLocaleString("nb-NO")}</div></div>
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-cyan-700">Leads</div><div className="mt-2 text-3xl font-black text-cyan-950">{portfolio?.funnel.leads ?? 0}</div></div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-violet-700">Qualified</div><div className="mt-2 text-3xl font-black text-violet-950">{portfolio?.funnel.qualifiedLeads ?? 0}</div></div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-emerald-700">Sales</div><div className="mt-2 text-3xl font-black text-emerald-950">{portfolio?.funnel.sales ?? 0}</div></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-amber-700">Attribution</div><div className="mt-2 text-3xl font-black text-amber-950">{Math.round(portfolio?.attributionCoveragePct ?? 0)}%</div></div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-slate-500">Brand performance · siste {performance?.periodDays ?? 30} dager</div><h2 className="mt-1 text-xl font-black text-slate-950">Fra oppmerksomhet til business-resultat</h2></div><Link href="/analytics" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Analytics →</Link></div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">{["Brand", "Score", "Views/imp.", "Clicks", "Leads", "Qualified", "Sales", "Attribution"].map((h) => <th key={h} className="border-b border-slate-200 p-3">{h}</th>)}</tr></thead>
                <tbody>{(performance?.brands ?? []).map((row) => (
                  <tr key={row.brandId}>
                    <td className="border-b border-slate-100 p-3 font-black text-slate-900">{destinations.find((d) => d.brandId === row.brandId)?.brandName ?? row.brandId}</td>
                    <td className="border-b border-slate-100 p-3">{row.unifiedScore}</td>
                    <td className="border-b border-slate-100 p-3">{Math.max(row.funnel.impressions, row.funnel.views).toLocaleString("nb-NO")}</td>
                    <td className="border-b border-slate-100 p-3">{row.funnel.clicks}</td>
                    <td className="border-b border-slate-100 p-3">{row.funnel.leads}</td>
                    <td className="border-b border-slate-100 p-3">{row.funnel.qualifiedLeads}</td>
                    <td className="border-b border-slate-100 p-3">{row.funnel.sales}</td>
                    <td className="border-b border-slate-100 p-3">{Math.round(row.attributionCoveragePct)}%</td>
                  </tr>
                ))}</tbody>
              </table>
              {!performance && <div className="p-5 text-sm text-slate-500">Business performance kunne ikke leses akkurat nå. Readiness og autopilot fortsetter uavhengig.</div>}
            </div>
          </div>
        </section>
      )}

      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-sm font-black text-slate-700">Advanced destination status · {destinations.length}</summary>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">{["Brand", "Destination", "Status", "Publisert", "Eligible", "Quarantine", "Rules", "Systemstatus"].map((h) => <th key={h} className="border-b border-slate-200 p-3">{h}</th>)}</tr></thead>
            <tbody>{destinations.map((row) => <tr key={`${row.brandId}-${row.platform ?? "none"}`} className="align-top"><td className="border-b border-slate-100 p-3 font-bold text-slate-900">{row.brandName}</td><td className="border-b border-slate-100 p-3">{row.platform ?? "—"}<div className="text-xs text-slate-400">{row.accountName ?? ""}</div></td><td className="border-b border-slate-100 p-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${badge(row.status)}`}>{row.status}</span></td><td className="border-b border-slate-100 p-3">{row.published}</td><td className="border-b border-slate-100 p-3">{row.measuredEligible}</td><td className="border-b border-slate-100 p-3">{row.quarantined}</td><td className="border-b border-slate-100 p-3">{row.evaluatedRules}/{row.actionableRules}</td><td className="max-w-sm border-b border-slate-100 p-3 text-xs text-slate-500">{row.attentionRequired ? row.attentionReason : row.pilotBlockReason ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <details className="rounded-2xl border border-violet-200 bg-violet-50 shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-sm font-black text-violet-900">Signals & measurement · {signals.length}</summary>
        <div className="overflow-x-auto border-t border-violet-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-violet-50 text-left text-xs uppercase tracking-wider text-violet-700">{["Brand", "Signal", "Konto", "Status"].map((h) => <th key={h} className="border-b border-violet-100 p-3">{h}</th>)}</tr></thead>
            <tbody>{signals.map((row) => <tr key={`${row.brandId}-${row.platform}`}><td className="border-b border-slate-100 p-3 font-bold">{row.brandName}</td><td className="border-b border-slate-100 p-3">{row.platform}</td><td className="border-b border-slate-100 p-3">{row.accountName ?? "—"}</td><td className="border-b border-slate-100 p-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${badge(row.status)}`}>{row.status}</span></td></tr>)}</tbody>
          </table>
        </div>
      </details>

      {systemActions.length > 0 && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><b>{systemActions.length} systemoppgave(r)</b> ligger i Growth Autopilot-køen, blant annet publisher-governance. Disse teller ikke som «Needs attention» for deg.</div>}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><b>Kontrollregel:</b> measurement-signaler kan påvirke beslutningsgrunnlaget, men blir aldri behandlet som publiseringsdestinations. Ingen post eller learning-status regnes som bekreftet uten data fra readiness-/publiseringssystemet.</div>
    </div>
  );
}
