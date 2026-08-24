/**
 * Marketing Growth OS — canonical channel metrics sync.
 *
 * Bridges LIVE Growth OS publications to observed channel metrics:
 *   marketing_publications + marketing_publish_attempts
 *     -> Instagram Insights
 *     -> marketing_content (genome backfill)
 *     -> ONE canonical metrics_snapshot per content/channel
 *     -> Learning Engine (only after enough distinct observations)
 *
 * Important: Instagram media insights are cumulative. We replace the previous
 * metrics_snapshot for a content/channel instead of summing daily snapshots.
 */
import { fetchInstagramMediaEngagement } from "@/services/integrations/instagram-insights";
import { makeMarketingStore, type MarketingSupabaseLike } from "@/services/marketing/adapters";
import { refreshLearningRules } from "@/services/marketing/learning-adapter";
import type { ContentGenome } from "@/lib/marketing/genome";
import type { ContentMetrics } from "@/lib/marketing/value-score";

export interface GrowthMetricsSyncOptions {
  brandId?: string;
  days?: number;
  limit?: number;
  accessToken?: string;
  /** Do not derive learning rules before this many distinct measured posts. */
  learningMinObservations?: number;
}

export interface GrowthMetricsSyncResult {
  brandId: string | null;
  candidates: number;
  synced: number;
  skipped: number;
  failed: number;
  observations: number;
  learningRefreshed: boolean;
  rulesWritten: number;
  failures: Array<{ publicationId: string; reason: string }>;
}

function propertyIdFromSource(sourceId: unknown): string | null {
  const value = String(sourceId ?? "");
  return value.startsWith("property:") ? value.slice("property:".length) : null;
}

async function latestAssetGenome(
  supabase: MarketingSupabaseLike,
  contentId: string,
): Promise<ContentGenome | null> {
  const { data } = await supabase
    .from("marketing_assets")
    .select("genome, updated_at")
    .eq("content_id", contentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.genome ?? null) as ContentGenome | null;
}

async function externalMediaId(
  supabase: MarketingSupabaseLike,
  publicationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("marketing_publish_attempts")
    .select("external_media_id, external_id, status, updated_at")
    .eq("publication_id", publicationId)
    .eq("status", "posted")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const value = data?.external_media_id ?? data?.external_id;
  return value ? String(value) : null;
}

async function replaceCanonicalSnapshot(
  supabase: MarketingSupabaseLike,
  input: {
    brandId: string;
    contentId: string;
    correlationId: string | null;
    genome: ContentGenome;
    publicationId: string;
    externalMediaId: string;
    sourceId: string | null;
    metrics: ContentMetrics;
    raw: Record<string, unknown>;
    observed: Record<string, number>;
  },
) {
  // Cumulative insights: remove ONLY the previous canonical snapshot for this
  // content/channel. Never delete click/lead/attribution events.
  const { error: deleteError } = await supabase
    .from("marketing_events")
    .delete()
    .eq("event_type", "metrics_snapshot")
    .eq("brand_id", input.brandId)
    .eq("content_id", input.contentId)
    .eq("channel", "instagram");
  if (deleteError) throw new Error(`metrics snapshot delete failed: ${deleteError.message}`);

  const store = makeMarketingStore(supabase);
  await store.recordEvent({
    eventType: "metrics_snapshot",
    brandId: input.brandId,
    contentId: input.contentId,
    channel: "instagram",
    genome: input.genome,
    metrics: input.metrics,
    correlationId: input.correlationId,
    occurredAt: new Date(),
    metadata: {
      source: "instagram_insights",
      snapshot_mode: "canonical_cumulative_replace",
      publication_id: input.publicationId,
      external_media_id: input.externalMediaId,
      source_id: input.sourceId,
      property_id: propertyIdFromSource(input.sourceId),
      observed: input.observed,
      raw: input.raw,
    },
  });
}

export async function syncGrowthInstagramMetrics(
  supabase: MarketingSupabaseLike,
  options: GrowthMetricsSyncOptions = {},
): Promise<GrowthMetricsSyncResult> {
  const brandId = options.brandId?.trim() || null;
  const accessToken = options.accessToken || process.env.META_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MARKETING_METRICS_TOKEN_MISSING: META_ACCESS_TOKEN mangler");

  const days = Math.max(1, Math.min(options.days ?? 30, 90));
  const limit = Math.max(1, Math.min(options.limit ?? 100, 250));
  const learningMin = Math.max(5, options.learningMinObservations ?? 10);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = supabase
    .from("marketing_publications")
    .select("publication_id, content_id, brand_id, channel, state, source_id, correlation_id, updated_at")
    .eq("state", "published")
    .eq("channel", "instagram")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (brandId) query = query.eq("brand_id", brandId);
  const { data: publications, error } = await query;
  if (error) throw new Error(`GROWTH_METRICS_PUBLICATION_LOOKUP_FAILED: ${error.message}`);

  const result: GrowthMetricsSyncResult = {
    brandId,
    candidates: publications?.length ?? 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    observations: 0,
    learningRefreshed: false,
    rulesWritten: 0,
    failures: [],
  };
  const store = makeMarketingStore(supabase);

  for (const pub of publications ?? []) {
    const publicationId = String(pub.publication_id ?? "");
    const contentId = String(pub.content_id ?? "");
    const currentBrand = String(pub.brand_id ?? "");
    if (!publicationId || !contentId || !currentBrand) {
      result.skipped++;
      continue;
    }

    try {
      const [mediaId, genome] = await Promise.all([
        externalMediaId(supabase, publicationId),
        latestAssetGenome(supabase, contentId),
      ]);
      if (!mediaId || !genome) {
        result.skipped++;
        continue;
      }

      // Backfill the canonical genome table used by Learning Engine.
      await store.upsertContent(contentId, currentBrand, genome);

      const engagement = await fetchInstagramMediaEngagement(mediaId, accessToken);
      // Only map metrics with the same semantic meaning as ContentMetrics.
      // Reach/likes/comments/totalInteractions remain metadata until the value
      // model has explicit dimensions for them. Never pretend reach = views.
      const metrics: ContentMetrics = {
        views: engagement.views,
        saves: engagement.saves,
        shares: engagement.shares,
      };
      await replaceCanonicalSnapshot(supabase, {
        brandId: currentBrand,
        contentId,
        correlationId: pub.correlation_id ? String(pub.correlation_id) : null,
        genome,
        publicationId,
        externalMediaId: mediaId,
        sourceId: pub.source_id ? String(pub.source_id) : null,
        metrics,
        raw: engagement.raw,
        observed: {
          views: engagement.views,
          reach: engagement.reach,
          likes: engagement.likes,
          comments: engagement.comments,
          shares: engagement.shares,
          saves: engagement.saves,
          totalInteractions: engagement.totalInteractions,
        },
      });
      result.synced++;
    } catch (err) {
      result.failed++;
      result.failures.push({
        publicationId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Count distinct canonical observations after replacement. Learning stays off
  // until the pilot has enough measured posts to avoid optimizing on noise.
  let observationQuery = supabase
    .from("marketing_events")
    .select("content_id")
    .eq("event_type", "metrics_snapshot")
    .eq("channel", "instagram");
  if (brandId) observationQuery = observationQuery.eq("brand_id", brandId);
  const { data: observationRows } = await observationQuery;
  result.observations = new Set(
    (observationRows ?? []).map((row: any) => String(row.content_id ?? "")).filter(Boolean),
  ).size;

  if (result.observations >= learningMin) {
    // During pilot, refresh per brand only. If no explicit brand is supplied,
    // do not create global cross-brand rules accidentally.
    const learningBrand = brandId;
    if (learningBrand) {
      const refreshed = await refreshLearningRules(supabase, { brandId: learningBrand, scope: learningBrand });
      result.learningRefreshed = true;
      result.rulesWritten = refreshed.rulesWritten;
    }
  }

  return result;
}
