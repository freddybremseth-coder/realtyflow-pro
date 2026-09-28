export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { readGSCAllBrands } from "@/services/agents/seo-search-console";
import { runPortfolioPublishers } from "@/services/agents/seo-brand-publisher";
import { evaluateSeoPilotBrand, SEO_AUTOPILOT_BRANDS } from "@/services/agents/seo-autopilot-policy";
import { runZenEcoMetadataPublisher } from "@/services/agents/seo-zeneco-publisher";

import { runSEOControls } from "@/services/agents/seo-controls";

const PATH = "/api/cron/seo-autopilot";
const ACTION = "seo_autopilot_pilot_cycle";

/**
 * Automatic portfolio cycle with narrowly authorized metadata publishers.
 * Only independently verified, exact-page, versioned writers may publish.
 * No extra approval work item is created just because a page was measured.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;
  const control = await evaluateCronSafeMode(PATH);
  if (control.skip) return NextResponse.json({
    success: true, skipped: true, reason: control.reason, mode: control.mode,
  });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    // Prevent repeated Google calls and new approval-queue entries on a retry.
    const last = await supabase.from("automation_logs").select("created_at")
      .eq("action", ACTION).in("status", ["success", "partial"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last.error) throw new Error("Last SEO pilot lookup: " + last.error.message);
    if (last.data?.created_at && Date.now() - Date.parse(last.data.created_at) < 20 * 3600_000) {
      return NextResponse.json({ success: true, skipped: true, reason: "SEO pilot already measured within 20 hours" });
    }

    const readings = await readGSCAllBrands();
    const assessments = readings.map(item => evaluateSeoPilotBrand(
      item.brandId,
      item.status === "connected" ? item.result : null,
      "error" in item && typeof item.error === "string" ? item.error : undefined,
    ));
    const verified = readings.filter(item => item.status === "connected" && item.result !== null).length;
    const timestamp = new Date().toISOString();
    // Each writer records a durable intent and advances only a bounded phase.
    // Run independent public controls in parallel to stay within the cron budget.
    const publication = Promise.all([
      runZenEcoMetadataPublisher(supabase,
        readings.find(item => item.brandId === "zeneco" && item.status === "connected")?.result || null,
        url).catch(() => ({status: "blocked" as const, reason: "Zen-publisering kunne ikke kontrolleres.", page: null, published: 0})),
      runPortfolioPublishers(supabase, readings.flatMap(item => item.status === "connected" && item.result ? [item.result] : [])),
    ]);
    // Daily, low-risk, evidence-tagged technical/lead/referral diagnostics for
    // every approved public host. A failing site or data source must not erase
    // successful Google readings or create an owner approval queue item.
    const { signals, leads, audits, collectorPreflight, diagnostics, controlReport } = await runSEOControls(
      readings.flatMap(item => item.status === "connected" && item.result ? [item.result] : []),
    );
    // Share the factual measurements and zero-approval diagnostics with
    // Sam's main panel after reload. These checks NEVER authorize site writes.
    const storedReadings = await supabase.from("automation_logs").insert({
      action: "seo_gsc_live_read", agent_name: "Sam SEO Expert",
      status: verified ? "success" : "partial",
      details: {
        google_search_console: readings, source: ACTION, collected_at: timestamp,
        diagnostics, collectorPreflight, controlReport, auditCheckedAt: audits.length ? timestamp : null,
        sourceAvailability: {
          searchConsoleMeasured: verified,
          siteAuditsMeasured: audits.length,
          referralsAvailable: signals !== null,
          collectorPreflightChecked: collectorPreflight !== null,
          leadsAvailable: leads !== null,
        },
      },
    });
    if (storedReadings.error) throw new Error("Cannot store Google readings: " + storedReadings.error.message);

    const [zeneco, brandPublishers] = await publication;
    const published = zeneco.published + brandPublishers.reduce((sum, item) => sum + item.published, 0);

    const result = await supabase.from("automation_logs").insert({
      action: ACTION, agent_name: "Sam SEO Expert",
      status: verified ? "success" : "partial",
      details: {
        collected_at: timestamp,
        monitored_brands: readings.map(item => item.brandId),
        pilot_brands: SEO_AUTOPILOT_BRANDS,
        assessed: assessments,
        search_console_brands_measured: verified,
        controlReport,
        daily_diagnostics: diagnostics.length,
        public_sites_audited: audits.length,
        collector_preflight: collectorPreflight ? {
          pass: collectorPreflight.filter(check => check.status === "pass").length,
          blocked: collectorPreflight.filter(check => check.status === "blocked").length,
          unknown: collectorPreflight.filter(check => check.status === "unknown").length,
        } : null,
        website_changes_published: published,
        public_write_status: zeneco.status === "monitor" ? "armed_evidence_gated"
          : zeneco.status === "pending" ? "pending_site_confirmation"
          : zeneco.status,
        zeneco_metadata_pilot: zeneco,
        brand_publishers: brandPublishers,
        note: "Eight public brands: four fixed Zen metadata pages plus one homepage experiment per other brand. GitHub writers require exact source/public agreement, fresh Google evidence, a durable before-version, green checks and verified public HTML. Prices, body content, canonical and customer data are outside this scope.",
      },
    });
    if (result.error) throw new Error("Cannot store SEO pilot cycle: " + result.error.message);

    return NextResponse.json({
      success: true, analyzed: assessments.length, measured: verified,
      publicSitesAudited: audits.length, diagnosticsRecorded: diagnostics.length,
      candidates: assessments.filter(item => item.status === "candidate").length,
      published,
      brandPublishers,
      approvalTasksCreated: 0,
      writeStatus: zeneco.status === "monitor" ? "armed_evidence_gated"
        : zeneco.status === "pending" ? "pending_site_confirmation"
        : zeneco.status,
      zenEcoMetadataPilot: zeneco,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SEO pilot unavailable";
    console.error("[SamSEO] Pilot cycle failed", message);
    // Retain failures for the next dashboard load and Automation Center.
    // Failure logging must not replace the original error if storage is down.
    try {
      await supabase.from("automation_logs").insert({
        action: ACTION, agent_name: "Sam SEO Expert", status: "error",
        details: { error: "SEO-syklusen ble ikke fullført. Se serverloggen for årsak.", public_write_status: "unknown" },
      });
    } catch { /* Preserve the original failure response. */ }
    return NextResponse.json({ error: message.slice(0, 250) }, { status: 503 });
  }
}
