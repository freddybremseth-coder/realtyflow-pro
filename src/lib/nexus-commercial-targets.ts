import type { BusinessPipelineId } from "@/lib/business-pipeline-registry";

export interface NexusCommercialTarget {
  brandId: string;
  pipelineId: BusinessPipelineId;
  targetNewPerWeek: number | null;
  targetConversionsPerMonth: number | null;
  updatedAt: string | null;
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

export function commercialTargetConfigByPipeline(targets: NexusCommercialTarget[]) {
  return Object.fromEntries(targets.map((target) => [
    `${target.brandId}:${target.pipelineId}`,
    {
      targets: {
        targetNewPerWeek: target.targetNewPerWeek,
        targetConversionsPerMonth: target.targetConversionsPerMonth,
      },
    },
  ]));
}
