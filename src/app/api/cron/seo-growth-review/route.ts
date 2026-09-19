export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { SEOAgent } from "@/services/agents/seo-agent";
import { getSEOObservedSignals } from "@/services/agents/seo-data";
import { auditSEOPortfolio } from "@/services/agents/seo-audit";

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
    const [signals, audits] = await Promise.all([getSEOObservedSignals(), auditSEOPortfolio()]);
    const report = (await new SEOAgent().portfolioGrowthReview({ signals, audits })).slice(0, 24000);
    const status = signals.totals.current === 0 || signals.dataQuality.truncated ? "partial" : "success";
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
        technical_audits: audits,
        technical_findings: audits.reduce((sum, audit) => sum + audit.observations.length, 0),
        technical_checks_incomplete: audits.reduce((sum, audit) => sum + audit.limitations.filter(message => !message.startsWith("Homepage/robots/sitemap")).length, 0),
        report,
        needs_editor_approval: true,
        published: false,
      },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true, status, analyzed: signals.byBrand.length,
      observedVisits: signals.totals.current, published: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SamSEO] Growth review failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
