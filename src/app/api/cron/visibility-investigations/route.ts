export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { investigateVisibilityTasks } from "@/services/agents/visibility-investigation";
import { visibilityEvidenceAge } from "@/services/agents/visibility-evidence-age";
import { makeVisibilityRunEntry, recordVisibilityRun } from "@/services/agents/visibility-run-ledger";
import type { SEOControlReport } from "@/services/agents/seo-control-report";

const PATH = "/api/cron/visibility-investigations";

/**
 * Cron-only, bounded public verification. Every authorized attempt is logged
 * with an operational outcome when storage is reachable. The run ledger is
 * NOT evidence of a repaired site, and does not close any Nexus tasks.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronApi(request);
  if (denied) return denied;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = url && key ? createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) : null;

  const control = await evaluateCronSafeMode(PATH);
  if (control.skip) {
    const telemetryPersisted = db
      ? await recordVisibilityRun(db, makeVisibilityRunEntry("cron", "SKIPPED", "SAFE_MODE"))
      : false;
    console.info("[VisibilityInvestigation] skipped", {
      mode: control.mode, reason: control.reason || "Nexus safety control",
      telemetryPersisted,
    });
    return NextResponse.json({
      success: true, skipped: true, reason: control.reason, mode: control.mode,
      telemetryPersisted, executionStarted: false, publicationAuthorized: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (!db) {
    console.error("[VisibilityInvestigation] database unavailable; no site audit started");
    return NextResponse.json({ error: "Database unavailable", telemetryPersisted: false }, { status: 503 });
  }

  const { data, error } = await db.from("automation_logs").select("details,created_at")
    .eq("action", "seo_gsc_live_read").in("status", ["success", "partial"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("cron", "FAILED", "SOURCE_REPORT_UNAVAILABLE"),
    );
    return NextResponse.json({ error: "Audit report unavailable", telemetryPersisted },
      { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  const report = (data?.details as {controlReport?:SEOControlReport}|null)?.controlReport ?? null;
  const now = new Date();
  const sourceAt = report?.checkedAt ? Date.parse(report.checkedAt) : NaN;
  if (!report || !Array.isArray(report.sites) ||
      visibilityEvidenceAge(report.checkedAt, now) !== "RECENT" ||
      !Number.isFinite(sourceAt) || Math.abs(now.getTime() - sourceAt) > 48 * 60 * 60_000) {
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("cron", "SKIPPED", "SOURCE_REPORT_STALE"),
    );
    return NextResponse.json({
      success: true, skipped: true, reason: "Source report missing or stale",
      telemetryPersisted, executionStarted: false, publicationAuthorized: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const result = await investigateVisibilityTasks(db, report, now);
    const outcome = result.failed ? "FAILED" : "COMPLETED";
    const reason = result.failed ? "INVESTIGATION_ERROR"
      : result.investigated === 0 ? "NO_ELIGIBLE_TASKS" : "NONE";
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("cron", outcome, reason, result),
    );
    console.info("[VisibilityInvestigation] completed", {
      investigated: result.investigated, failed: result.failed,
      skipped: result.skipped, telemetryPersisted,
    });
    return NextResponse.json({
      success: result.failed === 0 && telemetryPersisted,
      ...result, readOnly: true, publicationAuthorized: false,
      resolutionVerified: false, telemetryPersisted,
    }, { status: result.failed || !telemetryPersisted ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" } });
  } catch {
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("cron", "FAILED", "INVESTIGATION_ERROR"),
    );
    console.error("[VisibilityInvestigation] failed", { telemetryPersisted });
    return NextResponse.json({
      error: "Independent investigation unavailable", telemetryPersisted,
      executionStarted: false, publicationAuthorized: false,
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
