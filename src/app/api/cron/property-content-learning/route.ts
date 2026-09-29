export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  articlePathFromTags,
  assessEditorialLearning,
  nexusAngleFromTags,
  nexusOpportunityIdFromTags,
} from "@/lib/content/property-editorial-learning";

export const maxDuration = 120;
const BRAND_ID = "zeneco";
const ACTION = "property_content_learning_observe";
const MAX_PUBLICATIONS = 80;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function daysBetween(from: string, until = Date.now()) {
  const start = new Date(from).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((until - start) / 86_400_000));
}

function boundedWindowStart(publishedAt: string) {
  const published = new Date(publishedAt).getTime();
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  return new Date(Math.max(Number.isFinite(published) ? published : Date.now(), thirtyDaysAgo)).toISOString();
}

async function logRun(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  const { error } = await supabase.from("automation_logs").insert({
    action: ACTION,
    agent_name: "nexus_editorial_learning_observer",
    status,
    details: { path: "/api/cron/property-content-learning", ...details },
  });
  if (error) console.error("[property-content-learning] log error", error.message);
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/property-content-learning");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const startedAt = new Date().toISOString();

  try {
    const { data: publications, error: publicationError } = await supabase
      .from("content_publications")
      .select("id,title,tags,total_views,published_at,created_at")
      .eq("brand_id", BRAND_ID)
      .eq("status", "published")
      .contains("tags", ["nexus-editorial-signal"])
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(MAX_PUBLICATIONS);

    if (publicationError) throw publicationError;

    const observed: Array<{
      opportunityId: string;
      title: string;
      angle: string;
      path: string;
      evidenceLevel: string;
      searchArrivals: number;
      leadTouchpoints: number;
    }> = [];

    for (const publication of publications || []) {
      const opportunityId = nexusOpportunityIdFromTags(publication.tags);
      const angle = nexusAngleFromTags(publication.tags);
      const path = articlePathFromTags(publication.tags);
      const publishedAt = String(publication.published_at || publication.created_at || "");
      if (!opportunityId || !angle || !path || !publishedAt) continue;

      const { data: opportunity, error: opportunityError } = await supabase
        .from("property_content_opportunities")
        .select("id,opportunity_type")
        .eq("id", opportunityId)
        .eq("brand_id", BRAND_ID)
        .maybeSingle();
      if (opportunityError || !opportunity) continue;

      const since = boundedWindowStart(publishedAt);
      const ageDays = daysBetween(publishedAt);
      const windowDays = Math.max(1, Math.min(30, ageDays || 1));

      const { count: searchArrivals, error: searchError } = await supabase
        .from("search_discovery_events")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", BRAND_ID)
        .eq("path", path)
        .gte("occurred_at", since);
      if (searchError) throw searchError;

      const { data: touchRows, error: touchError } = await supabase
        .from("marketing_touchpoints")
        .select("touch_type")
        .eq("brand_id", BRAND_ID)
        .eq("publication_id", String(publication.id))
        .gte("occurred_at", since);
      if (touchError) throw touchError;

      const touchpoints = touchRows?.length || 0;
      const leadTouchpoints = (touchRows || []).filter((row) => row.touch_type === "lead_created").length;
      const assessment = assessEditorialLearning({
        ageDays,
        searchArrivals: searchArrivals || 0,
        touchpoints,
        leadTouchpoints,
        publicationViews: Number(publication.total_views || 0),
      });

      const snapshot = {
        opportunity_id: opportunityId,
        brand_id: BRAND_ID,
        publication_id: publication.id,
        opportunity_type: String(opportunity.opportunity_type || angle),
        article_path: path,
        window_days: windowDays,
        age_days: assessment.ageDays,
        search_arrivals: assessment.searchArrivals,
        touchpoints: assessment.touchpoints,
        lead_touchpoints: assessment.leadTouchpoints,
        publication_views: assessment.publicationViews,
        evidence_level: assessment.evidenceLevel,
        learning_note: assessment.note,
        evidence: {
          source_of_truth: {
            discovery: "search_discovery_events",
            attribution: "marketing_touchpoints",
            publication: "content_publications",
          },
          publication_title: publication.title || null,
          window_start: since,
          published_at: publishedAt,
          deterministic_only: true,
          automatic_strategy_change: false,
        },
        observed_on: new Date().toISOString().slice(0, 10),
        observed_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("property_content_learning_snapshots")
        .upsert(snapshot, { onConflict: "opportunity_id,observed_on" });
      if (upsertError) throw upsertError;

      observed.push({
        opportunityId,
        title: String(publication.title || ""),
        angle: String(opportunity.opportunity_type || angle),
        path,
        evidenceLevel: assessment.evidenceLevel,
        searchArrivals: assessment.searchArrivals,
        leadTouchpoints: assessment.leadTouchpoints,
      });
    }

    const byAngle = observed.reduce<Record<string, { articles: number; emerging: number; measured: number; searchArrivals: number; leads: number }>>(
      (acc, item) => {
        const bucket = acc[item.angle] || { articles: 0, emerging: 0, measured: 0, searchArrivals: 0, leads: 0 };
        bucket.articles += 1;
        if (item.evidenceLevel === "emerging") bucket.emerging += 1;
        if (item.evidenceLevel === "measured") bucket.measured += 1;
        bucket.searchArrivals += item.searchArrivals;
        bucket.leads += item.leadTouchpoints;
        acc[item.angle] = bucket;
        return acc;
      },
      {},
    );

    await logRun(supabase, "success", {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      publications_found: publications?.length || 0,
      observed: observed.length,
      by_angle: byAngle,
      strategy_changed: false,
    });

    return NextResponse.json({
      success: true,
      observed: observed.length,
      byAngle,
      strategyChanged: false,
      evidence: observed.slice(0, 12),
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await logRun(supabase, "error", {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      error,
    });
    return NextResponse.json({ error }, { status: 500 });
  }
}
