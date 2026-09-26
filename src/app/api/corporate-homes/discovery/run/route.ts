import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  CORPORATE_DISCOVERY_PATH,
  runCorporateHomesDiscovery,
} from "@/lib/corporate-homes-discovery-runner";
import { parseBrregIndustryProfile } from "@/lib/corporate-brreg";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request, { result: null });
  if (denied) return denied;

  const safeMode = await evaluateCronSafeMode(CORPORATE_DISCOVERY_PATH);
  if (safeMode.skip) {
    return NextResponse.json({
      error: safeMode.reason || "Corporate Homes discovery is disabled by runtime controls.",
      mode: safeMode.mode,
    }, { status: 409 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const batchSize = bounded(body?.batchSize, 25, 1, 50);
  const minEmployees = bounded(body?.minEmployees, 15, 5, 5000);
  const maxEmployees = bounded(body?.maxEmployees, 500, minEmployees, 5000);
  const profile = parseBrregIndustryProfile(body?.profile);

  try {
    const result = await runCorporateHomesDiscovery(supabase, {
      trigger: "manual",
      batchSize,
      minEmployees,
      maxEmployees,
      profile,
      sourceType: "brreg_open_data_manual",
    });

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Corporate Homes discovery failed" },
      { status: 500 },
    );
  }
}
