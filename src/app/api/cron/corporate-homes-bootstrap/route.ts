export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { runCorporateHomesDiscovery } from "@/lib/corporate-homes-discovery-runner";

export const maxDuration = 120;

const PATH = "/api/cron/corporate-homes-bootstrap";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

/**
 * First-batch bootstrap only.
 * Runs on a short cadence until Corporate Homes has at least one prospect.
 * After the first successful import it becomes a cheap no-op.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      mode: safeMode.mode,
      reason: safeMode.reason,
    });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { count, error } = await supabase
    .from("corporate_prospects")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", "zeneco");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const current = Number(count || 0);
  if (current > 0) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "bootstrap_complete",
      current,
    });
  }

  try {
    const result = await runCorporateHomesDiscovery(supabase, {
      trigger: "cron",
      batchSize: 25,
      minEmployees: 15,
      maxEmployees: 500,
      profile: "core",
      sourceType: "brreg_open_data_bootstrap",
    });

    return NextResponse.json({
      ...result,
      bootstrap: true,
    });
  } catch (runError) {
    return NextResponse.json(
      { error: runError instanceof Error ? runError.message : "Corporate Homes bootstrap failed" },
      { status: 500 },
    );
  }
}
