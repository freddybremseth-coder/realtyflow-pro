export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { visibilityEvidenceAge } from "@/services/agents/visibility-evidence-age";
import { investigateVisibilityTasks } from "@/services/agents/visibility-investigation";
import { makeVisibilityRunEntry, recordVisibilityRun } from "@/services/agents/visibility-run-ledger";
import type { SEOControlReport } from "@/services/agents/seo-control-report";

export async function POST(request: NextRequest) {
  const ctx = await getRequestAccessContext(request);
  if (ctx?.role !== "OWNER" || ctx.source !== "owner-session") {
    return NextResponse.json({ error: "Owner session required" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if ((origin && origin !== request.nextUrl.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // The owner button is NOT an escape hatch for an explicit Nexus kill switch
  // or emergency safe mode. It uses the same safety decision as the cron.
  const control = await evaluateCronSafeMode("/api/cron/visibility-investigations");
  if (control.skip) {
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("owner", "SKIPPED", "SAFE_MODE"),
    );
    return NextResponse.json({ error: "Kontrollen er deaktivert i Nexus/sikkerhetsmodus",
      skipped: true, mode: control.mode, telemetryPersisted,
      executionStarted: false, publicationAuthorized: false,
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }

  const { data, error } = await db.from("automation_logs").select("details")
    .eq("action", "seo_gsc_live_read").in("status", ["success", "partial"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("owner", "FAILED", "SOURCE_REPORT_UNAVAILABLE"),
    );
    return NextResponse.json({ error: "Could not read source controls", telemetryPersisted },
      { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  const report = (data?.details as {controlReport?:SEOControlReport}|null)?.controlReport ?? null;
  const now = new Date();
  const at = report?.checkedAt ? Date.parse(report.checkedAt) : NaN;
  if (!report || !Array.isArray(report.sites) ||
      visibilityEvidenceAge(report.checkedAt, now) !== "RECENT" ||
      !Number.isFinite(at) || Math.abs(now.getTime() - at) > 48 * 60 * 60_000) {
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("owner", "SKIPPED", "SOURCE_REPORT_STALE"),
    );
    return NextResponse.json({ error: "Ingen fersk SEO-rapport tilgjengelig",
      skipped: true, telemetryPersisted, executionStarted: false, publicationAuthorized: false,
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const result = await investigateVisibilityTasks(db, report, now);
    const outcome = result.failed ? "FAILED" : "COMPLETED";
    const reason = result.failed ? "INVESTIGATION_ERROR"
      : result.investigated === 0 ? "NO_ELIGIBLE_TASKS" : "NONE";
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("owner", outcome, reason, result),
    );
    return NextResponse.json({
      ...result, readOnly: true, publicationAuthorized: false,
      resolutionVerified: false, telemetryPersisted,
    }, { status: result.failed || !telemetryPersisted ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" } });
  } catch {
    const telemetryPersisted = await recordVisibilityRun(
      db, makeVisibilityRunEntry("owner", "FAILED", "INVESTIGATION_ERROR"),
    );
    return NextResponse.json({ error: "Investigation unavailable",
      telemetryPersisted, executionStarted: false, publicationAuthorized: false,
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
