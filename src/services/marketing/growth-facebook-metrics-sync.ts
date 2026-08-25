/**
 * Marketing Growth OS — canonical Facebook metrics sync.
 *
 * Reads only Growth OS publications, uses the brand's connected Facebook token,
 * waits for maturity, writes one canonical cumulative metrics_snapshot per
 * content/channel, applies the same historical asset quarantine used by the
 * Instagram pilot, and refreshes learning only after enough eligible posts.
 *
 * This service is intentionally NOT scheduled yet. It becomes schedulable only
 * after the first controlled Facebook pilot publication exists.
 */
import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";
import { deriveSpecificLocationFromTitle, isBroadInventoryRegion } from "@/services/marketing/inventory-property-adapter";
import { makeMarketingStore, type MarketingSupabaseLike } from "@/services/marketing/adapters";
import { refreshLearningRules } from "@/services/marketing/learning-adapter";
import { extractPublishedTags, historicalAssetLearningQuality } from "@/services/marketing/growth-metrics-sync";
import { fetchFacebookPostEngagement } from "@/services/integrations/facebook-insights";
import type { ContentGenome } from "@/lib/marketing/genome";
import type { ContentMetrics } from "@/lib/marketing/value-score";

export interface GrowthFacebookMetricsSyncOptions {
  brandId: string;
  days?: number;
  limit?: number;
  minAgeHours?: number;
  learningMinObservations?: number;
}

export interface GrowthFacebookMetricsSyncResult {
  brandId: string;
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

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøåáéíóúüñà-ÿ]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function claimValue(facts: Array<{ claim?: unknown }> | null | undefined, prefix: string): string | null {
  const row = (facts ?? []).find((f) => String(f?.claim ?? "").toLowerCase().startsWith(prefix.toLowerCase()));
  if (!row) return null;
  const raw = String(row.claim ?? "");
  const value = raw.slice(raw.indexOf(":") + 1).trim();
  return value || null;
}

function firstStructuredPlace(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || isBroadInventoryRegion(raw)) return null;
  return raw.split(",")[0]?.trim() || null;
}

async function verifiedSubjectLocation(
  supabase: MarketingSupabaseLike,
  propertyId: string | null,
): Promise<string | null> {
  if (!propertyId) return null;
  const { data } = await supabase
    .from("properties")
    .select("title, title_no, location")
    .eq("id", propertyId)
    .maybeSingle();
  if (!data) return null;
  return deriveSpecificLocationFromTitle(data.title_no || data.title)
    || firstStructuredPlace(data.location);
}

async function facebookAccessToken(brandId: string): Promise<string> {
  const channels = await getChannelsByBrand(brandId, "facebook");
  if (channels.length !== 1) {
    throw new Error(channels.length === 0
      ? `FACEBOOK_CHANNEL_MISSING: ${brandId}`
      : `FACEBOOK_CHANNEL_AMBIGUOUS: ${brandId} har ${channels.length} aktive Facebook-kanaler`);
  }
  const tokens = await getDecryptedTokens(channels[0].id);
  const accessToken = tokens?.accessToken?.trim();
  if (!accessToken) throw new Error(`FACEBOOK_ACCESS_TOKEN_MISSING: ${brandId}`);
  return accessToken;
}

async function postedAttempt(
  supabase: MarketingSupabaseLike,
  publicationId: string,
): Promise<{ postId: string; correlationId: string | null } | null> {
  const { data } = await supabase
    .from("marketing_publish_attempts")
    .select("external_media_id, external_id, correlation_id, status, updated_at")
    .eq("publication_id", publicationId)
    .eq("status", "posted")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const value = data?.external_media_id ?? data?.external_id;
  if (!value) return null;
  return {
    postId: String(value),
    correlationId: data?.correlation_id ? String(data.correlation_id) : null,
  };
}

async function latestAssetGenome(
  supabase: MarketingSupabaseLike,
  contentId: string,
  sourceId: string | null,
) {
  const { data } = await supabase
    .from("marketing_assets")
    .select("genome, fact_sources, property_ids, headline, body, cta, updated_at")
    .eq("content_id", contentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.genome) return null;

  const base = data.genome as ContentGenome;
  const facts = Array.isArray(data.fact_sources) ? data.fact_sources : [];
  const normalizedFacts = facts.map((f: any) => ({ claim: String(f?.claim ?? ""), source: String(f?.source ?? "") }));
  const assetLocation = claimValue(facts, "Sted:");
  const propertyId =
    (Array.isArray(data.property_ids) && data.property_ids[0] ? String(data.property_ids[0]) : null)
    || propertyIdFromSource(sourceId);
  const verifiedLocation = await verifiedSubjectLocation(supabase, propertyId);
  const caption = [data.headline, data.body, data.cta].filter(Boolean).join("\n");
  const quality = historicalAssetLearningQuality({
    caption,
    facts: normalizedFacts,
    assetLocation,
    verifiedLocation,
  });
  const tags = extractPublishedTags(caption);
  const genome: ContentGenome = {
    ...base,
    channel: "facebook",
    ...(assetLocation ? { area: slug(assetLocation) } : {}),
    ...(propertyId ? { propertyId } : {}),
    ...(tags.length ? { tags } : {}),
  };

  return { genome, quality, propertyId, assetLocation, verifiedLocation };
}

export async function syncGrowthFacebookMetrics(
  supabase: MarketingSupabaseLike,
  options: GrowthFacebookMetricsSyncOptions,
): Promise<GrowthFacebookMetricsSyncResult> {
  const brandId = options.brandId?.trim();
  if (!brandId) throw new Error("FACEBOOK_METRICS_BRAND_REQUIRED");

  const days = Math.max(1, Math.min(options.days ?? 30, 90));
  const limit = Math.max(1, Math.min(options.limit ?? 100, 250));
  const minAgeHours = Math.max(0, Math.min(options.minAgeHours ?? 24, 168));
  const learningMin = Math.max(5, options.learningMinObservations ?? 10);
  const now = Date.now();
  const since = new Date(now - days * 86_400_000).toISOString();
  const matureBefore = new Date(now - minAgeHours * 3_600_000).toISOString();
  const accessToken = await facebookAccessToken(brandId);

  const { data: publications, error } = await supabase
    .from("marketing_publications")
    .select("publication_id, content_id, brand_id, channel, state, source_id, updated_at")
    .eq("brand_id", brandId)
    .eq("state", "published")
    .eq("channel", "facebook")
    .gte("updated_at", since)
    .lte("updated_at", matureBefore)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`FACEBOOK_METRICS_PUBLICATION_LOOKUP_FAILED: ${error.message}`);

  const result: GrowthFacebookMetricsSyncResult = {
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
    const sourceId = pub.source_id ? String(pub.source_id) : null;
    if (!publicationId || !contentId) {
      result.skipped++;
      continue;
    }

    try {
      const [attempt, asset] = await Promise.all([
        postedAttempt(supabase, publicationId),
        latestAssetGenome(supabase, contentId, sourceId),
      ]);
      if (!attempt || !asset) {
        result.skipped++;
        continue;
      }

      await store.upsertContent(contentId, brandId, asset.genome);
      const engagement = await fetchFacebookPostEngagement(attempt.postId, accessToken);
      const metrics: ContentMetrics = {
        impressions: engagement.impressions,
        reactions: engagement.reactions,
        comments: engagement.comments,
        shares: engagement.shares,
      };

      const { error: deleteError } = await supabase
        .from("marketing_events")
        .delete()
        .eq("event_type", "metrics_snapshot")
        .eq("brand_id", brandId)
        .eq("content_id", contentId)
        .eq("channel", "facebook");
      if (deleteError) throw new Error(`FACEBOOK_METRICS_SNAPSHOT_DELETE_FAILED: ${deleteError.message}`);

      await store.recordEvent({
        eventType: "metrics_snapshot",
        brandId,
        contentId,
        channel: "facebook",
        genome: asset.genome,
        metrics,
        correlationId: attempt.correlationId,
        occurredAt: new Date(),
        metadata: {
          source: "facebook_graph_insights",
          snapshot_mode: "canonical_cumulative_replace",
          publication_id: publicationId,
          external_post_id: attempt.postId,
          source_id: sourceId,
          property_id: asset.propertyId,
          tags: asset.genome.tags ?? [],
          learning_eligible: asset.quality.learningEligible,
          data_quality_reason: asset.quality.dataQualityReason,
          data_quality_reasons: asset.quality.dataQualityReasons,
          unsupported_claims: asset.quality.unsupportedClaims,
          asset_location: asset.assetLocation,
          verified_subject_location: asset.verifiedLocation,
          observed: {
            impressions: engagement.impressions,
            reach: engagement.reach,
            reactions: engagement.reactions,
            comments: engagement.comments,
            shares: engagement.shares,
          },
          raw: engagement.raw,
        },
      });
      result.synced++;
    } catch (err) {
      result.failed++;
      result.failures.push({ publicationId, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const { data: observationRows } = await supabase
    .from("marketing_events")
    .select("content_id, metadata")
    .eq("event_type", "metrics_snapshot")
    .eq("brand_id", brandId)
    .eq("channel", "facebook");
  result.observations = new Set(
    (observationRows ?? [])
      .filter((row: any) => row?.metadata?.learning_eligible !== false)
      .map((row: any) => String(row.content_id ?? ""))
      .filter(Boolean),
  ).size;

  if (result.observations >= learningMin) {
    const learning = await refreshLearningRules(supabase, { brandId });
    result.learningRefreshed = true;
    result.rulesWritten = learning.rulesWritten;
  }

  return result;
}
