import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  CORPORATE_CONTENT_PATH,
  runCorporateHomesContentDrafts,
} from "@/lib/corporate-homes-content-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request, { result: null });
  if (denied) return denied;

  const safeMode = await evaluateCronSafeMode(CORPORATE_CONTENT_PATH);
  if (safeMode.skip) {
    return NextResponse.json({
      error: safeMode.reason || "Corporate Homes content drafts are disabled by runtime controls.",
      mode: safeMode.mode,
    }, { status: 409 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const result = await runCorporateHomesContentDrafts(supabase, { trigger: "manual" });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Corporate Homes content draft generation failed" },
      { status: 500 },
    );
  }
}
