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

type ActionMetrics = {
  impressions: number;
  views: number;
  clicks: number;
  conversions: number;
  engagement_rate: number;
  shares: number;
  leads_generated: number;
};

function baseActionScore(action: any) {
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
  return priority * 10 + (typeWeight[action.action_type] ?? 6) + readyBonus + freshness;
}

function metricsFor(row: any, linked?: Partial<ActionMetrics>): ActionMetrics {
  const impressions = Math.max(n(row.impressions), n(linked?.impressions), n(linked?.views));
  const clicks = Math.max(n(row.clicks), n(linked?.clicks));
  const shares = Math.max(n(row.shares), n(linked?.shares));
  return {
    impressions,
    views: impressions,
    clicks,
    conversions: n(row.conversions),
    engagement_rate: Math.max(n(row.engagement_rate), n(linked?.engagement_rate)),
    shares,
    leads_generated: n(row.leads_generated),
  };
}

function actionHistoryKey(action: any) {
  return [action.brand || action.brand_id || "", action.action_type || "", action.platform || ""].join("|");
}

function outcomeBonus(metrics: ActionMetrics) {
  const engagement = metrics.engagement_rate > 1 ? metrics.engagement_rate / 100 : metrics.engagement_rate;
  const raw =
    Math.min(28, metrics.leads_generated * 14) +
    Math.min(24, metrics.conversions * 10) +
    Math.min(18, Math.log1p(metrics.clicks) * 3.2) +
    Math.min(8, Math.log1p(metrics.impressions) * 0.7) +
    Math.min(12, engagement * 100 * 0.8);
  return Math.min(45, raw);
}

function growthActionIdFromTags(tags: unknown) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const value = String(tag || "");
    if (value.startsWith("growth-action:")) return value.slice("growth-action:".length) || null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { success: false });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 500 });

  const url = new URL(request.url);
  const brand = url.searchParams.get("brand");
  const scopedBrand = brand && brand !== "all" ? brand : null;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  try {
    let actionQuery = supabase.from("growth_actions").select("*").order("created_at", { ascending: false }).limit(100);
    if (scopedBrand) actionQuery = actionQuery.eq("brand", scopedBrand);

    let publicationQuery = supabase
      .from("content_publications")
      .select("id,brand_id,published_at,tags")
      .gte("published_at", monthAgo);
    if (scopedBrand) publicationQuery = publicationQuery.eq("brand_id", scopedBrand);

    const [actionsRes, socialRes, snapshotsRes, publicationsRes, leadsWeekRes, leadsMonthRes, cyclesRes] = await Promise.all([
      actionQuery,
      supabase.from("social_post_metrics").select("impressions,reach,reactions,comments,shares,saves,clicks,profile_views,followers_gained,messages,leads,meetings,sales,recorded_at").gte("recorded_at", monthAgo),
      supabase.from("engagement_snapshots").select("publication_id,platform,likes,comments,shares,saves,reach,impressions,views,clicks,snapshot_at").gte("snapshot_at", monthAgo).order("snapshot_at", { ascending: false }).limit(1000),
      publicationQuery,
      supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
      supabase.from("growth_cycles").select("id", { count: "exact", head: true }),
    ]);

    if (actionsRes.error) throw actionsRes.error;
    const publications = new Map((publicationsRes.data ?? []).map((row: any) => [String(row.id), row]));

    // Engagement snapshots are cumulative snapshots, so use only the newest row per publication/platform.
    const latestSnapshot = new Map<string, any>();
    for (const snapshot of snapshotsRes.data ?? []) {
      const publication = publications.get(String(snapshot.publication_id));
      if (!publication) continue;
      const key = `${snapshot.publication_id}:${snapshot.platform}`;
      if (!latestSnapshot.has(key)) latestSnapshot.set(key, snapshot);
    }

    const engagementTotals = Array.from(latestSnapshot.values()).reduce((acc: Record<string, number>, row: any) => {
      acc.impressions = (acc.impressions ?? 0) + Math.max(n(row.impressions), n(row.views));
      acc.reach = (acc.reach ?? 0) + n(row.reach);
      acc.clicks = (acc.clicks ?? 0) + n(row.clicks);
      acc.reactions = (acc.reactions ?? 0) + n(row.likes);
      acc.comments = (acc.comments ?? 0) + n(row.comments);
      acc.shares = (acc.shares ?? 0) + n(row.shares);
      acc.saves = (acc.saves ?? 0) + n(row.saves);
      return acc;
    }, {});

    // Stable publication -> Growth Action attribution via growth-action:<uuid> tags.
    const linkedMetrics = new Map<string, ActionMetrics>();
    for (const snapshot of latestSnapshot.values()) {
      const publication = publications.get(String(snapshot.publication_id));
      const growthActionId = growthActionIdFromTags(publication?.tags);
      if (!growthActionId) continue;
      const current = linkedMetrics.get(growthActionId) ?? {
        impressions: 0,
        views: 0,
        clicks: 0,
        conversions: 0,
        engagement_rate: 0,
        shares: 0,
        leads_generated: 0,
      };
      const impressions = Math.max(n(snapshot.impressions), n(snapshot.views));
      const interactions = n(snapshot.likes) + n(snapshot.comments) + n(snapshot.shares) + n(snapshot.saves);
      current.impressions += impressions;
      current.views = current.impressions;
      current.clicks += n(snapshot.clicks);
      current.shares += n(snapshot.shares);
      const denominator = n(snapshot.reach) || impressions;
      if (denominator > 0) current.engagement_rate = Math.max(current.engagement_rate, interactions / denominator);
      linkedMetrics.set(growthActionId, current);
    }

    const actions = (actionsRes.data ?? []).map((row: any) => ({
      ...row,
      brand_id: row.brand,
      metrics: metricsFor(row, linkedMetrics.get(String(row.id))),
      attributedFromPublication: linkedMetrics.has(String(row.id)),
    }));

    // Learn from prior observed outcomes for the same brand + action type + platform.
    const history = new Map<string, number[]>();
    for (const action of actions) {
      const metrics = action.metrics as ActionMetrics;
      if (metrics.impressions + metrics.clicks + metrics.conversions + metrics.leads_generated <= 0) continue;
      const key = actionHistoryKey(action);
      const values = history.get(key) ?? [];
      values.push(outcomeBonus(metrics));
      history.set(key, values);
    }

    for (const action of actions) {
      const prior = history.get(actionHistoryKey(action)) ?? [];
      const learnedBonus = prior.length ? prior.reduce((sum, value) => sum + value, 0) / prior.length : 0;
      action.score = Math.round(baseActionScore(action) + learnedBonus);
      action.learnedOutcomeBonus = Math.round(learnedBonus);
    }

    // social_post_metrics currently lacks a guaranteed brand scope in this endpoint.
    // Use it only for all-brand totals; scoped brand views use publication-linked snapshots
    // to avoid presenting cross-brand metrics as if they belonged to one brand.
    const social = scopedBrand ? [] : (socialRes.data ?? []);
    const socialTotals = social.reduce((acc: Record<string, number>, row: any) => {
      for (const key of ["impressions", "reach", "reactions", "comments", "shares", "saves", "clicks", "profile_views", "followers_gained", "messages", "leads", "meetings", "sales"]) {
        acc[key] = (acc[key] ?? 0) + n(row[key]);
      }
      return acc;
    }, {});

    const totals = {
      impressions: Math.max(socialTotals.impressions || 0, engagementTotals.impressions || 0),
      reach: Math.max(socialTotals.reach || 0, engagementTotals.reach || 0),
      clicks: Math.max(socialTotals.clicks || 0, engagementTotals.clicks || 0),
      followers_gained: socialTotals.followers_gained || 0,
      messages: socialTotals.messages || 0,
      leads: socialTotals.leads || 0,
      meetings: socialTotals.meetings || 0,
      sales: socialTotals.sales || 0,
    };

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
        impressions: totals.impressions,
        reach: totals.reach,
        clicks: totals.clicks,
        followersGained: totals.followers_gained,
        messages: totals.messages,
        leads: totals.leads,
        meetings: totals.meetings,
        sales: totals.sales,
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
      attribution: {
        linkedGrowthActions: linkedMetrics.size,
        linkedPublicationPlatforms: Array.from(latestSnapshot.values()).filter((snapshot: any) => {
          const publication = publications.get(String(snapshot.publication_id));
          return Boolean(growthActionIdFromTags(publication?.tags));
        }).length,
        learnedKeys: history.size,
      },
      warnings: [
        ...(publishedWithoutResults.length ? [`${publishedWithoutResults.length} publiserte veksthandlinger mangler resultatmåling.`] : []),
        ...(social.length === 0 && latestSnapshot.size === 0 ? ["Ingen automatiske SoMe-resultater er registrert siste 30 dager."] : []),
        ...(!scopedBrand && social.length === 0 && latestSnapshot.size > 0 ? ["Rekkevidde/engasjement hentes automatisk, men leads, møter og salg mangler fortsatt attribusjon."] : []),
        ...(scopedBrand ? ["Brand-visning bruker kun brand-sikre publiseringsdata for rekkevidde/klikk; globale Social Intelligence-tall blandes ikke inn."] : []),
      ],
    });
  } catch (error) {
    console.error("[GrowthCommandCenter]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load growth command center" }, { status: 500 });
  }
}
