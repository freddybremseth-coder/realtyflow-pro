export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  CORPORATE_DISCOVERY_PATH,
  CORPORATE_DISCOVERY_WEEKLY_BATCH,
  runCorporateHomesDiscovery,
} from "@/lib/corporate-homes-discovery-runner";

export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

/**
 * Weekly company-level prospect discovery.
 * Uses only Brønnøysundregistrene public entity data.
 * It never enriches people, sends outreach, or promotes prospects to CRM.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode(CORPORATE_DISCOVERY_PATH);
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

  try {
    const result = await runCorporateHomesDiscovery(supabase, {
      trigger: "cron",
      batchSize: CORPORATE_DISCOVERY_WEEKLY_BATCH,
      minEmployees: 15,
      maxEmployees: 500,
      profile: "core",
      sourceType: "brreg_open_data_weekly",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Corporate Homes discovery failed" },
      { status: 500 },
    );
  }
}
