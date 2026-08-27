import { buildNexusGrowthMission, rankNexusGrowthMissions } from "@/lib/nexus-growth-mission";
import { buildNexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";
import { buildNexusPipelineHealth } from "@/lib/nexus-pipeline-health";
import {
  directPortfolioFromPipelineHealth,
  type NexusPipelineDirectorConfig,
} from "@/lib/nexus-health-director";
import {
  storeRowToOpportunity,
  type NexusOpportunityStoreRow,
} from "@/lib/nexus-opportunity-store";

const DAY_MS = 86_400_000;
const WON_FOLLOWUP_DAYS = 30;

function ageDays(value: string | null, now: Date) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (now.getTime() - date.getTime()) / DAY_MS);
}

function recentWon(row: NexusOpportunityStoreRow, now: Date) {
  if (row.opportunity_state !== "won") return false;
  const age = ageDays(row.last_activity_at || row.source_updated_at, now);
  return age !== null && age <= WON_FOLLOWUP_DAYS;
}

export function buildNexusRevenueCommandCenter(
  rows: NexusOpportunityStoreRow[],
  now = new Date(),
  directorConfigByPipeline: Record<string, NexusPipelineDirectorConfig> = {},
) {
  const activeRows = rows.filter((row) => row.opportunity_state === "active");
  const recentWonRows = rows.filter((row) => recentWon(row, now));

  const activeOpportunities = activeRows
    .map(storeRowToOpportunity)
    .filter((row): row is NonNullable<ReturnType<typeof storeRowToOpportunity>> => Boolean(row));
  const followupOpportunities = recentWonRows
    .map(storeRowToOpportunity)
    .filter((row): row is NonNullable<ReturnType<typeof storeRowToOpportunity>> => Boolean(row));

  const health = buildNexusPipelineHealth(activeOpportunities, now);
  const directorMissions = directPortfolioFromPipelineHealth(health, directorConfigByPipeline);
  const growthMissions = rankNexusGrowthMissions(
    [...activeOpportunities, ...followupOpportunities].map(buildNexusGrowthMission),
    100,
  );
  const agenticPlans = growthMissions.map((mission) => buildNexusMissionAgenticPlan(mission));

  const byPipeline: Record<string, number> = {};
  const valueByCurrency: Record<string, number> = {};
  for (const opportunity of activeOpportunities) {
    byPipeline[opportunity.pipelineId] = (byPipeline[opportunity.pipelineId] || 0) + 1;
    if (opportunity.value !== null && opportunity.currency) {
      valueByCurrency[opportunity.currency] = (valueByCurrency[opportunity.currency] || 0) + opportunity.value;
    }
  }

  return {
    generatedAt: now.toISOString(),
    summary: {
      activeOpportunities: activeOpportunities.length,
      recentWonFollowups: followupOpportunities.length,
      criticalPipelines: health.filter((row) => row.health === "CRITICAL").length,
      atRiskPipelines: health.filter((row) => row.health === "AT_RISK").length,
      staleConversionOpportunities: health.reduce((sum, row) => sum + row.staleConversionOpportunities, 0),
      directorMissions: directorMissions.length,
      growthMissions: growthMissions.length,
      approvalOrHumanRequired: agenticPlans.filter((plan) => plan.effectiveMode === "manual-review" || plan.effectiveMode === "human-required").length,
      byPipeline,
      valueByCurrency,
    },
    health,
    directorMissions,
    growthMissions,
    agenticPlans,
    safety: {
      readOnly: true,
      wonFollowupWindowDays: WON_FOLLOWUP_DAYS,
      targetsInvented: false,
      directorTargetsSource: Object.keys(directorConfigByPipeline).length ? "explicit_growth_plan_metadata" : "none",
      outboundActions: false,
    },
  };
}
