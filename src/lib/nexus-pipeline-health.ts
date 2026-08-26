import type { BusinessPipelineId, NexusLifecyclePhase } from "@/lib/business-pipeline-registry";
import type { NexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";

export interface NexusPipelineHealth {
  brandId: string;
  pipelineId: BusinessPipelineId;
  activeOpportunities: number;
  phaseCounts: Record<NexusLifecyclePhase, number>;
  staleOpportunities: number;
  staleConversionOpportunities: number;
  unknownFreshness: number;
  highestPriorityScore: number;
  visibleValueByCurrency: Record<string, number>;
  health: "CRITICAL" | "AT_RISK" | "ACTIVE" | "QUIET";
  reasons: string[];
}

const STALE_DAYS: Record<NexusLifecyclePhase, number> = {
  awareness: 14,
  engagement: 7,
  qualification: 7,
  consideration: 5,
  conversion: 2,
  delivery: 3,
  retention: 30,
};

function emptyPhaseCounts(): Record<NexusLifecyclePhase, number> {
  return { awareness: 0, engagement: 0, qualification: 0, consideration: 0, conversion: 0, delivery: 0, retention: 0 };
}

function ageDays(value: string | null, now: Date) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

export function isNexusOpportunityStale(opportunity: NexusBusinessOpportunity, now = new Date()) {
  if (opportunity.terminal) return false;
  const age = ageDays(opportunity.updatedAt, now);
  if (age === null) return false;
  return age >= STALE_DAYS[opportunity.phase];
}

export function buildNexusPipelineHealth(
  opportunities: NexusBusinessOpportunity[],
  now = new Date(),
): NexusPipelineHealth[] {
  const groups = new Map<string, NexusBusinessOpportunity[]>();
  for (const opportunity of opportunities.filter((row) => !row.terminal)) {
    const key = `${opportunity.brandId}:${opportunity.pipelineId}`;
    const bucket = groups.get(key) || [];
    bucket.push(opportunity);
    groups.set(key, bucket);
  }

  return [...groups.values()].map((rows) => {
    const first = rows[0];
    const phaseCounts = emptyPhaseCounts();
    const visibleValueByCurrency: Record<string, number> = {};
    let staleOpportunities = 0;
    let staleConversionOpportunities = 0;
    let unknownFreshness = 0;
    let highestPriorityScore = 0;

    for (const opportunity of rows) {
      phaseCounts[opportunity.phase] += 1;
      highestPriorityScore = Math.max(highestPriorityScore, opportunity.priorityScore);
      if (!opportunity.updatedAt) unknownFreshness += 1;
      if (isNexusOpportunityStale(opportunity, now)) {
        staleOpportunities += 1;
        if (opportunity.phase === "conversion") staleConversionOpportunities += 1;
      }
      if (opportunity.value !== null && opportunity.currency) {
        visibleValueByCurrency[opportunity.currency] = (visibleValueByCurrency[opportunity.currency] || 0) + opportunity.value;
      }
    }

    const reasons: string[] = [];
    let health: NexusPipelineHealth["health"] = rows.length ? "ACTIVE" : "QUIET";
    if (staleConversionOpportunities > 0) {
      health = "CRITICAL";
      reasons.push(`${staleConversionOpportunities} conversion-saker er stale`);
    } else if (staleOpportunities > 0) {
      health = "AT_RISK";
      reasons.push(`${staleOpportunities} aktive saker mangler fersk fremdrift`);
    }
    if (unknownFreshness > 0) reasons.push(`${unknownFreshness} saker mangler pålitelig freshness-timestamp`);
    if (phaseCounts.conversion > 0) reasons.push(`${phaseCounts.conversion} saker er i conversion`);
    if (highestPriorityScore >= 90) reasons.push(`høyeste opportunity-score er ${highestPriorityScore}/100`);

    return {
      brandId: first.brandId,
      pipelineId: first.pipelineId,
      activeOpportunities: rows.length,
      phaseCounts,
      staleOpportunities,
      staleConversionOpportunities,
      unknownFreshness,
      highestPriorityScore,
      visibleValueByCurrency,
      health,
      reasons,
    };
  }).sort((a, b) => {
    const weight = { CRITICAL: 4, AT_RISK: 3, ACTIVE: 2, QUIET: 1 } as const;
    return weight[b.health] - weight[a.health] || b.highestPriorityScore - a.highestPriorityScore;
  });
}
