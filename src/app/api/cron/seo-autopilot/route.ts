export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { readGSCAllBrands } from "@/services/agents/seo-search-console";
import { evaluateSeoPilotBrand } from "@/services/agents/seo-autopilot-policy";
import { runZenEcoMetadataPublisher } from "@/services/agents/seo-zeneco-publisher";

const PATH = "/api/cron/seo-autopilot";
const ACTION = "seo_autopilot_pilot_cycle";

/**
 * Automatic read-only pilot cycle. The owner has also authorized narrowly
 * reversible public edits, but THIS endpoint does not impersonate a CMS:
 * only an independently verified, exact-page, versioned writer may publish.
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
    // Share the factual measurements with Sam's main panel after reload.
    const storedReadings = await supabase.from("automation_logs").insert({
      action: "seo_gsc_live_read", agent_name: "Sam SEO Expert",
      status: verified ? "success" : "partial",
      details: { google_search_console: readings, source: ACTION, collected_at: timestamp },
    });
    if (storedReadings.error) throw new Error("Cannot store Google readings: " + storedReadings.error.message);

    // User-approved safe write pilot: ONLY four fixed Zen metadata pages, and
    // only with recent exact-page/query Google evidence, public same-database
    // readiness, optimistic revision audit and a separately verified live page.
    // Failure never blocks Google metrics or sends anything to customers.
    const zeneco = await runZenEcoMetadataPublisher(
      supabase,
      readings.find(item => item.brandId === "zeneco" && item.status === "connected")?.result || null,
      url,
    ).catch(error => ({
      status: "blocked" as const,
      reason: "Metadata publisher failed safely: " + (error instanceof Error ? error.message : "unknown").slice(0,130),
      page: null,
      published: 0,
    }));

    const result = await supabase.from("automation_logs").insert({
      action: ACTION, agent_name: "Sam SEO Expert",
      status: verified ? "success" : "partial",
      details: {
        collected_at: timestamp,
        pilot_brands: ["zeneco", "freddyb"],
        assessed: assessments,
        search_console_brands_measured: verified,
        website_changes_published: zeneco.published,
        public_write_status: zeneco.status === "monitor" ? "armed_evidence_gated"
          : zeneco.status === "pending" ? "pending_site_confirmation"
          : zeneco.status,
        zeneco_metadata_pilot: zeneco,
        note: "Search Console is read-only. Only four hardcoded Zen landing-page title/description variants can be staged after exact Google evidence and same-database readiness. A live change is counted only after its public HTML is verified; failed confirmation triggers exact revision rollback. Customer messages, pricing, body content and other brands remain untouched.",
      },
    });
    if (result.error) throw new Error("Cannot store SEO pilot cycle: " + result.error.message);

    return NextResponse.json({
      success: true, analyzed: assessments.length, measured: verified,
      candidates: assessments.filter(item => item.status === "candidate").length,
      published: zeneco.published,
      approvalTasksCreated: 0,
      writeStatus: zeneco.status === "monitor" ? "armed_evidence_gated"
        : zeneco.status === "pending" ? "pending_site_confirmation"
        : zeneco.status,
      zenEcoMetadataPilot: zeneco,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SEO pilot unavailable";
    console.error("[SamSEO] Pilot cycle failed", message);
    return NextResponse.json({ error: message.slice(0, 250) }, { status: 503 });
  }
}
