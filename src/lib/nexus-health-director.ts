import type { NexusPipelineHealth } from "@/lib/nexus-pipeline-health";
import { directPipelineMissions, rankDirectorMissions, type DirectorMission } from "@/lib/nexus-mission-director";

export interface NexusDirectorEvidence {
  newOpportunities7d?: number | null;
  realizedConversions30d?: number | null;
}

export interface NexusDirectorTargets {
  targetNewPerWeek?: number | null;
  targetConversionsPerMonth?: number | null;
}

export interface NexusPipelineDirectorConfig {
  evidence?: NexusDirectorEvidence;
  targets?: NexusDirectorTargets;
}

function finiteOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function directorMissionsFromPipelineHealth(
  health: NexusPipelineHealth,
  config: NexusPipelineDirectorConfig = {},
): DirectorMission[] {
  const newCount = finiteOrNull(config.evidence?.newOpportunities7d);
  const conversionCount = finiteOrNull(config.evidence?.realizedConversions30d);
  const requestedNewTarget = finiteOrNull(config.targets?.targetNewPerWeek);
  const requestedConversionTarget = finiteOrNull(config.targets?.targetConversionsPerMonth);

  return directPipelineMissions({
    brandId: health.brandId,
    pipelineId: health.pipelineId,
    activeOpportunities: health.activeOpportunities,
    newOpportunities7d: newCount ?? 0,
    qualificationOpportunities: health.phaseCounts.qualification,
    considerationOpportunities: health.phaseCounts.consideration,
    conversionOpportunities: health.phaseCounts.conversion,
    deliveryRetentionOpportunities: health.phaseCounts.delivery + health.phaseCounts.retention,
    staleOpportunities: health.staleOpportunities,
    staleConversionOpportunities: health.staleConversionOpportunities,
    targetNewPerWeek: newCount === null ? null : requestedNewTarget,
    targetConversionsPerMonth: conversionCount === null ? null : requestedConversionTarget,
    realizedConversions30d: conversionCount ?? 0,
  });
}

export function directPortfolioFromPipelineHealth(
  rows: NexusPipelineHealth[],
  configByPipeline: Record<string, NexusPipelineDirectorConfig> = {},
) {
  const missions = rows.flatMap((health) => {
    const exactKey = `${health.brandId}:${health.pipelineId}`;
    const pipelineKey = health.pipelineId;
    return directorMissionsFromPipelineHealth(health, configByPipeline[exactKey] || configByPipeline[pipelineKey] || {});
  });
  return rankDirectorMissions(missions);
}
