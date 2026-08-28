import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { runApprovedDirectStoreJobs } from "@/services/publishing/connectors/direct-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/book-distribution");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const supabase = createClient(url, key);

  try {
    const result = await runApprovedDirectStoreJobs(supabase, { limit: 5, actor: "vercel_cron" });
    await supabase.from("automation_logs").insert({
      action: "book_distribution_worker_v1",
      agent_name: "publishing",
      status: "success",
      details: result,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Book distribution worker failed";
    await supabase.from("automation_logs").insert({
      action: "book_distribution_worker_v1",
      agent_name: "publishing",
      status: "error",
      details: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
