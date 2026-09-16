import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  AGENT_FLEET_BINDINGS,
  WORKER_OWNED_AGENTS,
  automationActionKeysForBinding,
  automationOutputUnits,
  isAutomationFailure,
  isAutomationSuccess,
  type AgentFleetBinding,
} from "@/lib/nexus-agent-fleet-bindings";
import {
  buildNexusMissionStateProjection,
  type NexusMissionApprovalRow,
  type NexusMissionRunRow,
} from "@/lib/nexus-mission-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AgentRunRow = NexusMissionRunRow & {
  goal?: string | null;
  created_at?: string | null;
};

type AutomationLogRow = {
  action?: string | null;
  status?: string | null;
  details?: Record<string, unknown> | null;
  created_at?: string | null;
};

type ContentPublicationRow = {
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function timestamp(value?: string | null) {
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function formatTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeActivity(dateValue?: string | null) {
  if (!dateValue) return "Ingen registrert aktivitet";
  const diff = Date.now() - new Date(dateValue).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "Nylig aktivitet";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Akkurat nå";
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.round(hours / 24);
  return `${days} d siden`;
}

function latestIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => timestamp(b) - timestamp(a))[0] || null;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function logsForBinding(binding: AgentFleetBinding, logs: AutomationLogRow[]) {
  const keys = automationActionKeysForBinding(binding);
  return logs.filter((row) => keys.has(normalize(row.action)));
}

function runsForBinding(binding: AgentFleetBinding, runs: AgentRunRow[]) {
  const ids = new Set(binding.agentRunIds.map(normalize));
  return runs.filter((row) => ids.has(normalize(row.agent_id)));
}

function missionProductiveRunIds(runs: AgentRunRow[], approvals: NexusMissionApprovalRow[]) {
  const productiveStates = new Set(["prepared", "waiting_approval", "approved", "executed", "recommended"]);
  return new Set(
    buildNexusMissionStateProjection(runs, approvals)
      .filter((row) => productiveStates.has(row.operationalState))
      .map((row) => row.runId),
  );
}

function activityForBinding(
  binding: AgentFleetBinding,
  runs: AgentRunRow[],
  approvals: NexusMissionApprovalRow[],
  logs: AutomationLogRow[],
) {
  const ownRuns = runsForBinding(binding, runs);
  const ownLogs = logsForBinding(binding, logs);
  const productiveMissionIds = missionProductiveRunIds(ownRuns, approvals);

  const completedRuns = ownRuns.filter((row) => normalize(row.status) === "completed").length;
  const productiveMissionRuns = ownRuns.filter((row) => productiveMissionIds.has(row.id) && normalize(row.status) !== "completed").length;
  const productiveAutomationRuns = ownLogs.filter((row) => isAutomationSuccess(row.status) && automationOutputUnits(row.details) > 0).length;
  const failures = ownRuns.filter((row) => normalize(row.status) === "failed").length
    + ownLogs.filter((row) => isAutomationFailure(row.status)).length;
  const pending = ownRuns.filter((row) => ["pending", "waiting_approval", "running"].includes(normalize(row.status))).length;

  const lastActivityAt = latestIso([
    ...ownRuns.map((row) => row.updated_at || row.finished_at || row.started_at || row.created_at),
    ...ownLogs.map((row) => row.created_at),
  ]);

  return {
    id: binding.id,
    agentName: binding.displayName,
    tasksCompleted: completedRuns + productiveMissionRuns + productiveAutomationRuns,
    productiveRuns: completedRuns + productiveMissionRuns + productiveAutomationRuns,
    failures,
    pending,
    workflows: binding.automationPaths.length + binding.agentRunIds.length,
    lastActivityAt,
    lastActivity: formatRelativeActivity(lastActivityAt),
  };
}

function recentAutomationActions(logs: AutomationLogRow[]) {
  return logs
    .slice()
    .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))
    .slice(0, 6)
    .map((row) => ({
      label: `${row.action || "Nexus automation"}${automationOutputUnits(row.details) > 0 ? ` · ${automationOutputUnits(row.details)} output` : ""}`,
      time: formatTime(row.created_at),
      status: isAutomationFailure(row.status) ? "error" as const : "done" as const,
    }));
}

export async function GET(request: NextRequest) {
  const empty = {
    recentActions: [],
    runtimeStats: { tasksToday: null, successRate: null, emailsToday: null, contentToday: null },
    agentActivity: [],
    workerActivity: [],
    sourceTruth: { agentRuns: false, automationLogs: false, legacyCommandExecutions: false },
  };
  const unauthorized = await requireAdminApi(request, empty);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json(empty);

  const since = request.nextUrl.searchParams.get("since") || new Date().toISOString().slice(0, 10);

  const [runsRes, approvalsRes, logsRes, publicationsCountRes, emailCountRes] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id,agent_id,status,outcome,goal,steps,started_at,finished_at,updated_at,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("agentic_approvals")
      .select("id,run_id,subject_ref,status,created_at,resolved_at,executed_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("automation_logs")
      .select("action,status,details,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(3000),
    supabase
      .from("content_publications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    supabase
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .gte("created_at", since),
  ]);

  const fatal = [runsRes.error, approvalsRes.error, logsRes.error, publicationsCountRes.error, emailCountRes.error].find(Boolean);
  if (fatal) return NextResponse.json({ error: fatal.message }, { status: 500 });

  const runs = (runsRes.data || []) as AgentRunRow[];
  const approvals = (approvalsRes.data || []) as NexusMissionApprovalRow[];
  const logs = (logsRes.data || []) as AutomationLogRow[];

  const agentActivity = AGENT_FLEET_BINDINGS.map((binding) => activityForBinding(binding, runs, approvals, logs));
  const workerActivity = WORKER_OWNED_AGENTS.map((binding) => activityForBinding(binding, runs, approvals, logs));

  const tasksToday = agentActivity.reduce((sum, row) => sum + row.tasksCompleted, 0)
    + workerActivity.reduce((sum, row) => sum + row.tasksCompleted, 0);
  const relevantLogs = logs.filter((row) =>
    [...AGENT_FLEET_BINDINGS, ...WORKER_OWNED_AGENTS].some((binding) =>
      automationActionKeysForBinding(binding).has(normalize(row.action)),
    ),
  );
  const successCount = relevantLogs.filter((row) => isAutomationSuccess(row.status)).length;
  const failureCount = relevantLogs.filter((row) => isAutomationFailure(row.status)).length;
  const denominator = successCount + failureCount;

  return NextResponse.json({
    recentActions: recentAutomationActions(relevantLogs),
    runtimeStats: {
      tasksToday,
      successRate: denominator > 0 ? Math.round((successCount / denominator) * 100) : null,
      emailsToday: emailCountRes.count ?? 0,
      contentToday: publicationsCountRes.count ?? 0,
    },
    agentActivity,
    workerActivity,
    sourceTruth: {
      agentRuns: true,
      automationLogs: true,
      legacyCommandExecutions: false,
      note: "Agent Fleet is derived from durable agent_runs, projected Nexus mission state and Automation Registry-owned automation logs.",
    },
  });
}
