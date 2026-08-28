import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionScore(action: any) {
  const priority = Math.max(0, Math.min(10, n(action.priority)));
  const typeWeight: Record<string, number> = {
    email_campaign: 22,
    lead_magnet: 20,
    collaboration: 16,
    seo_content: 14,
    social_post: 12,
    viral_content: 11,
    engagement: 9,
    ab_test: 8,
  };
  const readyBonus = action.status === "ready" ? 12 : 0;
  const ageDays = Math.max(0, (Date.now() - new Date(action.created_at || 0).getTime()) / 86_400_000);
  const freshness = Math.max(0, 8 - Math.min(8, ageDays));
  return Math.round(priority * 10 + (typeWeight[action.action_type] ?? 6) + readyBonus + freshness);
}

function normalizeAction(row: any) {
  return {
    ...row,
    brand_id: row.brand,
    metrics: {
      impressions: n(row.impressions),
      views: n(row.impressions),
      clicks: n(row.clicks),
      conversions: n(row.conversions),
      engagement_rate: n(row.engagement_rate),
      shares: n(row.shares),
      leads_generated: n(row.leads_generated),
    },
    score: actionScore(row),
  };
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { success: false });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 500 });

  const url = new URL(request.url);
  const brand = url.searchParams.get("brand");
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  try {
    let actionQuery = supabase
      .from("growth_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (brand && brand !== "all") actionQuery = actionQuery.eq("brand", brand);

    const [actionsRes, socialRes, leadsWeekRes, leadsMonthRes, cyclesRes] = await Promise.all([
      actionQuery,
      supabase.from("social_post_metrics").select("impressions,reach,reactions,comments,shares,saves,clicks,profile_views,followers_gained,messages,leads,meetings,sales,recorded_at").gte("recorded_at", monthAgo),
      supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
      supabase.from("growth_cycles").select("id", { count: "exact", head: true }),
    ]);

    if (actionsRes.error) throw actionsRes.error;
    const actions = (actionsRes.data ?? []).map(normalizeAction);
    const social = socialRes.data ?? [];

    const totals = social.reduce((acc: Record<string, number>, row: any) => {
      for (const key of ["impressions", "reach", "reactions", "comments", "shares", "saves", "clicks", "profile_views", "followers_gained", "messages", "leads", "meetings", "sales"]) {
        acc[key] = (acc[key] ?? 0) + n(row[key]);
      }
      return acc;
    }, {});

    const resultTracked = actions.filter((a: any) => a.metrics.impressions + a.metrics.clicks + a.metrics.conversions + a.metrics.leads_generated > 0).length;
    const pending = actions.filter((a: any) => ["planned", "ready"].includes(a.status));
    const publishedWithoutResults = actions.filter((a: any) => a.status === "published" && a.metrics.impressions + a.metrics.clicks + a.metrics.conversions + a.metrics.leads_generated === 0);
    const nextBest = [...pending].sort((a: any, b: any) => b.score - a.score).slice(0, 5);

    const conversionBase = totals.clicks || totals.reach || totals.impressions || 0;
    const leadRate = conversionBase > 0 ? ((totals.leads || 0) / conversionBase) * 100 : 0;
    const salesRate = (totals.leads || 0) > 0 ? ((totals.sales || 0) / totals.leads) * 100 : 0;

    return NextResponse.json({
      success: true,
      generatedAt: now.toISOString(),
      actions,
      nextBest,
      performance: {
        impressions: totals.impressions || 0,
        reach: totals.reach || 0,
        clicks: totals.clicks || 0,
        followersGained: totals.followers_gained || 0,
        messages: totals.messages || 0,
        leads: totals.leads || 0,
        meetings: totals.meetings || 0,
        sales: totals.sales || 0,
        leadRate: Number(leadRate.toFixed(2)),
        salesRate: Number(salesRate.toFixed(2)),
      },
      pipeline: {
        activeActions: pending.length,
        publishedAwaitingResults: publishedWithoutResults.length,
        trackedActions: resultTracked,
        contactsThisWeek: leadsWeekRes.count || 0,
        contactsLast30Days: leadsMonthRes.count || 0,
        cyclesRun: cyclesRes.count || 0,
      },
      warnings: [
        ...(publishedWithoutResults.length ? [`${publishedWithoutResults.length} publiserte veksthandlinger mangler resultatmåling.`] : []),
        ...(social.length === 0 ? ["Ingen Social Intelligence-resultater er registrert siste 30 dager."] : []),
      ],
    });
  } catch (error) {
    console.error("[GrowthCommandCenter]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load growth command center" }, { status: 500 });
  }
}
