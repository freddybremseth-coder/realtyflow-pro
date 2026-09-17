export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  runEmailHistoryBackfillJob,
  type EmailHistoryBackfillAccount,
  type EmailHistoryBackfillJob,
} from "@/services/email/history-backfill-worker";

export const maxDuration = 300;
const PATH = "/api/cron/email-history-backfill";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: jobs, error: jobsError } = await supabase
    .from("email_history_backfill_jobs")
    .select("*")
    .eq("enabled", true)
    .in("status", ["pending", "running", "error"])
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(1);
  if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });

  if (!jobs?.length) {
    return NextResponse.json({ success: true, activeJobs: 0, processed: 0 });
  }

  const results: Array<Record<string, unknown>> = [];
  let failed = 0;

  for (const job of jobs as EmailHistoryBackfillJob[]) {
    try {
      const { data: account, error: accountError } = await supabase
        .from("brand_email_configs")
        .select("*")
        .eq("id", job.account_id)
        .eq("brand_id", job.brand_id)
        .eq("is_active", true)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) throw new Error("Backfill email account is missing or inactive");

      const result = await runEmailHistoryBackfillJob(
        supabase,
        job,
        account as EmailHistoryBackfillAccount,
      );
      results.push(result);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const now = new Date().toISOString();
      await supabase
        .from("email_history_backfill_jobs")
        .update({ status: "error", last_error: message, last_run_at: now, updated_at: now })
        .eq("account_id", job.account_id);
      results.push({ brandId: job.brand_id, accountId: job.account_id, error: message });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "email_history_backfill_worker",
    agent_name: "nexus_communications",
    status: failed ? "failed" : "success",
    details: {
      active_jobs: jobs.length,
      processed: results.length,
      failed,
      results,
      runtime_control: `cron:${PATH}`,
      sends_email: false,
      exact_unique_crm_linking_only: true,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    success: failed === 0,
    activeJobs: jobs.length,
    processed: results.length,
    failed,
    results,
  });
}
