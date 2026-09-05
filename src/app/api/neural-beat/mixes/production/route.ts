import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { start } from "workflow/api";
import { requireAdminApi } from "@/lib/api-admin";
import { remasterMixProduction } from "@/workflows/remaster-mix-production";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const bodySchema = z.object({ id: z.string().uuid() }).strict();

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Valid mix id is required." }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: current, error: loadError } = await supabase
    .from("remaster_mix_jobs")
    .select("id,status,target_minutes,youtube_upload_started_at,youtube_video_id,retry_count,max_retries")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Mix job not found." }, { status: 404 });

  if (Number(current.target_minutes) > 30) {
    return NextResponse.json(
      {
        error: "Production testing currently supports 30-minute mixes. Longer plans remain saved as drafts until segmented long-form rendering is enabled.",
        code: "MIX_PRODUCTION_MAX_30_MIN",
      },
      { status: 409 },
    );
  }

  if (!["draft", "failed"].includes(String(current.status))) {
    return NextResponse.json(
      { error: `Mix is already ${current.status}. Only draft or failed jobs can start production.` },
      { status: 409 },
    );
  }

  if (current.youtube_video_id) {
    return NextResponse.json(
      { error: "This mix already has a YouTube video and cannot be produced again.", code: "MIX_ALREADY_UPLOADED" },
      { status: 409 },
    );
  }

  if (current.youtube_upload_started_at) {
    return NextResponse.json(
      {
        error: "A previous YouTube upload may have started. Manual review is required to prevent a duplicate upload.",
        code: "YOUTUBE_UPLOAD_AMBIGUOUS",
      },
      { status: 409 },
    );
  }

  if (current.status === "failed" && Number(current.retry_count) >= Number(current.max_retries)) {
    return NextResponse.json(
      { error: "This mix reached its retry limit and requires manual review.", code: "MIX_RETRY_LIMIT_REACHED" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: queued, error: queueError } = await supabase
    .from("remaster_mix_jobs")
    .update({
      status: "queued",
      pipeline_step: "queued",
      progress: 0,
      error_code: null,
      error_message: null,
      lease_owner: null,
      lease_token: null,
      lease_expires_at: null,
      queued_at: now,
      updated_at: now,
    })
    .eq("id", current.id)
    .in("status", ["draft", "failed"])
    .is("youtube_upload_started_at", null)
    .is("youtube_video_id", null)
    .select("*")
    .single();

  if (queueError) return NextResponse.json({ error: queueError.message }, { status: 500 });

  try {
    const workflowRun = await start(remasterMixProduction, [{
      trigger: "admin",
      requestedJobId: current.id,
    }]);

    return NextResponse.json({
      success: true,
      started: true,
      mix: queued,
      workflowRunId: workflowRun.runId,
      message: "30-minute production mix queued and worker started.",
    }, { status: 202 });
  } catch (error) {
    // Keep the durable row queued. Recovery cron will start another workflow.
    return NextResponse.json({
      success: true,
      started: false,
      recoveryScheduled: true,
      mix: queued,
      warning: error instanceof Error ? error.message : "Immediate workflow start failed; recovery cron will retry.",
    }, { status: 202 });
  }
}
