/**
 * Marketing Growth OS — canonical channel metrics sync.
 *
 * Bridges LIVE Growth OS publications to observed channel metrics:
 *   marketing_publications + marketing_publish_attempts
 *     -> Instagram Insights
 *     -> marketing_content (genome backfill/enrichment)
 *     -> ONE canonical metrics_snapshot per content/channel
 *     -> Learning Engine (only after enough distinct observations)
 *
 * Important: Instagram media insights are cumulative. We replace the previous
 * metrics_snapshot for a content/channel instead of summing daily snapshots.
 */
import { fetchInstagramMediaEngagement } from "@/services/integrations/instagram-insights";
import { makeMarketingStore, type MarketingSupabaseLike } from "@/services/marketing/adapters";
import { refreshLearningRules } from "@/services/marketing/learning-adapter";
import { deriveSpecificLocationFromTitle, isBroadInventoryRegion } from "@/services/marketing/inventory-property-adapter";
import { unsupportedOutcomeClaims } from "@/lib/marketing/autonomous/claim-guard";
import type { ContentGenome } from "@/lib/marketing/genome";
import type { ContentMetrics } from "@/lib/marketing/value-score";

export interface GrowthMetricsSyncOptions {
  brandId?: string;
  days?: number;
  limit?: number;
  accessToken?: string;
  /** Do not sync/learn from posts until they have had time to accumulate stable engagement. */
  minAgeHours?: number;
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

interface AssetGenomeResult {
  genome: ContentGenome;
  learningEligible: boolean;
  dataQualityReason: string | null;
  dataQualityReasons: string[];
  unsupportedClaims: string[];
  assetLocation: string | null;
  verifiedLocation: string | null;
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

/** Extract the hashtags that were actually present in the approved/published
 * caption. This learns from real output, not from a separate suggested-tag list. */
export function extractPublishedTags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return Array.from(new Set(
    matches
      .map((tag) => tag.slice(1).trim().toLowerCase())
      .filter(Boolean),
  )).slice(0, 30);
}

/** Pure historical data-quality decision used before an old published asset is
 * allowed to contribute observational learning. Measurement/audit is retained. */
export function historicalAssetLearningQuality(input: {
  caption: string;
  facts: Array<{ claim: string; source: string }>;
  assetLocation: string | null;
  verifiedLocation: string | null;
}) {
  const locationConflict = !!(
    input.assetLocation
    && input.verifiedLocation
    && slug(input.assetLocation) !== slug(input.verifiedLocation)
  );
  const unsupportedClaims = unsupportedOutcomeClaims(input.caption, input.facts);
  const dataQualityReasons = [
    ...(locationConflict ? ["historical_asset_location_conflict"] : []),
    ...(unsupportedClaims.length ? ["historical_asset_unsupported_claim"] : []),
  ];
  return {
    learningEligible: dataQualityReasons.length === 0,
    dataQualityReason: dataQualityReasons[0] ?? null,
    dataQualityReasons,
    unsupportedClaims,
  };
}

function claimValue(facts: Array<{ claim?: unknown }> | null | undefined, prefix: string): string | null {
  const row = (facts ?? []).find((f) => String(f?.claim ?? "").toLowerCase().startsWith(prefix.toLowerCase()));
  if (!row) return null;
  const raw = String(row.claim ?? "");
  const value = raw.slice(raw.indexOf(":") + 1).trim();
  return value || null;
}

function priceBandFromClaim(value: string | null): string | undefined {
  if (!value) return undefined;
  const n = Number(value.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n < 300_000) return "under_300k";
  if (n < 500_000) return "300k_500k";
  if (n < 750_000) return "500k_750k";
  if (n < 1_000_000) return "750k_1m";
  return "1m_plus";
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

async function latestAssetGenome(
  supabase: MarketingSupabaseLike,
  contentId: string,
  sourceId: string | null,
): Promise<AssetGenomeResult | null> {
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
  const normalizedFacts = facts.map((f: any) => ({
    claim: String(f?.claim ?? ""),
    source: String(f?.source ?? ""),
  }));
  const place = claimValue(facts, "Sted:");
  const propertyType = claimValue(facts, "Boligtype:");
  const price = claimValue(facts, "Pris:");
  const propertyId =
    (Array.isArray(data.property_ids) && data.property_ids[0] ? String(data.property_ids[0]) : null)
    || propertyIdFromSource(sourceId);
  const caption = [data.headline, data.body, data.cta].filter(Boolean).join("\n");
  const tags = extractPublishedTags(caption);
  const currentLocation = await verifiedSubjectLocation(supabase, propertyId);
  const quality = historicalAssetLearningQuality({
    caption,
    facts: normalizedFacts,
    assetLocation: place,
    verifiedLocation: currentLocation,
  });

  const genome: ContentGenome = {
    ...base,
    ...(place ? { area: slug(place) } : {}),
    ...(propertyType ? { propertyType: slug(propertyType) } : {}),
    ...(priceBandFromClaim(price) ? { priceBand: priceBandFromClaim(price) } : {}),
    ...(propertyId ? { propertyId } : {}),
    ...(tags.length ? { tags } : {}),
  };

  return {
    genome,
    ...quality,
    assetLocation: place,
    verifiedLocation: currentLocation,
  };
}

async function postedAttempt(
  supabase: MarketingSupabaseLike,
  publicationId: string,
): Promise<{ mediaId: string; correlationId: string | null } | null> {
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
    mediaId: String(value),
    correlationId: data?.correlation_id ? String(data.correlation_id) : null,
  };
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
    learningEligible: boolean;
    dataQualityReason: string | null;
    dataQualityReasons: string[];
    unsupportedClaims: string[];
    assetLocation: string | null;
    verifiedLocation: string | null;
  },
) {
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
      tags: input.genome.tags ?? [],
      learning_eligible: input.learningEligible,
      data_quality_reason: input.dataQualityReason,
      data_quality_reasons: input.dataQualityReasons,
      unsupported_claims: input.unsupportedClaims,
      asset_location: input.assetLocation,
      verified_subject_location: input.verifiedLocation,
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
  const minAgeHours = Math.max(0, Math.min(options.minAgeHours ?? 24, 168));
  const learningMin = Math.max(5, options.learningMinObservations ?? 10);
  const now = Date.now();
  const since = new Date(now - days * 86_400_000).toISOString();
  const matureBefore = new Date(now - minAgeHours * 3_600_000).toISOString();

  let query = supabase
    .from("marketing_publications")
    .select("publication_id, content_id, brand_id, channel, state, source_id, updated_at")
    .eq("state", "published")
    .eq("channel", "instagram")
    .gte("updated_at", since)
    .lte("updated_at", matureBefore)
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
    const sourceId = pub.source_id ? String(pub.source_id) : null;
    if (!publicationId || !contentId || !currentBrand) {
      result.skipped++;
      continue;
    }

    try {
      const [attempt, assetGenome] = await Promise.all([
        postedAttempt(supabase, publicationId),
        latestAssetGenome(supabase, contentId, sourceId),
      ]);
      if (!attempt || !assetGenome) {
        result.skipped++;
        continue;
      }

      await store.upsertContent(contentId, currentBrand, assetGenome.genome);

      const engagement = await fetchInstagramMediaEngagement(attempt.mediaId, accessToken);
      const metrics: ContentMetrics = {
        views: engagement.views,
        saves: engagement.saves,
        shares: engagement.shares,
      };
      await replaceCanonicalSnapshot(supabase, {
        brandId: currentBrand,
        contentId,
        correlationId: attempt.correlationId,
        genome: assetGenome.genome,
        publicationId,
        externalMediaId: attempt.mediaId,
        sourceId,
        metrics,
        learningEligible: assetGenome.learningEligible,
        dataQualityReason: assetGenome.dataQualityReason,
        dataQualityReasons: assetGenome.dataQualityReasons,
        unsupportedClaims: assetGenome.unsupportedClaims,
        assetLocation: assetGenome.assetLocation,
        verifiedLocation: assetGenome.verifiedLocation,
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

  let observationQuery = supabase
    .from("marketing_events")
    .select("content_id, metadata")
    .eq("event_type", "metrics_snapshot")
    .eq("channel", "instagram");
  if (brandId) observationQuery = observationQuery.eq("brand_id", brandId);
  const { data: observationRows } = await observationQuery;
  result.observations = new Set(
    (observationRows ?? [])
      .filter((row: any) => row?.metadata?.learning_eligible !== false)
      .map((row: any) => String(row.content_id ?? ""))
      .filter(Boolean),
  ).size;

  if (result.observations >= learningMin && brandId) {
    const refreshed = await refreshLearningRules(supabase, { brandId, scope: brandId });
    result.learningRefreshed = true;
    result.rulesWritten = refreshed.rulesWritten;
  }

  return result;
}
