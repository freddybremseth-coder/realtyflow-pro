export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  normalizeTrackedPath,
  propertyContentEvidenceLevel,
  propertyContentLearningNote,
} from "@/lib/content/property-content-learning";

export const maxDuration = 120;

const BRAND_ID = "zeneco";
const ACTION = "property_content_learning_snapshot";
const WINDOW_DAYS = 30;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function asTime(value: unknown) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : 0;
}

function articlePath(destinationPath: unknown, slug: unknown) {
  const base = normalizeTrackedPath(destinationPath || "/magasin") || "/magasin";
  const cleanSlug = String(slug ?? "").trim().replace(/^\/+|\/+$/g, "");
  return cleanSlug ? normalizeTrackedPath(base + "/" + cleanSlug) : base;
}

function pagePathFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const record = metadata as Record<string, unknown>;
  return normalizeTrackedPath(record.page_url || record.pageUrl || "");
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
    const { data: opportunities, error: opportunityError } = await supabase
      .from("property_content_opportunities")
      .select("id,opportunity_type,draft_id")
      .eq("brand_id", BRAND_ID)
      .eq("status", "drafted")
      .not("draft_id", "is", null)
      .limit(120);
    if (opportunityError) throw opportunityError;

    const opportunityRows = (opportunities || []).filter((row: any) => row?.id && row?.draft_id);
    if (!opportunityRows.length) {
      await logRun(supabase, "success", {
        stage: "complete",
        observed: 0,
        reason: "NO_PUBLISHED_NEXUS_DRAFTS",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, observed: 0, reason: "NO_PUBLISHED_NEXUS_DRAFTS" });
    }

    const draftIds = opportunityRows.map((row: any) => String(row.draft_id));
    const { data: drafts, error: draftError } = await supabase
      .schema("core")
      .from("brand_workspace_content_drafts")
      .select("id,title,slug,destination_path,published_at,source_publication_id")
      .in("id", draftIds)
      .not("published_at", "is", null);
    if (draftError) throw draftError;

    const publishedDrafts = (drafts || []).filter((row: any) => row?.id && row?.published_at && row?.slug);
    if (!publishedDrafts.length) {
      await logRun(supabase, "success", {
        stage: "complete",
        observed: 0,
        reason: "NEXUS_DRAFTS_NOT_PUBLISHED",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, observed: 0, reason: "NEXUS_DRAFTS_NOT_PUBLISHED" });
    }

    const opportunityByDraft = new Map(
      opportunityRows.map((row: any) => [String(row.draft_id), row] as const),
    );
    const items = publishedDrafts
      .map((draft: any) => {
        const opportunity = opportunityByDraft.get(String(draft.id));
        if (!opportunity) return null;
        const publishedAtMs = asTime(draft.published_at);
        if (!publishedAtMs) return null;
        const ageDays = Math.max(0, Math.floor((Date.now() - publishedAtMs) / 86_400_000));
        const windowDays = Math.max(1, Math.min(WINDOW_DAYS, ageDays + 1));
        const windowStartMs = Math.max(publishedAtMs, Date.now() - windowDays * 86_400_000);
        return {
          opportunityId: String(opportunity.id),
          opportunityType: String(opportunity.opportunity_type || "unknown"),
          title: String(draft.title || ""),
          path: articlePath(draft.destination_path, draft.slug),
          publicationId: draft.source_publication_id ? String(draft.source_publication_id) : null,
          ageDays,
          windowDays,
          windowStartMs,
          publishedAt: String(draft.published_at),
        };
      })
      .filter(Boolean) as Array<{
        opportunityId: string;
        opportunityType: string;
        title: string;
        path: string;
        publicationId: string | null;
        ageDays: number;
        windowDays: number;
        windowStartMs: number;
        publishedAt: string;
      }>;

    if (!items.length) {
      return NextResponse.json({ success: true, observed: 0, reason: "NO_VALID_PUBLISHED_ITEMS" });
    }

    const earliestMs = Math.min(...items.map(item => item.windowStartMs));
    const earliestIso = new Date(earliestMs).toISOString();
    const paths = Array.from(new Set(items.map(item => item.path)));
    const publicationIds = Array.from(new Set(items.map(item => item.publicationId).filter(Boolean))) as string[];

    const searchResult = await supabase
      .from("search_discovery_events")
      .select("path,occurred_at,source")
      .eq("brand_id", BRAND_ID)
      .in("path", paths)
      .gte("occurred_at", earliestIso);
    if (searchResult.error) throw searchResult.error;

    const revenueResult = await supabase
      .from("revenue_events")
      .select("occurred_at,metadata")
      .eq("brand_id", BRAND_ID)
      .eq("event_type", "lead_created")
      .gte("occurred_at", earliestIso);
    if (revenueResult.error) throw revenueResult.error;

    const touchpointResult = await supabase
      .from("marketing_touchpoints")
      .select("id,content_id,publication_id,contact_id,touch_type,occurred_at,metadata")
      .eq("brand_id", BRAND_ID)
      .gte("occurred_at", earliestIso);
    if (touchpointResult.error) throw touchpointResult.error;

    let publicationRows: any[] = [];
    if (publicationIds.length) {
      const publicationResult = await supabase
        .from("content_publications")
        .select("id,total_views")
        .in("id", publicationIds);
      if (publicationResult.error) throw publicationResult.error;
      publicationRows = publicationResult.data || [];
    }

    const publicationViews = new Map(
      publicationRows.map((row: any) => [
        String(row.id),
        Math.max(0, Number(row.total_views || 0)),
      ]),
    );

    const today = new Date().toISOString().slice(0, 10);
    const snapshots = items.map(item => {
      const searchArrivals = (searchResult.data || []).filter((event: any) =>
        normalizeTrackedPath(event.path) === item.path && asTime(event.occurred_at) >= item.windowStartMs,
      ).length;

      const directTouches = (touchpointResult.data || []).filter((event: any) => {
        if (asTime(event.occurred_at) < item.windowStartMs) return false;
        const publicationMatch = item.publicationId && (
          String(event.publication_id || "") === item.publicationId ||
          String(event.content_id || "") === item.publicationId
        );
        const pathMatch = pagePathFromMetadata(event.metadata) === item.path;
        return Boolean(publicationMatch || pathMatch);
      });

      const pathLeads = (revenueResult.data || []).filter((event: any) =>
        asTime(event.occurred_at) >= item.windowStartMs &&
        pagePathFromMetadata(event.metadata) === item.path,
      ).length;
      const touchpointLeads = directTouches.filter((event: any) => Boolean(event.contact_id)).length;
      const leadTouchpoints = Math.max(pathLeads, touchpointLeads);
      const views = item.publicationId ? (publicationViews.get(item.publicationId) || 0) : 0;
      const evidenceLevel = propertyContentEvidenceLevel({
        searchArrivals,
        touchpoints: directTouches.length,
        leadTouchpoints,
        publicationViews: views,
      });

      return {
        opportunity_id: item.opportunityId,
        brand_id: BRAND_ID,
        publication_id: item.publicationId,
        opportunity_type: item.opportunityType,
        article_title: item.title,
        article_path: item.path,
        window_days: item.windowDays,
        age_days: item.ageDays,
        search_arrivals: searchArrivals,
        touchpoints: directTouches.length,
        lead_touchpoints: leadTouchpoints,
        publication_views: views,
        evidence_level: evidenceLevel,
        learning_note: propertyContentLearningNote(evidenceLevel),
        evidence: {
          published_at: item.publishedAt,
          window_start: new Date(item.windowStartMs).toISOString(),
          sources: {
            search_discovery_events: searchArrivals,
            marketing_touchpoints: directTouches.length,
            exact_page_leads: pathLeads,
            direct_publication_leads: touchpointLeads,
            content_publication_views: views,
          },
          attribution_policy: "exact_path_or_publication_only",
          scoring_effect: "none_observe_only",
        },
        observed_on: today,
        observed_at: new Date().toISOString(),
      };
    });

    const { error: snapshotError } = await supabase
      .from("property_content_learning_snapshots")
      .upsert(snapshots, { onConflict: "opportunity_id,observed_on" });
    if (snapshotError) throw snapshotError;

    const evidenceLevels = snapshots.reduce((acc: Record<string, number>, row: any) => {
      acc[row.evidence_level] = (acc[row.evidence_level] || 0) + 1;
      return acc;
    }, {});

    await logRun(supabase, "success", {
      stage: "complete",
      observed: snapshots.length,
      evidence_levels: evidenceLevels,
      attribution_policy: "exact_path_or_publication_only",
      scoring_effect: "none_observe_only",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      observed: snapshots.length,
      evidenceLevels,
      scoringEffect: "none_observe_only",
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await logRun(supabase, "error", {
      stage: "error",
      error,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    return NextResponse.json({ error }, { status: 500 });
  }
}
