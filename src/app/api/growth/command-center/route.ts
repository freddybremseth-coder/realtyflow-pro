import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  calculatePostPerformance,
  type LeadInput,
  type PublicationInput,
  type SnapshotInput,
} from "@/services/social-growth/performance-engine";

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

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractLead(contact: any): LeadInput {
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const metadata = interactions.map((item: any) => item?.metadata || {}).find((item: any) => item.utm_source || item.utm_content) || {};
  const notes = clean(contact.notes);
  const utmLine = notes.match(/UTM:\s*([^/\n]+)\s*\/\s*([^/\n]+)(?:\s*\/\s*([^\n]+))?/i);
  return {
    id: clean(contact.id),
    source: clean(contact.source),
    status: clean(contact.pipeline_status),
    utm_source: clean(metadata.utm_source) || clean(utmLine?.[1]),
    utm_campaign: clean(metadata.utm_campaign) || clean(utmLine?.[2]),
    utm_content: clean(metadata.utm_content) || clean(utmLine?.[3]),
  };
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

function baseMetrics(row: any) {
  return {
    impressions: n(row.impressions),
    views: n(row.impressions),
    clicks: n(row.clicks),
    conversions: n(row.conversions),
    engagement_rate: n(row.engagement_rate),
    shares: n(row.shares),
    leads_generated: n(row.leads_generated),
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
    let actionQuery = supabase.from("growth_actions").select("*").order("created_at", { ascending: false }).limit(100);
    if (brand && brand !== "all") actionQuery = actionQuery.eq("brand", brand);

    const [actionsRes, socialRes, snapshotsRes, publicationsRes, contactsRes, leadsWeekRes, leadsMonthRes, cyclesRes] = await Promise.all([
      actionQuery,
      supabase.from("social_post_metrics").select("impressions,reach,reactions,comments,shares,saves,clicks,profile_views,followers_gained,messages,leads,meetings,sales,recorded_at").gte("recorded_at", monthAgo),
      supabase.from("engagement_snapshots").select("publication_id,platform,likes,comments,shares,saves,reach,impressions,views,clicks,total_interactions,metric_window,raw_data,snapshot_at").gte("snapshot_at", monthAgo).order("snapshot_at", { ascending: false }).limit(2000),
      supabase.from("content_publications").select("id,brand_id,title,description,content_type,tags,status,published_at,created_at,total_views,total_likes,total_comments,total_shares,performance_goal,content_features,tracking_url").order("created_at", { ascending: false }).limit(500),
      supabase.from("contacts").select("id,source,notes,interactions,pipeline_status,created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
      supabase.from("growth_cycles").select("id", { count: "exact", head: true }),
    ]);

    if (actionsRes.error) throw actionsRes.error;
    if (publicationsRes.error) throw publicationsRes.error;

    const publicationRows = publicationsRes.data ?? [];
    const publicationMap = new Map(publicationRows.map((row: any) => [String(row.id), row]));
    const leads = contactsRes.error ? [] : (contactsRes.data ?? []).map(extractLead);
    const snapshots = (snapshotsRes.data ?? []) as SnapshotInput[];
    const performances = calculatePostPerformance(
      publicationRows.filter((row: any) => row.status === "published") as PublicationInput[],
      snapshots,
      leads,
    );
    const performanceMap = new Map(performances.map((row) => [row.id, row]));

    const actions = (actionsRes.data ?? []).map((row: any) => {
      const publicationId = row.content_publication_id ? String(row.content_publication_id) : null;
      const publication = publicationId ? publicationMap.get(publicationId) : null;
      const performance = publicationId ? performanceMap.get(publicationId) : null;
      const manual = baseMetrics(row);
      const audience = performance ? (performance.impressions || performance.reach || performance.views) : 0;
      return {
        ...row,
        brand_id: row.brand,
        publication_status: publication?.status ?? null,
        publication_tracking_url: publication?.tracking_url ?? null,
        publication_published_at: publication?.published_at ?? null,
        attributed_leads: performance?.leads ?? 0,
        performance_score: performance?.score ?? null,
        performance_confidence: performance?.confidence ?? null,
        metrics: {
          ...manual,
          impressions: Math.max(manual.impressions, performance?.impressions ?? 0, performance?.views ?? 0),
          views: Math.max(manual.views, performance?.views ?? 0),
          shares: Math.max(manual.shares, performance?.shares ?? 0),
          leads_generated: Math.max(manual.leads_generated, performance?.leads ?? 0),
          engagement_rate: Math.max(manual.engagement_rate, performance?.engagementRate ? performance.engagementRate * 100 : 0),
        },
        has_automatic_results: audience > 0 || (performance?.leads ?? 0) > 0,
        score: actionScore(row),
      };
    });

    const social = socialRes.data ?? [];
    const socialTotals = social.reduce((acc: Record<string, number>, row: any) => {
      for (const key of ["impressions", "reach", "reactions", "comments", "shares", "saves", "clicks", "profile_views", "followers_gained", "messages", "leads", "meetings", "sales"]) {
        acc[key] = (acc[key] ?? 0) + n(row[key]);
      }
      return acc;
    }, {});

    const latestSnapshot = new Map<string, any>();
    for (const snapshot of snapshotsRes.data ?? []) {
      const publication = publicationMap.get(String(snapshot.publication_id));
      if (!publication || publication.status !== "published") continue;
      if (brand && brand !== "all" && publication.brand_id !== brand) continue;
      const key = `${snapshot.publication_id}:${snapshot.platform}`;
      if (!latestSnapshot.has(key)) latestSnapshot.set(key, snapshot);
    }
    const engagementTotals = Array.from(latestSnapshot.values()).reduce((acc: Record<string, number>, row: any) => {
      acc.impressions = (acc.impressions ?? 0) + Math.max(n(row.impressions), n(row.views));
      acc.reach = (acc.reach ?? 0) + n(row.reach);
      acc.clicks = (acc.clicks ?? 0) + n(row.clicks);
      return acc;
    }, {});

    const attributedLeads = performances
      .filter((post) => !brand || brand === "all" || post.brand === brand)
      .reduce((sum, post) => sum + post.leads, 0);
    const totals = {
      impressions: Math.max(socialTotals.impressions || 0, engagementTotals.impressions || 0),
      reach: Math.max(socialTotals.reach || 0, engagementTotals.reach || 0),
      clicks: Math.max(socialTotals.clicks || 0, engagementTotals.clicks || 0),
      followers_gained: socialTotals.followers_gained || 0,
      messages: socialTotals.messages || 0,
      leads: Math.max(socialTotals.leads || 0, attributedLeads),
      meetings: socialTotals.meetings || 0,
      sales: socialTotals.sales || 0,
    };

    const pending = actions.filter((a: any) => ["planned", "ready"].includes(a.status) && !a.content_publication_id);
    const handedOff = actions.filter((a: any) => !!a.content_publication_id);
    const publishedLinked = handedOff.filter((a: any) => a.publication_status === "published");
    const publishedWithoutResults = publishedLinked.filter((a: any) => !a.has_automatic_results && a.metrics.impressions + a.metrics.clicks + a.metrics.conversions + a.metrics.leads_generated === 0);
    const resultTracked = actions.filter((a: any) => a.has_automatic_results || a.metrics.impressions + a.metrics.clicks + a.metrics.conversions + a.metrics.leads_generated > 0).length;
    const nextBest = [...pending].sort((a: any, b: any) => b.score - a.score).slice(0, 5);

    const conversionBase = totals.clicks || totals.reach || totals.impressions || 0;
    const leadRate = conversionBase > 0 ? (totals.leads / conversionBase) * 100 : 0;
    const salesRate = totals.leads > 0 ? (totals.sales / totals.leads) * 100 : 0;

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
        inContentHub: handedOff.filter((a: any) => a.publication_status !== "published").length,
        publishedLinked: publishedLinked.length,
        publishedAwaitingResults: publishedWithoutResults.length,
        trackedActions: resultTracked,
        attributedLeads,
        contactsThisWeek: leadsWeekRes.count || 0,
        contactsLast30Days: leadsMonthRes.count || 0,
        cyclesRun: cyclesRes.count || 0,
      },
      warnings: [
        ...(publishedWithoutResults.length ? [`${publishedWithoutResults.length} publiserte veksthandlinger mangler fortsatt målbare resultater.`] : []),
        ...(handedOff.some((a: any) => a.publication_status === "draft") ? [`${handedOff.filter((a: any) => a.publication_status === "draft").length} veksthandlinger ligger som utkast i Content Hub.`] : []),
        ...(latestSnapshot.size > 0 && attributedLeads === 0 ? ["SoMe-resultater måles, men ingen leads er ennå attribuert med postens sporingslenke."] : []),
      ],
    });
  } catch (error) {
    console.error("[GrowthCommandCenter]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load growth command center" }, { status: 500 });
  }
}
