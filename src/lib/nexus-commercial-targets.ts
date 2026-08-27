import type { BusinessPipelineId } from "@/lib/business-pipeline-registry";
import type { NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";
import type { NexusSyncHealth } from "@/lib/nexus-sync-health";

const DAY_MS = 86_400_000;
const ACQUISITION_BASELINE_DAYS = 7;

export interface NexusCommercialTarget {
  brandId: string;
  pipelineId: BusinessPipelineId;
  targetNewPerWeek: number | null;
  targetConversionsPerMonth: number | null;
  updatedAt: string | null;
}

export interface NexusCommercialTargetEvidence extends NexusCommercialTarget {
  acquisitionEvidenceReady: boolean;
  acquisitionBaselineDays: number | null;
  newOpportunities7d: number | null;
  conversionEvidenceReady: boolean;
  realizedConversions30d: number | null;
  reason: string;
}

export interface MarketingGrowthPlanTargetRow {
  brand_id: string;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
}

const PIPELINES = new Set<BusinessPipelineId>([
  "real_estate_sales",
  "publishing",
  "ai_products_services",
  "expert_advisory",
  "product_commerce",
  "creator_media",
]);

function positiveOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function targetEntries(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.nexus_commercial_targets;
  return Array.isArray(value) ? value : [];
}

function timestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function baselineDays(rows: Array<NexusOpportunityStoreRow & { created_at?: string | null }>, now: Date) {
  const times = rows
    .map((row) => timestamp(row.created_at))
    .filter((value): value is number => value !== null);
  if (!times.length) return null;
  return Math.max(0, (now.getTime() - Math.min(...times)) / DAY_MS);
}

export function targetsFromGrowthPlanRows(rows: MarketingGrowthPlanTargetRow[]) {
  const targets: NexusCommercialTarget[] = [];
  for (const row of rows) {
    if (String(row.status || "active").toLowerCase() !== "active") continue;
    for (const entry of targetEntries(row.metadata)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const pipelineId = String(record.pipelineId || record.pipeline_id || "") as BusinessPipelineId;
      if (!PIPELINES.has(pipelineId)) continue;
      const targetNewPerWeek = positiveOrNull(record.targetNewPerWeek ?? record.target_new_per_week);
      const targetConversionsPerMonth = positiveOrNull(record.targetConversionsPerMonth ?? record.target_conversions_per_month);
      if (targetNewPerWeek === null && targetConversionsPerMonth === null) continue;
      targets.push({
        brandId: String(row.brand_id || "").trim(),
        pipelineId,
        targetNewPerWeek,
        targetConversionsPerMonth,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : typeof record.updated_at === "string" ? record.updated_at : null,
      });
    }
  }
  return targets.filter((target) => Boolean(target.brandId));
}

export function upsertCommercialTargetMetadata(
  metadata: Record<string, unknown> | null | undefined,
  input: {
    pipelineId: BusinessPipelineId;
    targetNewPerWeek?: number | null;
    targetConversionsPerMonth?: number | null;
    updatedAt?: string;
  },
) {
  if (!PIPELINES.has(input.pipelineId)) throw new Error("Unsupported pipelineId");
  const targetNewPerWeek = positiveOrNull(input.targetNewPerWeek);
  const targetConversionsPerMonth = positiveOrNull(input.targetConversionsPerMonth);
  const existing = targetEntries(metadata)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    .filter((entry) => String(entry.pipelineId || entry.pipeline_id || "") !== input.pipelineId);

  if (targetNewPerWeek !== null || targetConversionsPerMonth !== null) {
    existing.push({
      pipelineId: input.pipelineId,
      targetNewPerWeek,
      targetConversionsPerMonth,
      updatedAt: input.updatedAt || new Date().toISOString(),
    });
  }

  return { ...(metadata || {}), nexus_commercial_targets: existing };
}

export function buildCommercialTargetEvidence(
  targets: NexusCommercialTarget[],
  opportunityRows: Array<NexusOpportunityStoreRow & { created_at?: string | null }>,
  syncHealth: NexusSyncHealth,
  now = new Date(),
) {
  return targets.map((target): NexusCommercialTargetEvidence => {
    const rows = opportunityRows.filter(
      (row) => row.brand_id === target.brandId && row.pipeline_id === target.pipelineId,
    );
    const observedDays = baselineDays(rows, now);
    const acquisitionEvidenceReady = Boolean(
      syncHealth.trustedForPipelineDecisions
      && observedDays !== null
      && observedDays >= ACQUISITION_BASELINE_DAYS,
    );
    const sevenDaysAgo = now.getTime() - ACQUISITION_BASELINE_DAYS * DAY_MS;
    const newOpportunities7d = acquisitionEvidenceReady
      ? rows.filter((row) => {
          const firstSeen = timestamp(row.created_at);
          return firstSeen !== null && firstSeen >= sevenDaysAgo;
        }).length
      : null;

    // Opportunity Store currently has reliable Nexus first-seen timestamps, but no
    // universal source-of-truth conversion timestamp across all business pipelines.
    // Keep monthly conversion targets stored but inactive until that evidence exists.
    const conversionEvidenceReady = false;
    const realizedConversions30d = null;

    let reason: string;
    if (!syncHealth.trustedForPipelineDecisions) {
      reason = `Target lagret, men Opportunity Sync er ${syncHealth.state}; pipeline-gap er ikke trusted.`;
    } else if (observedDays === null) {
      reason = "Target lagret, men Nexus har ingen first-seen baseline for denne brand/pipeline ennå.";
    } else if (!acquisitionEvidenceReady) {
      reason = `Target lagret. Nexus har ${Math.floor(observedDays)} av ${ACQUISITION_BASELINE_DAYS} nødvendige observasjonsdager før weekly demand-gap kan aktiveres.`;
    } else {
      reason = `Weekly acquisition-evidence er klar: ${newOpportunities7d} Nexus first-seen opportunities siste 7 dager.`;
    }

    if (target.targetConversionsPerMonth && !conversionEvidenceReady) {
      reason += " Monthly conversion-target er lagret, men aktiveres ikke før en verifisert conversion-timestamp-kilde er koblet inn.";
    }

    return {
      ...target,
      acquisitionEvidenceReady,
      acquisitionBaselineDays: observedDays,
      newOpportunities7d,
      conversionEvidenceReady,
      realizedConversions30d,
      reason,
    };
  });
}

export function commercialTargetConfigByPipeline(evidence: NexusCommercialTargetEvidence[]) {
  return Object.fromEntries(evidence.map((target) => [
    `${target.brandId}:${target.pipelineId}`,
    {
      targets: {
        targetNewPerWeek: target.targetNewPerWeek,
        targetConversionsPerMonth: target.targetConversionsPerMonth,
      },
      evidence: {
        newOpportunities7d: target.acquisitionEvidenceReady ? target.newOpportunities7d : null,
        realizedConversions30d: target.conversionEvidenceReady ? target.realizedConversions30d : null,
      },
    },
  ]));
}

export const NEXUS_ACQUISITION_BASELINE_DAYS = ACQUISITION_BASELINE_DAYS;
