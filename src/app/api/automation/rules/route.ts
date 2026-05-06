import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const seedRules = [
  {
    id: "seed-auto-publish",
    name: "Publiser planlagt innhold",
    trigger_type: "cron_15m",
    conditions: { route: "/api/cron/auto-publish" },
    actions: [{ type: "run_endpoint", path: "/api/cron/auto-publish" }],
    status: "active",
    last_run_at: null,
    next_run_at: null,
    failure_count: 0,
    synthetic: true,
  },
  {
    id: "seed-engagement-tracker",
    name: "Hent SoMe/YouTube engagement",
    trigger_type: "daily",
    conditions: { route: "/api/cron/engagement-tracker" },
    actions: [{ type: "run_endpoint", path: "/api/cron/engagement-tracker" }],
    status: "active",
    last_run_at: null,
    next_run_at: null,
    failure_count: 0,
    synthetic: true,
  },
  {
    id: "seed-growth-engine",
    name: "Victoria daglig vekstanalyse",
    trigger_type: "daily",
    conditions: { route: "/api/cron/growth-engine" },
    actions: [{ type: "run_endpoint", path: "/api/cron/growth-engine" }],
    status: "active",
    last_run_at: null,
    next_run_at: null,
    failure_count: 0,
    synthetic: true,
  },
  {
    id: "seed-publishing-recs",
    name: "Publishing Hub anbefalinger til Oppgave-HUB",
    trigger_type: "daily",
    conditions: { route: "/api/publishing/recommendations" },
    actions: [{ type: "push_top_publishing_recommendations", count: 3 }],
    status: "paused",
    last_run_at: null,
    next_run_at: null,
    failure_count: 0,
    synthetic: true,
  },
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function originFromRequest(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
}

async function runEndpoint(origin: string, path: string) {
  const res = await fetch(`${origin}${path}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} failed with ${res.status}`);
  return data;
}

async function pushPublishingRecommendations(origin: string, count = 3) {
  const res = await fetch(`${origin}/api/publishing/recommendations`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load publishing recommendations");

  const pushed = [];
  for (const rec of (data.recommendations || []).slice(0, count)) {
    const post = await fetch(`${origin}/api/publishing/recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rec.id }),
    });
    const postData = await post.json().catch(() => ({}));
    pushed.push({ id: rec.id, title: rec.title, success: post.ok, error: postData.error || null });
  }
  return { pushed };
}

async function insertRun(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  ruleId: string | null,
  status: "success" | "error",
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  error?: string,
) {
  await supabase.from("automation_runs").insert({
    rule_id: ruleId && /^[0-9a-f-]{36}$/i.test(ruleId) ? ruleId : null,
    status,
    input,
    output,
    error: error || null,
    finished_at: new Date().toISOString(),
  });
  await supabase.from("automation_logs").insert({
    action: String(input.action || input.name || "automation_run").slice(0, 100),
    agent_name: "victoria",
    status,
    details: { input, output, error },
  });
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ rules: seedRules, runs: [], logs: [], synthetic: true });

  const [rulesRes, runsRes, logsRes] = await Promise.all([
    supabase.from("automation_rules").select("*").order("created_at", { ascending: false }),
    supabase.from("automation_runs").select("*").order("started_at", { ascending: false }).limit(20),
    supabase.from("automation_logs").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  const tableMissing = rulesRes.error && /automation_rules|schema cache|does not exist|relation/i.test(rulesRes.error.message);
  if (tableMissing) return NextResponse.json({ rules: seedRules, runs: [], logs: [], synthetic: true, tableNotReady: true });

  return NextResponse.json({
    rules: rulesRes.data?.length ? rulesRes.data : seedRules,
    runs: runsRes.data || [],
    logs: logsRes.data || [],
    synthetic: !rulesRes.data?.length,
    tableWarnings: {
      rules: rulesRes.error?.message || null,
      runs: runsRes.error?.message || null,
      logs: logsRes.error?.message || null,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "run");
  const origin = originFromRequest(req);

  if (action === "seed") {
    const rows = seedRules.map((rule) => ({
      name: rule.name,
      trigger_type: rule.trigger_type,
      conditions: rule.conditions,
      actions: rule.actions,
      status: rule.status === "active" ? "active" : "paused",
      next_run_at: rule.trigger_type === "daily" ? `${todayDate()}T06:00:00.000Z` : null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("automation_rules").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ seeded: rows.length });
  }

  const ruleId = String(body.id || "");
  const rules = ruleId.startsWith("seed-")
    ? seedRules.filter((rule) => rule.id === ruleId)
    : (await supabase.from("automation_rules").select("*").eq("id", ruleId)).data || [];
  const rule = rules[0];
  if (!rule) return NextResponse.json({ error: "Automation rule not found" }, { status: 404 });

  try {
    const outputs = [];
    for (const step of rule.actions || []) {
      if (step.type === "run_endpoint" && step.path) {
        outputs.push({ step, result: await runEndpoint(origin, step.path) });
      } else if (step.type === "push_top_publishing_recommendations") {
        outputs.push({ step, result: await pushPublishingRecommendations(origin, Number(step.count || 3)) });
      } else {
        outputs.push({ step, skipped: true, reason: "Unsupported automation action" });
      }
    }

    await insertRun(supabase, rule.id, "success", { action: "run", id: rule.id, name: rule.name }, { outputs });
    if (!String(rule.id).startsWith("seed-")) {
      await supabase.from("automation_rules").update({ last_run_at: new Date().toISOString(), failure_count: 0 }).eq("id", rule.id);
    }
    return NextResponse.json({ success: true, outputs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automation failed";
    await insertRun(supabase, rule.id, "error", { action: "run", id: rule.id, name: rule.name }, {}, message);
    if (!String(rule.id).startsWith("seed-")) {
      await supabase.from("automation_rules").update({ failure_count: Number(rule.failure_count || 0) + 1 }).eq("id", rule.id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
