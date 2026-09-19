export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { SEOAgent } from "@/services/agents/seo-agent";
import { getSEOObservedSignals } from "@/services/agents/seo-data";
import { getSEOLeadSignals } from "@/services/agents/seo-leads";
import { planSEOOpportunities } from "@/services/agents/seo-opportunities";
import { planGSCOpportunities } from "@/services/agents/seo-priorities";
import { auditSEOPortfolio } from "@/services/agents/seo-audit";
import { readGSCAllBrands } from "@/services/agents/seo-search-console";
import { evaluateTrackedSEOChanges, parseTrackedSEOChange } from "@/services/agents/seo-change-monitor";

const ACTION = "seo_portfolio_growth_review";
const PATH = "/api/cron/seo-growth-review";

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;
  const control = await evaluateCronSafeMode(PATH);
  if (control.skip) {
    return NextResponse.json({
      success: true, skipped: true, reason: control.reason, mode: control.mode,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // A schedule retry must not create a second review / second AI expense.
  const { data: last, error: lastError } = await supabase.from("automation_logs")
    .select("created_at,status")
    .eq("action", ACTION)
    .in("status", ["success", "partial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return NextResponse.json({ error: lastError.message }, { status: 500 });
  if (last?.created_at && Date.now() - Date.parse(last.created_at) < 6 * 86400000) {
    return NextResponse.json({ success: true, skipped: true, reason: "Recent SEO review exists" });
  }

  try {
    const [signals, audits, leads, searchConsole] = await Promise.all([
      getSEOObservedSignals(), auditSEOPortfolio(), getSEOLeadSignals(), readGSCAllBrands(),
    ]);
    const report = (await new SEOAgent().portfolioGrowthReview({ signals, audits, leads, searchConsole })).slice(0, 24000);
    const { data: changeRows, error: changeError } = await supabase.from("automation_logs")
      .select("details")
      .eq("action", "seo_autopilot_change").eq("status", "success")
      .order("created_at", { ascending: false }).limit(25);
    if (changeError) throw new Error("SEO change audit lookup failed: " + changeError.message);
    const tracked = (changeRows || []).map(row => parseTrackedSEOChange(row.details))
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const changeEvaluations = evaluateTrackedSEOChanges(
      tracked, searchConsole.flatMap(item => item.status === "connected" && item.result ? [item.result] : []),
    );
    // Only evidence-backed, review-only work items. No CRM contact data or
    // generated copy is published. Keep active issues idempotent across weeks.
    const verifiedGSC = searchConsole.flatMap(item => item.status === "connected" && item.result ? [item.result] : []);
    const candidates = [
      ...planSEOOpportunities(signals, leads, audits),
      // Zero Google impressions alone is a monitored measurement, not work
      // requiring editorial approval. Keep it in the stored GSC snapshots.
      ...planGSCOpportunities(verifiedGSC).filter(item => !item.issueId.startsWith("gsc-zero-visibility:")),
    ].slice(0, 18);
    const { data: existingItems, error: itemsError } = await supabase.from("work_items")
      .select("source_id")
      .eq("source_type", "ai_agent")
      .eq("assigned_agent", "seo")
      .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
      .limit(500);
    if (itemsError) throw new Error("SEO opportunity deduplication failed: " + itemsError.message);
    const active = new Set((existingItems || []).map(item => String(item.source_id || "")));
    const newItems = candidates.filter(candidate => !active.has("seo-opportunity:" + candidate.issueId));
    if (newItems.length) {
      const { error: createError } = await supabase.from("work_items").insert(newItems.map(item => ({
        title: item.title,
        description: item.description,
        brand_id: item.brandId,
        status: "TO_DO",
        priority: item.priority,
        source_type: "ai_agent",
        source_id: "seo-opportunity:" + item.issueId,
        assigned_agent: "seo",
        next_action: item.nextAction,
        metadata: {
          seo_issue_key: item.issueId,
          evidence: item.evidence,
          review_only: true,
          needs_editor_approval: true,
          published: false,
        },
      })));
      if (createError) throw new Error("SEO opportunity persistence failed: " + createError.message);
    }
    const hasVerifiedGSC = searchConsole.some(item => item.status === "connected" && item.result !== null);
    const status = (signals.totals.current === 0 && !hasVerifiedGSC) || signals.dataQuality.truncated ? "partial" : "success";
    const { error } = await supabase.from("automation_logs").insert({
      action: ACTION,
      agent_name: "Sam SEO Expert",
      status,
      details: {
        kind: "read_only_recommendations",
        collected_at: signals.collectedAt,
        measurement: signals.measurement,
        data_quality: signals.dataQuality,
        totals: signals.totals,
        by_brand: signals.byBrand,
        by_source: signals.bySource,
        top_pages: signals.topPages,
        website_inquiries: leads,
        google_search_console: searchConsole,
        seo_autopilot_change_evaluations: changeEvaluations,
        opportunity_candidates: candidates.length,
        review_work_items_created: newItems.length,
        technical_audits: audits,
        technical_findings: audits.reduce((sum, audit) => sum + audit.observations.length, 0),
        technical_checks_incomplete: audits.reduce((sum, audit) => sum + audit.limitations.filter(message => !/^(?:Homepage\/robots\/sitemap|Homepage, robots, sitemap)/.test(message)).length, 0),
        report,
        needs_editor_approval: true,
        published: false,
      },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true, status, analyzed: signals.byBrand.length,
      observedVisits: signals.totals.current,
      observedWebsiteInquiries: leads.totals.current,
      proposedReviewItems: newItems.length,
      verifiedSearchConsoleBrands: searchConsole.filter(item => item.status === "connected").length,
      published: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SamSEO] Growth review failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
