"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Clock3, FileText, Loader2, Play, RefreshCw, Send, ShieldCheck, Zap } from "lucide-react";

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
  dueInHours: number;
  href: string;
};

type AgenticPlan = {
  missionId: string;
  actionClass: string;
  capability: string;
  effectiveMode: string;
  guardrailReason: string | null;
};

type CommandPayload = { growthMissions: GrowthMission[]; agenticPlans: AgenticPlan[] };

type MissionState = {
  missionId: string;
  runId: string;
  operationalState: string;
  runStatus: string;
  outcome: string | null;
  approvalId: string | null;
  approvalStatus: string | null;
  draftId?: string | null;
  transition: string | null;
  updatedAt: string | null;
};

type StatePayload = { states: MissionState[]; summary: Record<string, number> };

type ActionPayload = {
  ok?: boolean;
  transition?: string;
  run?: { id: string; status: string; outcome: string | null };
  approval?: { id: string; created: boolean } | null;
  draftId?: string;
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

function stateLabel(state?: string) {
  if (!state) return "Ikke startet";
  if (state === "awaiting_preparation") return "Venter på preparer";
  if (state === "prepared") return "Utkast klargjort";
  if (state === "waiting_approval") return "Venter på godkjenning";
  if (state === "approved") return "Godkjent";
  if (state === "executed") return "Utført";
  if (state === "recommended") return "Anbefaling ferdig";
  if (state === "rejected") return "Avvist";
  if (state === "failed") return "Feilet";
  if (state === "cancelled") return "Kansellert";
  return "Pågår";
}

function stateClass(state?: string) {
  if (state === "executed" || state === "recommended") return "bg-emerald-100 text-emerald-800";
  if (state === "waiting_approval" || state === "approved") return "bg-amber-100 text-amber-800";
  if (state === "rejected" || state === "failed") return "bg-rose-100 text-rose-800";
  if (state === "prepared") return "bg-violet-100 text-violet-800";
  if (state === "awaiting_preparation") return "bg-cyan-100 text-cyan-800";
  return "bg-slate-100 text-slate-700";
}

function modeLabel(mode?: string) {
  if (mode === "human-required") return "Menneske kreves";
  if (mode === "manual-review") return "Godkjenning";
  if (mode === "draft-first") return "Klargjør først";
  if (mode === "live") return "Policy-live";
  return mode || "—";
}

export default function NexusMissionOperationsPage() {
  const [command, setCommand] = useState<CommandPayload | null>(null);
  const [states, setStates] = useState<StatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ActionPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [commandResponse, stateResponse] = await Promise.all([
        fetch("/api/nexus/revenue-command", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/nexus/revenue-command/missions/state", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const [commandBody, stateBody] = await Promise.all([
        commandResponse.json().catch(() => ({})),
        stateResponse.json().catch(() => ({})),
      ]);
      if (!commandResponse.ok) throw new Error(commandBody?.error || `Revenue Command feilet (${commandResponse.status})`);
      if (!stateResponse.ok) throw new Error(stateBody?.error || `Mission State feilet (${stateResponse.status})`);
      setCommand(commandBody as CommandPayload);
      setStates(stateBody as StatePayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const postMission = useCallback(async (missionId: string, endpoint: string) => {
    setBusy((current) => ({ ...current, [missionId]: true }));
    setError(null);
    setLastResult(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Mission-handling feilet (${response.status})`);
      setLastResult(body as ActionPayload);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((current) => ({ ...current, [missionId]: false }));
    }
  }, [load]);

  const advance = useCallback((missionId: string) => postMission(missionId, "/api/nexus/revenue-command/missions/advance"), [postMission]);
  const prepareRealEstate = useCallback((missionId: string) => postMission(missionId, "/api/nexus/revenue-command/missions/prepare/real-estate"), [postMission]);
  const requestSendApproval = useCallback((missionId: string) => postMission(missionId, "/api/nexus/revenue-command/missions/approve-send"), [postMission]);

  useEffect(() => { void load(); }, [load]);

  const stateByMission = useMemo(() => new Map((states?.states || []).map((row) => [row.missionId, row])), [states?.states]);
  const planByMission = useMemo(() => new Map((command?.agenticPlans || []).map((row) => [row.missionId, row])), [command?.agenticPlans]);
  const missions = command?.growthMissions || [];
  const needsAttention = missions.filter((mission) => {
    const state = stateByMission.get(mission.id)?.operationalState;
    return !state || ["pending", "awaiting_preparation", "prepared", "waiting_approval", "approved", "failed"].includes(state);
  }).length;

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><Play size={17} /> Nexus Mission Operations</div>
          <h1 className="mt-2 text-3xl font-black">Fra mission til faktisk, styrt fremdrift</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Start → Prepare → Approval → eksisterende executor. Hver overgang krever et ekte persisted artefakt eller en ekte approval-state; denne flaten sender aldri kundekommunikasjon direkte.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/nexus-os/revenue-command" className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10">Revenue Command <ArrowRight size={16} className="ml-2" /></Link>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</button>
        </div>
      </div>
    </header>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><div><b>Governed execution.</b> Nexus kan starte missions og klargjøre sikre interne artefakter. Kundekontakt går først til eksisterende Approval Center, og sending skjer bare via den etablerte executor-flyten.</div></div></section>

    {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</section>}
    {lastResult?.ok && <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950"><b>Mission oppdatert.</b>{lastResult.transition ? ` ${lastResult.transition}.` : ""}{lastResult.draftId ? ` Draft ${lastResult.draftId}.` : ""}{lastResult.approval?.id ? ` Approval ${lastResult.approval.id}.` : ""}</section>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Activity size={18} className="text-cyan-700" /><div className="mt-3 text-2xl font-black">{missions.length}</div><div className="text-xs font-bold text-slate-500">Aktive missions</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Clock3 size={18} className="text-amber-700" /><div className="mt-3 text-2xl font-black">{needsAttention}</div><div className="text-xs font-bold text-slate-500">Trenger fremdrift</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><ShieldCheck size={18} className="text-violet-700" /><div className="mt-3 text-2xl font-black">{states?.summary?.waiting_approval || 0}</div><div className="text-xs font-bold text-slate-500">Venter approval</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><CheckCircle2 size={18} className="text-emerald-700" /><div className="mt-3 text-2xl font-black">{(states?.summary?.executed || 0) + (states?.summary?.recommended || 0)}</div><div className="text-xs font-bold text-slate-500">Ferdige</div></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-cyan-600">Execution queue</div><h2 className="mt-1 text-xl font-black text-slate-950">Missions med faktisk state</h2></div><Link href="/approvals" className="text-sm font-black text-cyan-700">Approval Center →</Link></div>
      <div className="mt-4 space-y-3">
        {missions.map((mission, index) => {
          const state = stateByMission.get(mission.id);
          const plan = planByMission.get(mission.id);
          const opState = state?.operationalState;
          const running = Boolean(busy[mission.id]);
          const terminal = ["executed", "recommended", "rejected", "cancelled"].includes(opState || "");
          const approvalState = ["waiting_approval", "approved"].includes(opState || "");
          const canPrepareRealEstate = opState === "awaiting_preparation" && mission.pipelineId === "real_estate_sales" && mission.role === "sales_sdr" && plan?.actionClass === "draft" && plan?.capability === "prepare_only";
          const canRequestSendApproval = opState === "prepared" && Boolean(state?.draftId);

          return <article key={mission.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black text-white">#{index + 1}</span><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800">{roleLabel[mission.role] || mission.role}</span><span className="text-xs font-black text-slate-500">{mission.priority} · {mission.priorityScore}/100 · {mission.dueInHours}t</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${stateClass(opState)}`}>{stateLabel(opState)}</span>{plan && <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">{modeLabel(plan.effectiveMode)}</span>}</div>
                <h3 className="mt-3 font-black text-slate-950">{mission.title}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-800">Gjør: {mission.nextAction}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Hvorfor nå: {mission.whyNow}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Mål: {mission.desiredOutcome}</p>
                {plan?.guardrailReason && <p className="mt-1 text-xs font-semibold text-amber-700">Guardrail: {plan.guardrailReason}</p>}
                {state?.runId && <p className="mt-2 text-[11px] text-slate-400">Run {state.runId}{state.draftId ? ` · draft ${state.draftId}` : ""}{state.approvalId ? ` · approval ${state.approvalId}` : ""}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={mission.href} className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Åpne sak <ArrowRight size={14} className="ml-1" /></Link>
                {approvalState ? <Link href="/approvals" className="inline-flex items-center rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-900">Åpne approval <ShieldCheck size={14} className="ml-1" /></Link> : canRequestSendApproval ? <button onClick={() => void requestSendApproval(mission.id)} disabled={running} className="inline-flex items-center rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-slate-950 hover:bg-amber-400 disabled:opacity-40">{running ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}Send til godkjenning</button> : canPrepareRealEstate ? <button onClick={() => void prepareRealEstate(mission.id)} disabled={running} className="inline-flex items-center rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-500 disabled:opacity-40">{running ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileText size={14} className="mr-1" />}Klargjør utkast</button> : <button onClick={() => void advance(mission.id)} disabled={running || terminal || opState === "awaiting_preparation" || opState === "prepared"} className="inline-flex items-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{running ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Zap size={14} className="mr-1" />}{state ? "Fortsett mission" : "Start mission"}</button>}
              </div>
            </div>
          </article>;
        })}
        {!loading && missions.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">Ingen Growth Missions ennå. Kjør Opportunity Sync i Revenue Command først.</div>}
      </div>
    </section>
  </main>;
}
