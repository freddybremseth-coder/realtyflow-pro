export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { buildCorporateGrowthReview, compareCorporateGrowthReview } from "@/lib/corporate-growth-review";

const ACTION = "corporate_homes_growth_review";
const PATH = "/api/cron/corporate-homes-growth-review";

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const control = await evaluateCronSafeMode(PATH);
  if (control.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: control.reason,
      mode: control.mode,
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

  const { data: recentReviews, error: lastError } = await supabase
    .from("automation_logs")
    .select("created_at,status,details")
    .eq("action", ACTION)
    .in("status", ["success", "partial"])
    .order("created_at", { ascending: false })
    .limit(8);

  if (lastError) return NextResponse.json({ error: lastError.message }, { status: 500 });
  const last = recentReviews?.[0] || null;
  if (last?.created_at && Date.now() - Date.parse(last.created_at) < 6 * 86_400_000) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "Recent Corporate growth review exists",
    });
  }

  const [
    { data: prospects, error: prospectsError },
    { data: revenueEvents, error: revenueEventsError },
  ] = await Promise.all([
    supabase
      .from("corporate_prospects")
      .select("id,status,converted_contact_id")
      .eq("brand_id", "zeneco")
      .limit(2000),
    supabase
      .from("revenue_events")
      .select("id,event_type,contact_id,occurred_at")
      .eq("brand_id", "zeneco")
      .eq("source_system", "corporate_homes")
      .in("event_type", ["viewing_completed", "offer_made"])
      .order("occurred_at", { ascending: false })
      .limit(2000),
  ]);

  if (prospectsError) {
    return NextResponse.json({ error: prospectsError.message }, { status: 500 });
  }

  const rows = prospects || [];
  const statusOf = (row: any) => String(row.status || "DISCOVERED").toUpperCase();
  const contacted = rows.filter((row: any) =>
    ["CONTACTED", "ENGAGED", "MEETING", "OPPORTUNITY"].includes(statusOf(row)),
  ).length;
  const meetings = rows.filter((row: any) =>
    ["MEETING", "OPPORTUNITY"].includes(statusOf(row)),
  ).length;
  const opportunities = rows.filter((row: any) => statusOf(row) === "OPPORTUNITY").length;

  const events = revenueEvents || [];
  const viewingCompanies = new Set(
    events
      .filter((event: any) => event.event_type === "viewing_completed" && event.contact_id)
      .map((event: any) => String(event.contact_id)),
  ).size;
  const offerCompanies = new Set(
    events
      .filter((event: any) => event.event_type === "offer_made" && event.contact_id)
      .map((event: any) => String(event.contact_id)),
  ).size;

  const review = buildCorporateGrowthReview({
    totalProspects: rows.length,
    contacted,
    meetings,
    opportunities,
    viewingCompanies,
    offerCompanies,
    revenueEventsReady: !revenueEventsError,
  });
  const previousReviews = (recentReviews || [])
    .map((row: any) => row?.details && typeof row.details === "object" ? row.details.review : null)
    .filter(Boolean);
  const comparison = compareCorporateGrowthReview(review, previousReviews);

  const status = review.status === "READY" ? "success" : "partial";
  const { error: insertError } = await supabase.from("automation_logs").insert({
    action: ACTION,
    agent_name: "Corporate Growth Review",
    status,
    details: {
      review,
      comparison,
      source_of_truth: {
        prospects: "corporate_prospects",
        commercial_outcomes: "revenue_events",
      },
      recorded_at: new Date().toISOString(),
      published: false,
      automatic_budget_changes: false,
      automatic_outreach: false,
      inferred_outcomes: false,
    },
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    status,
    review,
    comparison,
    published: false,
    automaticBudgetChanges: false,
    automaticOutreach: false,
  });
}
