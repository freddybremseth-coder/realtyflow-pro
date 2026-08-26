import type { NexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";
import { buildNexusGrowthMission, rankNexusGrowthMissions, type NexusGrowthMission } from "@/lib/nexus-growth-mission";

export interface NexusMissionPortfolio {
  missions: NexusGrowthMission[];
  byPipeline: Record<string, number>;
  byRole: Record<string, number>;
  valueByCurrency: Record<string, number>;
}

export function buildNexusMissionPortfolio(opportunities: NexusBusinessOpportunity[], limit = 40): NexusMissionPortfolio {
  const missions = rankNexusGrowthMissions(opportunities.map(buildNexusGrowthMission), limit);
  const byPipeline: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const valueByCurrency: Record<string, number> = {};

  for (const mission of missions) {
    byPipeline[mission.pipelineId] = (byPipeline[mission.pipelineId] || 0) + 1;
    byRole[mission.role] = (byRole[mission.role] || 0) + 1;
    if (mission.expectedValue !== null && mission.currency) {
      valueByCurrency[mission.currency] = (valueByCurrency[mission.currency] || 0) + mission.expectedValue;
    }
  }

  return { missions, byPipeline, byRole, valueByCurrency };
}
