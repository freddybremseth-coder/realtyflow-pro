import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { start } from "workflow/api";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { resolveBookAutopilotOrigin, snapshotBookProduction } from "@/lib/publishing/book-production-autopilot";
import { bookProductionAutopilot } from "@/workflows/book-production-autopilot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  let projectId = request.nextUrl.searchParams.get("projectId")?.trim() || "";
  let activeRun: Record<string, any> | null = null;
  if (!projectId) {
    const { data, error } = await supabase
      .from("publishing_book_production_runs")
      .select("*")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ run: null, project: null });
    activeRun = data;
    projectId = String(data.project_id);
  }
  const [{ data: run, error: runError }, { data: project, error: projectError }] = await Promise.all([
    activeRun ? Promise.resolve({ data: activeRun, error: null }) : supabase
      .from("publishing_book_production_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("publishing_book_projects")
      .select("id,title,status,metadata_plan,outline_plan,chapter_drafts")
      .eq("id", projectId)
      .maybeSingle(),
  ]);
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Book project not found" }, { status: 404 });
  return NextResponse.json({ run: run || null, project: snapshotBookProduction(project), projectTitle: project.title });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  const access = await getRequestAccessContext(request);
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const projectId = String(body.projectId || body.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data: project, error: projectError } = await supabase
    .from("publishing_book_projects")
    .select("id,status,metadata_plan,outline_plan,chapter_drafts")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Book project not found" }, { status: 404 });

  const snapshot = snapshotBookProduction(project);
  if (snapshot.readyForExport) {
    return NextResponse.json({
      alreadyComplete: true,
      project: snapshot,
      controlledBoundary: "awaiting_human_final_approval",
    });
  }

  const { data: active, error: activeError } = await supabase
    .from("publishing_book_production_runs")
    .select("*")
    .eq("project_id", projectId)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
  // A queued row without workflow_run_id may be between start() and the
  // follow-up update. Never start a second workflow for the same active row.
  if (active) return NextResponse.json({ run: active, alreadyRunning: true });

  const { data: productionRun, error: insertError } = await supabase
    .from("publishing_book_production_runs")
    .insert({
      project_id: projectId,
      status: "queued",
      stage: "queued",
      chapters_completed: snapshot.chaptersCompleted,
      chapters_total: snapshot.chaptersTotal,
      requested_by: access?.email || null,
      metadata: { controlled_boundary: "ready_for_export" },
    })
    .select("*")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await supabase
        .from("publishing_book_production_runs")
        .select("*")
        .eq("project_id", projectId)
        .in("status", ["queued", "running"])
        .maybeSingle();
      if (raced) return NextResponse.json({ run: raced, alreadyRunning: true });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const origin = resolveBookAutopilotOrigin(request.nextUrl.origin);
    const workflowRun = await start(bookProductionAutopilot, [{
      productionRunId: productionRun.id,
      projectId,
      origin,
    }]);
    const { data: updated, error: updateError } = await supabase
      .from("publishing_book_production_runs")
      .update({ workflow_run_id: workflowRun.runId })
      .eq("id", productionRun.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ run: updated, started: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("publishing_book_production_runs")
      .update({ status: "failed", stage: "start_failed", error: message, completed_at: new Date().toISOString() })
      .eq("id", productionRun.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
