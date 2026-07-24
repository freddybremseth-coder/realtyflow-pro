import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";

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

const agentProfiles = [
  { id: "ceo", name: "Victoria CEO" },
  { id: "marketing", name: "Marketing Agent" },
  { id: "sales", name: "Sales Agent" },
  { id: "seo", name: "Victoria SEO" },
  { id: "business", name: "Business Agent" },
  { id: "youtube", name: "YouTube Agent" },
  { id: "multi-domain", name: "Multi-Domain Expert" },
];

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

function normalizeAgentKey(value?: string | null) {
  return (value || "").toLowerCase().replace(/\s+/g, "-");
}

function resolveAgentKey(value?: string | null) {
  if (!value) return "";
  const normalized = normalizeAgentKey(value);
  const matchedAgent = agentProfiles.find(
    (agent) => normalized.includes(agent.id) || agent.name.toLowerCase().includes((value || "").toLowerCase())
  );
  return matchedAgent?.id || normalized;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, {
    recentActions: [],
    runtimeStats: { tasksToday: null, successRate: null, emailsToday: null, contentToday: null },
    agentActivity: [],
  });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      recentActions: [],
      runtimeStats: { tasksToday: null, successRate: null, emailsToday: null, contentToday: null },
      agentActivity: [],
    });
  }

  const since = request.nextUrl.searchParams.get("since") || new Date().toISOString().slice(0, 10);

  const [recentExecutionsRes, recentPublicationsRes, todayExecutionsRes, publicationsCountRes, emailCountRes] =
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
        .limit(200),
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
  if (publicationsCountRes.error) return NextResponse.json({ error: publicationsCountRes.error.message }, { status: 500 });
  if (emailCountRes.error) return NextResponse.json({ error: emailCountRes.error.message }, { status: 500 });

  const recentActions: { label: string; time: string; status: "done" | "error" }[] = [];

  for (const execution of (recentExecutionsRes.data || []) as CommandExecutionRow[]) {
    recentActions.push({
      label: execution.plan_title || execution.summary || "Plan utfort",
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
  let completedSteps = 0;
  const agentCounts: Record<string, number> = {};
  const agentLatest: Record<string, string> = {};

  for (const execution of todayExecutions) {
    const steps = Array.isArray(execution.steps) ? execution.steps : [];
    for (const rawStep of steps) {
      const step = rawStep as { status?: string; agent?: string };
      const done = step.status === "completed" || step.status === "done";
      if (!done) continue;
      completedSteps += 1;
      const key = resolveAgentKey(step.agent);
      if (key) {
        agentCounts[key] = (agentCounts[key] || 0) + 1;
        if (!agentLatest[key] && execution.created_at) {
          agentLatest[key] = execution.created_at;
        }
      }
    }
  }

  const successfulExecutions = todayExecutions.filter((execution) =>
    ["completed", "partial", "done"].includes(execution.status || "")
  ).length;

  return NextResponse.json({
    recentActions: recentActions.slice(0, 6),
    runtimeStats: {
      tasksToday: completedSteps,
      successRate: todayExecutions.length > 0 ? Math.round((successfulExecutions / todayExecutions.length) * 100) : null,
      emailsToday: emailCountRes.count ?? 0,
      contentToday: publicationsCountRes.count ?? 0,
    },
    agentActivity: agentProfiles.map((agent) => ({
      id: agent.id,
      tasksCompleted: agentCounts[agent.id] || 0,
      lastActivity: agentCounts[agent.id]
        ? formatRelativeActivity(agentLatest[agent.id])
        : "Ingen registrert aktivitet i dag",
    })),
  });
}
