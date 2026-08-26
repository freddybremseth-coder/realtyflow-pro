import type { NexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";

export type NexusTeamRole =
  | "growth_director"
  | "demand_generation"
  | "content_influencer"
  | "sales_sdr"
  | "closer"
  | "customer_success";

export type NexusMissionObjective =
  | "generate_lead"
  | "create_engagement"
  | "qualify"
  | "advance_stage"
  | "close"
  | "deliver"
  | "retain_expand";

export type NexusMissionAutonomy = "suggest" | "prepare" | "approval" | "execute" | "auto";

export interface NexusGrowthMission {
  id: string;
  opportunityId: string;
  brandId: string;
  pipelineId: NexusBusinessOpportunity["pipelineId"];
  stageId: string;
  role: NexusTeamRole;
  objective: NexusMissionObjective;
  title: string;
  nextAction: string;
  whyNow: string;
  desiredOutcome: string;
  priority: NexusBusinessOpportunity["priority"];
  priorityScore: number;
  expectedValue: number | null;
  currency: string | null;
  dueInHours: number;
  autonomy: NexusMissionAutonomy;
  href: string;
}

function roleFor(opportunity: NexusBusinessOpportunity): NexusTeamRole {
  if (opportunity.phase === "awareness") return "demand_generation";
  if (opportunity.phase === "engagement") {
    return opportunity.pipelineId === "creator_media" || opportunity.pipelineId === "publishing"
      ? "content_influencer"
      : "sales_sdr";
  }
  if (opportunity.phase === "qualification") return "sales_sdr";
  if (opportunity.phase === "consideration") return "sales_sdr";
  if (opportunity.phase === "conversion") return "closer";
  if (opportunity.phase === "delivery" || opportunity.phase === "retention") return "customer_success";
  return "growth_director";
}

function objectiveFor(opportunity: NexusBusinessOpportunity): NexusMissionObjective {
  if (opportunity.phase === "awareness") return "generate_lead";
  if (opportunity.phase === "engagement") return "create_engagement";
  if (opportunity.phase === "qualification") return "qualify";
  if (opportunity.phase === "consideration") return "advance_stage";
  if (opportunity.phase === "conversion") return "close";
  if (opportunity.phase === "delivery") return "deliver";
  return "retain_expand";
}

function dueHours(opportunity: NexusBusinessOpportunity) {
  if (opportunity.priority === "CRITICAL") return 2;
  if (opportunity.priority === "HIGH") return 8;
  if (opportunity.priority === "MEDIUM") return 24;
  return 72;
}

function autonomyFor(opportunity: NexusBusinessOpportunity): NexusMissionAutonomy {
  if (opportunity.routeConfidence === "low" || opportunity.routeConfidence === "unknown") return "suggest";
  if (opportunity.phase === "conversion") return "approval";
  if (opportunity.phase === "delivery") return "approval";
  return "prepare";
}

function desiredOutcome(opportunity: NexusBusinessOpportunity) {
  if (opportunity.terminal) return opportunity.successEvent;
  if (opportunity.phase === "conversion") return `Flytt saken mot ${opportunity.successEvent}.`;
  if (opportunity.phase === "retention") return "Skap gjenkjøp, fornyelse, anbefaling eller relevant utvidelse.";
  return `Flytt ${opportunity.opportunityLabel.toLowerCase()}en videre fra ${opportunity.stageLabel}.`;
}

export function buildNexusGrowthMission(opportunity: NexusBusinessOpportunity): NexusGrowthMission {
  const role = roleFor(opportunity);
  const objective = objectiveFor(opportunity);
  return {
    id: `mission:${opportunity.id}:${opportunity.stageId}`,
    opportunityId: opportunity.id,
    brandId: opportunity.brandId,
    pipelineId: opportunity.pipelineId,
    stageId: opportunity.stageId,
    role,
    objective,
    title: `${opportunity.pipelineName}: ${opportunity.title}`,
    nextAction: opportunity.nextAction,
    whyNow: opportunity.reason || `${opportunity.stageLabel} krever et konkret neste steg for å unngå stagnasjon.`,
    desiredOutcome: desiredOutcome(opportunity),
    priority: opportunity.priority,
    priorityScore: opportunity.priorityScore,
    expectedValue: opportunity.value,
    currency: opportunity.currency,
    dueInHours: dueHours(opportunity),
    autonomy: autonomyFor(opportunity),
    href: opportunity.href,
  };
}

const roleWeight: Record<NexusTeamRole, number> = {
  closer: 16,
  sales_sdr: 12,
  customer_success: 9,
  growth_director: 8,
  demand_generation: 6,
  content_influencer: 5,
};

export function rankNexusGrowthMissions(missions: NexusGrowthMission[], limit = 10) {
  return [...missions]
    .sort((a, b) => {
      const aValue = Number(a.expectedValue || 0);
      const bValue = Number(b.expectedValue || 0);
      const aScore = a.priorityScore + roleWeight[a.role] + Math.min(18, Math.log10(aValue + 1) * 3);
      const bScore = b.priorityScore + roleWeight[b.role] + Math.min(18, Math.log10(bValue + 1) * 3);
      return bScore - aScore || a.dueInHours - b.dueInHours;
    })
    .slice(0, Math.max(0, limit));
}
