"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bot, BrainCircuit, ChevronRight, Cpu, Loader2, ShieldCheck, Zap } from "lucide-react";

type AgentCapability = {
  agentName: string;
  role: string;
  expertise: string[];
  availableTasks: string[];
};

type AgentActivity = {
  id: string;
  tasksCompleted: number;
  lastActivity: string;
};

type AgentApi = {
  agents?: AgentCapability[];
  providers?: unknown[];
};

type DashboardApi = {
  runtimeStats?: {
    tasksToday?: number | null;
    successRate?: number | null;
    emailsToday?: number | null;
    contentToday?: number | null;
  };
  agentActivity?: AgentActivity[];
};

function todayIsoStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function normalizeAgentId(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

export function AgentFleetStrip() {
  const [agents, setAgents] = useState<AgentCapability[]>([]);
  const [providers, setProviders] = useState<unknown[]>([]);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [stats, setStats] = useState<DashboardApi["runtimeStats"]>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ since: todayIsoStart() });
        const [agentsRes, dashboardRes] = await Promise.all([
          fetch("/api/agents", { cache: "no-store", credentials: "same-origin" }),
          fetch(`/api/agents/command/dashboard?${params}`, { cache: "no-store", credentials: "same-origin" }),
        ]);
        const agentsBody = (await agentsRes.json().catch(() => ({}))) as AgentApi & { error?: string };
        const dashboardBody = (await dashboardRes.json().catch(() => ({}))) as DashboardApi & { error?: string };
        if (!agentsRes.ok) throw new Error(agentsBody.error || `Agent API feilet (${agentsRes.status})`);
        if (!dashboardRes.ok) throw new Error(dashboardBody.error || `Agent dashboard feilet (${dashboardRes.status})`);
        if (cancelled) return;
        setAgents(Array.isArray(agentsBody.agents) ? agentsBody.agents : []);
        setProviders(Array.isArray(agentsBody.providers) ? agentsBody.providers : []);
        setActivity(Array.isArray(dashboardBody.agentActivity) ? dashboardBody.agentActivity : []);
        setStats(dashboardBody.runtimeStats || {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const activityById = useMemo(() => new Map(activity.map((row) => [row.id, row])), [activity]);

  return (
    <section className="border-b border-slate-800 bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
              <BrainCircuit className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Agent Fleet · live orchestration</div>
              <div className="mt-0.5 text-xs text-slate-400">Faktiske AgentOrchestrator-capabilities og registrert aktivitet i dag</div>
            </div>
          </div>
          <Link href="/agents" className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black text-slate-200 transition hover:border-cyan-400 hover:text-white">
            Mission Control <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-200">Agent Fleet kan ikke leses: {error}</div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
              {(loading ? Array.from({ length: 8 }, (_, index) => ({ agentName: `Laster ${index + 1}`, role: "", expertise: [], availableTasks: [] })) : agents).slice(0, 8).map((agent) => {
                const key = normalizeAgentId(agent.agentName);
                const direct = activityById.get(key);
                const fuzzy = activity.find((row) => key.includes(row.id) || row.id.includes(key));
                const row = direct || fuzzy;
                const tasks = row?.tasksCompleted ?? 0;
                return (
                  <div key={agent.agentName} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
                    <div className="flex items-start justify-between gap-2">
                      <Bot className="h-4 w-4 text-cyan-300" />
                      <span className={`h-2 w-2 rounded-full ${tasks > 0 ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" : "bg-slate-600"}`} />
                    </div>
                    <div className="mt-2 truncate text-xs font-black text-white">{agent.agentName}</div>
                    <div className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-slate-400">{agent.role || "Agent capability"}</div>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="font-black text-cyan-300">{tasks} tasks</span>
                      <span className="text-slate-500">{agent.availableTasks?.length ?? 0} skills</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Zap className="h-3.5 w-3.5" /> Tasks today</div><div className="mt-1 text-xl font-black text-white">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.tasksToday ?? "—"}</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Success rate</div><div className="mt-1 text-xl font-black text-white">{stats?.successRate == null ? "—" : `${stats.successRate}%`}</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Cpu className="h-3.5 w-3.5" /> AI providers</div><div className="mt-1 text-xl font-black text-white">{loading ? "—" : providers.length}</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Output today</div><div className="mt-1 text-sm font-black text-white">{stats?.emailsToday ?? "—"} email · {stats?.contentToday ?? "—"} content</div></div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
