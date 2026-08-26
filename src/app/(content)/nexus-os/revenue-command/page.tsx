"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
  Zap,
} from "lucide-react";

type HealthRow = {
  brandId: string;
  pipelineId: string;
  activeOpportunities: number;
  staleOpportunities: number;
  staleConversionOpportunities: number;
  unknownFreshness: number;
  highestPriorityScore: number;
  visibleValueByCurrency: Record<string, number>;
  health: "CRITICAL" | "AT_RISK" | "ACTIVE" | "QUIET";
  reasons: string[];
};

type DirectorMission = {
  id: string;
  brandId: string;
  pipelineId: string;
  role: string;
  kind: string;
  priority: string;
  title: string;
  reason: string;
  action: string;
  desiredOutcome: string;
  autonomy: string;
};

type GrowthMission = {
  id: string;
  opportunityId: string;
  brandId: string;
  pipelineId: string;
  role: string;
  title: string;
  nextAction: string;
  whyNow: string;
  desiredOutcome: string;
  priority: string;
  priorityScore: number;
  expectedValue: number | null;
  currency: string | null;
  dueInHours: number;
  href: string;
};

type AgenticPlan = {
  missionId: string;
  actionClass: string;
  capability: string;
  effectiveMode: string;
  guardrailReason: string | null;
  externalSideEffectAllowed: boolean;
};

type CommandPayload = {
  generatedAt: string;
  summary: {
    activeOpportunities: number;
    recentWonFollowups: number;
    criticalPipelines: number;
    atRiskPipelines: number;
    staleConversionOpportunities: number;
    directorMissions: number;
    growthMissions: number;
    approvalOrHumanRequired: number;
    byPipeline: Record<string, number>;
    valueByCurrency: Record<string, number>;
  };
  health: HealthRow[];
  directorMissions: DirectorMission[];
  growthMissions: GrowthMission[];
  agenticPlans: AgenticPlan[];
};

type SyncPayload = {
  ok?: boolean;
  totals?: { fetched: number; normalized: number; upserted: number; errors: number };
  sources?: Record<string, { fetched: number; normalized: number; upserted: number; errors: string[] }>;
  error?: string;
};

const roleLabel: Record<string, string> = {
  growth_director: "Growth Director",
  demand_generation: "Demand Generation",
  content_influencer: "Content / Influencer",
  sales_sdr: "Sales / SDR",
  closer: "Closer",
  customer_success: "Customer Success",
};

function valueText(values: Record<string, number>) {
  const rows = Object.entries(values || {});
  if (!rows.length) return "—";
  return rows.map(([currency, value]) => `${currency} ${Math.round(value).toLocaleString("nb-NO")}`).join(" · ");
}

function modeLabel(mode: string) {
  if (mode === "human-required") return "Menneske kreves";
  if (mode === "manual-review") return "Godkjenning";
  if (mode === "draft-first") return "Nexus klargjør";
  if (mode === "live") return "Kan kjøre internt";
  return mode;
}

export default function NexusRevenueCommandPage() {
  const [data, setData] = useState<CommandPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/nexus/revenue-command", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Revenue Command feilet (${response.status})`);
      setData(body as CommandPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const response = await fetch("/api/nexus/opportunities/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Opportunity Sync feilet (${response.status})`);
      setSyncResult(body as SyncPayload);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  const plans = useMemo(() => new Map((data?.agenticPlans || []).map((plan) => [plan.missionId, plan])), [data?.agenticPlans]);
  const s = data?.summary;

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><Activity size={17} /> Nexus Revenue Command</div>
          <h1 className="mt-2 text-3xl font-black">Lederteamet som ser lekkasje og flytter pipeline</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Persistent Opportunity Store → Pipeline Health → Mission Director → Growth Missions → Agentic policy. Her ser du hva teamet bør gjøre nå, hvorfor, og hvor mye autonomi Nexus faktisk har.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void sync()} disabled={syncing || loading} className="inline-flex items-center rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{syncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Zap size={16} className="mr-2" />}Synkroniser nå</button>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10 disabled:opacity-50">{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</button>
        </div>
      </div>
    </header>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><div><b>Intern autonomi, ekstern kontroll.</b> Synkronisering, analyse, scoring og klargjøring kan skje internt. Kundekontakt, tilbud, closing, pris, kontrakt og andre konsekvensfulle handlinger går fortsatt gjennom Agentic policy og approval-gates.</div></div></section>

    {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</section>}
    {syncResult?.totals && <section className={`rounded-2xl border p-4 text-sm ${syncResult.totals.errors ? "border-amber-200 bg-amber-50 text-amber-950" : "border-cyan-200 bg-cyan-50 text-cyan-950"}`}><b>Sync:</b> {syncResult.totals.fetched} lest · {syncResult.totals.normalized} normalisert · {syncResult.totals.upserted} lagret · {syncResult.totals.errors} feil.</section>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {[
        ["Aktive opportunities", s?.activeOpportunities ?? "—", Target],
        ["Stale closing", s?.staleConversionOpportunities ?? "—", AlertTriangle],
        ["Kritiske pipelines", s?.criticalPipelines ?? "—", Activity],
        ["Director missions", s?.directorMissions ?? "—", Users],
        ["Krever approval", s?.approvalOrHumanRequired ?? "—", ShieldCheck],
        ["Synlig verdi", s ? valueText(s.valueByCurrency) : "—", Zap],
      ].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon size={18} className="text-cyan-700" /><div className="mt-3 text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></div>)}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Pipeline Health</div><h2 className="mt-1 text-xl font-black text-slate-950">Hvor lekker businessen?</h2></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {(data?.health || []).map((row) => <article key={`${row.brandId}:${row.pipelineId}`} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase text-slate-400">{row.brandId}</div><h3 className="mt-1 font-black text-slate-950">{row.pipelineId.replaceAll("_", " ")}</h3></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${row.health === "CRITICAL" ? "bg-rose-100 text-rose-800" : row.health === "AT_RISK" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{row.health}</span></div><div className="mt-3 text-sm text-slate-700">{row.activeOpportunities} aktive · {row.staleOpportunities} stale · {row.staleConversionOpportunities} stale closing</div><div className="mt-2 text-xs text-slate-500">{row.reasons.join(" · ") || "Ingen spesielle lekkasjes registrert."}</div><div className="mt-2 text-xs font-bold text-slate-700">Verdi: {valueText(row.visibleValueByCurrency)}</div></article>)}
        {!loading && (data?.health || []).length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">Ingen persisted aktive opportunities ennå. Kjør «Synkroniser nå».</div>}
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><div className="text-xs font-black uppercase tracking-wider text-violet-500">Mission Director</div><h2 className="mt-1 text-xl font-black text-slate-950">Hva lederteamet flytter først</h2></div>
      <div className="mt-4 space-y-3">{(data?.directorMissions || []).slice(0, 12).map((mission, index) => <article key={mission.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black text-white">#{index + 1}</span><span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">{roleLabel[mission.role] || mission.role}</span><span className="text-xs font-black text-slate-500">{mission.priority} · {mission.brandId}</span></div><h3 className="mt-3 font-black text-slate-950">{mission.title}</h3><p className="mt-1 text-sm font-semibold text-slate-800">Gjør: {mission.action}</p><p className="mt-1 text-xs leading-5 text-slate-500">Hvorfor: {mission.reason}</p><p className="mt-1 text-xs leading-5 text-slate-500">Mål: {mission.desiredOutcome}</p></article>)}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-cyan-600">Execution queue</div><h2 className="mt-1 text-xl font-black text-slate-950">Konkrete missions + faktisk fullmakt</h2></div><Link href="/approvals" className="text-sm font-black text-cyan-700">Approval Center →</Link></div>
      <div className="mt-4 space-y-3">{(data?.growthMissions || []).slice(0, 20).map((mission, index) => { const plan = plans.get(mission.id); return <Link key={mission.id} href={mission.href} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-cyan-300 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black text-white">#{index + 1}</span><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800">{roleLabel[mission.role] || mission.role}</span><span className="text-xs font-black text-slate-500">{mission.priority} · {mission.priorityScore}/100 · {mission.dueInHours}t</span>{plan && <span className={`rounded-full px-2 py-1 text-[10px] font-black ${plan.effectiveMode === "human-required" ? "bg-rose-100 text-rose-800" : plan.effectiveMode === "manual-review" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{modeLabel(plan.effectiveMode)}</span>}</div><h3 className="mt-3 font-black text-slate-950">{mission.title}</h3><p className="mt-1 text-sm font-semibold text-slate-800">Gjør: {mission.nextAction}</p><p className="mt-1 text-xs leading-5 text-slate-500">Hvorfor nå: {mission.whyNow}</p>{plan?.guardrailReason && <p className="mt-1 text-xs font-semibold text-amber-700">Guardrail: {plan.guardrailReason}</p>}</div><ArrowRight size={17} className="mt-1 shrink-0 text-slate-400" /></div></Link>; })}</div>
    </section>
  </main>;
}
