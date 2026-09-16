import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { AGENT_FLEET, resolveAgentFleetId, resolveAutomationAgentId, type AgentFleetId } from "@/lib/agent-fleet-registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CommandExecutionRow = {
  plan_title?: string | null;
  status?: string | null;
  summary?: string | null;
  steps?: unknown;
  created_at?: string | null;
};

type ContentPublicationRow = {
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type AutomationLogRow = {
  action?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

function laterTimestamp(current?: string, candidate?: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function healthyAutomationStatus(status?: string | null) {
  return ["success", "completed", "done"].includes(String(status || "").toLowerCase());
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, {
    recentActions: [],
    runtimeStats: { tasksToday: null, directTasksToday: null, systemRunsToday: null, successRate: null, emailsToday: null, contentToday: null },
    agentActivity: [],
  });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      recentActions: [],
      runtimeStats: { tasksToday: null, directTasksToday: null, systemRunsToday: null, successRate: null, emailsToday: null, contentToday: null },
      agentActivity: [],
    });
  }

  const since = request.nextUrl.searchParams.get("since") || new Date().toISOString().slice(0, 10);
  const sinceMs = new Date(since).getTime();
  const agentWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [recentExecutionsRes, recentPublicationsRes, todayExecutionsRes, automationLogsRes, publicationsCountRes, emailCountRes] =
    await Promise.all([
      supabase
        .from("command_executions")
        .select("plan_title, status, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("content_publications")
        .select("title, status, created_at")
        .in("status", ["published", "scheduled", "failed"])
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("command_executions")
        .select("status, steps, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("automation_logs")
        .select("action,status,created_at")
        .gte("created_at", agentWindowStart)
        .order("created_at", { ascending: false })
        .limit(5000),
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

  if (recentExecutionsRes.error) return NextResponse.json({ error: recentExecutionsRes.error.message }, { status: 500 });
  if (recentPublicationsRes.error) return NextResponse.json({ error: recentPublicationsRes.error.message }, { status: 500 });
  if (todayExecutionsRes.error) return NextResponse.json({ error: todayExecutionsRes.error.message }, { status: 500 });
  if (automationLogsRes.error) return NextResponse.json({ error: automationLogsRes.error.message }, { status: 500 });
  if (publicationsCountRes.error) return NextResponse.json({ error: publicationsCountRes.error.message }, { status: 500 });
  if (emailCountRes.error) return NextResponse.json({ error: emailCountRes.error.message }, { status: 500 });

  const recentActions: { label: string; time: string; status: "done" | "error" }[] = [];

  for (const execution of (recentExecutionsRes.data || []) as CommandExecutionRow[]) {
    recentActions.push({
      label: execution.plan_title || execution.summary || "Plan utført",
      time: formatTime(execution.created_at),
      status: execution.status === "completed" ? "done" : "error",
    });
  }

  for (const publication of (recentPublicationsRes.data || []) as ContentPublicationRow[]) {
    if (recentActions.length >= 6) break;
    recentActions.push({
      label: `${publication.status === "published" ? "Publisert" : publication.status === "scheduled" ? "Planlagt" : "Feilet"}: ${publication.title || "Uten tittel"}`,
      time: formatTime(publication.created_at),
      status: publication.status === "failed" ? "error" : "done",
    });
  }

  const todayExecutions = (todayExecutionsRes.data || []) as CommandExecutionRow[];
  const automationLogs = (automationLogsRes.data || []) as AutomationLogRow[];
  let completedSteps = 0;
  const directCounts: Partial<Record<AgentFleetId, number>> = {};
  const systemCounts7d: Partial<Record<AgentFleetId, number>> = {};
  const systemAttention7d: Partial<Record<AgentFleetId, number>> = {};
  const agentLatest: Partial<Record<AgentFleetId, string>> = {};

  for (const execution of todayExecutions) {
    const steps = Array.isArray(execution.steps) ? execution.steps : [];
    for (const rawStep of steps) {
      const step = rawStep as { status?: string; agent?: string };
      const done = step.status === "completed" || step.status === "done";
      if (!done) continue;
      completedSteps += 1;
      const id = resolveAgentFleetId(step.agent);
      if (!id) continue;
      directCounts[id] = (directCounts[id] || 0) + 1;
      const next = laterTimestamp(agentLatest[id], execution.created_at);
      if (next) agentLatest[id] = next;
    }
  }

  let mappedAutomationRunsToday = 0;
  let mappedAutomationHealthyToday = 0;
  for (const log of automationLogs) {
    const id = resolveAutomationAgentId(log.action);
    if (!id) continue;
    systemCounts7d[id] = (systemCounts7d[id] || 0) + 1;
    if (!healthyAutomationStatus(log.status)) systemAttention7d[id] = (systemAttention7d[id] || 0) + 1;
    const next = laterTimestamp(agentLatest[id], log.created_at);
    if (next) agentLatest[id] = next;

    const createdMs = log.created_at ? new Date(log.created_at).getTime() : NaN;
    if (Number.isFinite(createdMs) && Number.isFinite(sinceMs) && createdMs >= sinceMs) {
      mappedAutomationRunsToday += 1;
      if (healthyAutomationStatus(log.status)) mappedAutomationHealthyToday += 1;
    }
  }

  const successfulExecutions = todayExecutions.filter((execution) =>
    ["completed", "partial", "done"].includes(execution.status || "")
  ).length;
  const totalObservedRuns = todayExecutions.length + mappedAutomationRunsToday;
  const totalSuccessfulRuns = successfulExecutions + mappedAutomationHealthyToday;

  return NextResponse.json({
    recentActions: recentActions.slice(0, 6),
    runtimeStats: {
      tasksToday: completedSteps + mappedAutomationRunsToday,
      directTasksToday: completedSteps,
      systemRunsToday: mappedAutomationRunsToday,
      successRate: totalObservedRuns > 0 ? Math.round((totalSuccessfulRuns / totalObservedRuns) * 100) : null,
      emailsToday: emailCountRes.count ?? 0,
      contentToday: publicationsCountRes.count ?? 0,
      activitySource: "command_executions + automation_logs",
    },
    agentActivity: AGENT_FLEET.map((agent) => ({
      id: agent.id,
      tasksCompleted: directCounts[agent.id] || 0,
      systemRuns: systemCounts7d[agent.id] || 0,
      systemAttention: systemAttention7d[agent.id] || 0,
      activityWindowDays: 7,
      lastActivity: agentLatest[agent.id]
        ? formatRelativeActivity(agentLatest[agent.id])
        : "Ingen registrert aktivitet siste 7 dager",
    })),
  });
}
