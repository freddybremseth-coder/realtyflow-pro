import { createHash } from "node:crypto";
import { growthBrandDefinition, isMetaGrowthChannel } from "@/lib/marketing/brand-registry";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";
import { planGSCOpportunities } from "@/services/agents/seo-priorities";
import type { GSCBrandSnapshot } from "@/services/agents/seo-search-console";

const SOURCE_TYPE = "seo_topic";
const CONTENT_OPPORTUNITY_PREFIXES = [
  "gsc-snippet:",
  "gsc-page-snippet:",
  "gsc-content:",
] as const;

type TopicMission = {
  brandId: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  priority: number;
  recommendedChannels: string[];
  payload: Record<string, unknown>;
};

function exactPageForOpportunity(
  issueId: string,
  brandId: string,
  snapshots: readonly GSCBrandSnapshot[],
): string | null {
  const snapshot = snapshots.find((item) => item.brandId === brandId);
  if (!snapshot) return null;

  for (const row of snapshot.topQueryPages) {
    const encoded = encodeURIComponent(row.page).slice(0, 105);
    if (issueId === `gsc-snippet:${brandId}:${encoded}`) return row.page;
    if (issueId === `gsc-content:${brandId}:${encoded}`) return row.page;
  }
  for (const row of snapshot.topPages) {
    const encoded = encodeURIComponent(row.path).slice(0, 105);
    if (issueId === `gsc-page-snippet:${brandId}:${encoded}`) return row.path;
  }
  return null;
}

function absoluteBrandUrl(brandId: string, path: string | null) {
  const brand = growthBrandDefinition(brandId);
  if (!brand) return null;
  try {
    return new URL(path || "/", brand.website).toString();
  } catch {
    return null;
  }
}

export function buildSEOTopicMissions(snapshots: readonly GSCBrandSnapshot[]): TopicMission[] {
  const opportunities = planGSCOpportunities(snapshots)
    .filter((opportunity) =>
      Boolean(opportunity.brandId)
      && CONTENT_OPPORTUNITY_PREFIXES.some((prefix) => opportunity.issueId.startsWith(prefix)),
    );

  return opportunities.flatMap((opportunity) => {
    const brandId = String(opportunity.brandId);
    const brand = growthBrandDefinition(brandId);
    if (!brand) return [];
    const page = exactPageForOpportunity(opportunity.issueId, brandId, snapshots);
    const sourceUrl = absoluteBrandUrl(brandId, page);
    if (!sourceUrl) return [];

    // First rollout is Facebook-only: it can carry the exact canonical link
    // without inventing or resolving a new visual asset. Instagram joins only
    // after a verified media source exists for the mission.
    const recommendedChannels = brand.pilotChannels.filter((channel) => isMetaGrowthChannel(channel) && channel === "facebook");
    if (!recommendedChannels.length) return [];

    const topicId = `seo:${brandId}:${opportunity.issueId}`;
    const genomeTopic = `seo_${brandId}_${createHash("sha1").update(topicId).digest("hex").slice(0, 12)}`;
    return [{
      brandId,
      sourceId: opportunity.issueId,
      sourceUrl,
      title: opportunity.title.replace(/^Sam SEO:\s*/i, ""),
      priority: opportunity.priority === "HIGH" ? 90 : 70,
      recommendedChannels,
      payload: {
        topic_id: topicId,
        content_cluster_id: topicId,
        genome_topic: genomeTopic,
        origin: "sam_seo",
        mission_kind: "gsc_content_opportunity",
        seo_issue_id: opportunity.issueId,
        canonical_url: sourceUrl,
        evidence: opportunity.evidence,
        observation: opportunity.description,
        next_action: opportunity.nextAction,
        publishing_policy: "evidence_guided_brand_safe",
        learning_contract: {
          preserve_topic_id: true,
          compare_search_and_social_separately: true,
          canonical_business_outcomes_required_for_scaling: true,
        },
      },
    }];
  });
}

export async function syncSEOTopicMissions(
  supabase: MarketingSupabaseLike,
  snapshots: readonly GSCBrandSnapshot[],
): Promise<{ discovered: number; insertedOrUpdated: number; blockedStale: number }> {
  const missions = buildSEOTopicMissions(snapshots);
  const brandIds = Array.from(new Set(snapshots.map((snapshot) => snapshot.brandId)));

  let existing: any[] = [];
  if (brandIds.length) {
    const existingResult = await supabase
      .from("marketing_source_queue")
      .select("brand_id,source_type,source_id,status,blocked_reason,last_planned_at")
      .eq("source_type", SOURCE_TYPE)
      .in("brand_id", brandIds)
      .limit(1000);
    if (existingResult.error) throw new Error(`SEO_TOPIC_EXISTING_READ_FAILED: ${existingResult.error.message}`);
    existing = existingResult.data ?? [];
  }

  const existingByKey = new Map(existing.map((row: any) => [`${row.brand_id}|${row.source_id}`, row]));
  const rows = missions.map((mission) => {
    const previous = existingByKey.get(`${mission.brandId}|${mission.sourceId}`);
    return {
      brand_id: mission.brandId,
      source_type: SOURCE_TYPE,
      source_id: mission.sourceId,
      source_url: mission.sourceUrl,
      title: mission.title,
      priority: mission.priority,
      recommended_channels: mission.recommendedChannels,
      payload: mission.payload,
      status: previous?.status ?? "ready",
      blocked_reason: previous?.blocked_reason ?? null,
      last_planned_at: previous?.last_planned_at ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length) {
    const upsert = await supabase
      .from("marketing_source_queue")
      .upsert(rows, { onConflict: "brand_id,source_type,source_id" });
    if (upsert.error) throw new Error(`SEO_TOPIC_UPSERT_FAILED: ${upsert.error.message}`);
  }

  const currentKeys = new Set(missions.map((mission) => `${mission.brandId}|${mission.sourceId}`));
  const stale = existing.filter((row: any) =>
    ["pending", "ready"].includes(String(row.status))
    && !currentKeys.has(`${row.brand_id}|${row.source_id}`),
  );

  let blockedStale = 0;
  for (const row of stale) {
    const result = await supabase
      .from("marketing_source_queue")
      .update({
        status: "blocked",
        blocked_reason: "SAM_SIGNAL_NO_LONGER_CURRENT",
        updated_at: new Date().toISOString(),
      })
      .eq("brand_id", row.brand_id)
      .eq("source_type", SOURCE_TYPE)
      .eq("source_id", row.source_id)
      .in("status", ["pending", "ready"]);
    if (result.error) throw new Error(`SEO_TOPIC_STALE_BLOCK_FAILED: ${result.error.message}`);
    blockedStale += 1;
  }

  return {
    discovered: missions.length,
    insertedOrUpdated: rows.length,
    blockedStale,
  };
}
