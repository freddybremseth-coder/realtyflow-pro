export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  CORPORATE_CONTENT_PATH,
  runCorporateHomesContentDrafts,
} from "@/lib/corporate-homes-content-runner";

export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode(CORPORATE_CONTENT_PATH);
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
    const result = await runCorporateHomesContentDrafts(supabase, { trigger: "cron" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Corporate Homes content draft generation failed" },
      { status: 500 },
    );
  }
}
