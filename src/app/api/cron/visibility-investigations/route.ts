export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { investigateVisibilityTasks } from "@/services/agents/visibility-investigation";
import type { SEOControlReport } from "@/services/agents/seo-control-report";

const PATH = "/api/cron/visibility-investigations";

/**
 * Controlled public-read-only verification of recorded SEO investigation tasks.
 * No arbitrary URL, automatic repair, task closure, GitHub commits or publishing.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronApi(request);
  if (denied) return denied;
  const control = await evaluateCronSafeMode(PATH);
  if (control.skip) {
    console.info("[VisibilityInvestigation] skipped", {
      mode: control.mode, reason: control.reason || "Nexus safety control",
    });
    return NextResponse.json({
      success: true, skipped: true, reason: control.reason, mode: control.mode,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("automation_logs").select("details,created_at")
    .eq("action", "seo_gsc_live_read").in("status", ["success", "partial"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: "Audit report unavailable" }, { status: 503 });
  const report = (data?.details as {controlReport?:SEOControlReport}|null)?.controlReport ?? null;
  try {
    const result = await investigateVisibilityTasks(db, report);
    console.info("[VisibilityInvestigation] completed", {
      investigated: result.investigated, failed: result.failed, skipped: result.skipped,
    });
    return NextResponse.json({ success: result.failed === 0, ...result,
      readOnly: true, publicationAuthorized: false, resolutionVerified: false,
    }, { status: result.failed ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("[VisibilityInvestigation] failed without a saved result");
    return NextResponse.json({ error: "Independent investigation unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
