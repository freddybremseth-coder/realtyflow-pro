import { decideAutonomy } from "@/lib/agentic/policy-engine";
import type {
  ActionClass,
  ActionContext,
  ActionPermission,
  AutonomyDecision,
  AutonomyMode,
} from "@/lib/agentic/schemas";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";

export type NexusMissionExecutionCapability =
  | "recommendation_only"
  | "prepare_only"
  | "approval_required"
  | "policy_governed";

export interface NexusMissionAgenticEvidence {
  agentConfidence?: number;
  historicalAccuracy?: number;
  dataQuality?: number;
  permission?: ActionPermission;
}

export interface NexusMissionAgenticPlan {
  missionId: string;
  opportunityId: string;
  agentId: string;
  actionClass: ActionClass;
  capability: NexusMissionExecutionCapability;
  actionContext: ActionContext;
  policyDecision: AutonomyDecision;
  effectiveMode: AutonomyMode;
  guardrailReason: string | null;
  externalSideEffectAllowed: boolean;
}

const MODE_RANK: Record<AutonomyMode, number> = {
  live: 0,
  "draft-first": 1,
  "manual-review": 2,
  "human-required": 3,
};

function stricterMode(a: AutonomyMode, b: AutonomyMode): AutonomyMode {
  return MODE_RANK[a] >= MODE_RANK[b] ? a : b;
}

function missionFloor(mission: NexusGrowthMission): AutonomyMode | null {
  if (mission.autonomy === "prepare") return "draft-first";
  if (mission.autonomy === "approval") return "manual-review";
  return null;
}

function capabilityFor(mission: NexusGrowthMission): NexusMissionExecutionCapability {
  if (mission.autonomy === "suggest") return "recommendation_only";
  if (mission.autonomy === "prepare") return "prepare_only";
  if (mission.autonomy === "approval") return "approval_required";
  return "policy_governed";
}

export function missionActionClass(mission: NexusGrowthMission): ActionClass {
  if (mission.autonomy === "suggest") return "research";
  if (mission.objective === "qualify") return "enrich";
  if (mission.objective === "close") return "offer_response";
  if (mission.objective === "deliver") return "schedule";
  return "draft";
}

export function missionToActionContext(
  mission: NexusGrowthMission,
  evidence: NexusMissionAgenticEvidence = {},
): ActionContext {
  const actionClass = missionActionClass(mission);
  const isClosing = actionClass === "offer_response";

  return {
    actionClass,
    agentId: `nexus_${mission.role}`,
    reversibility: isClosing ? "partial" : "reversible",
    recipients: isClosing ? 1 : undefined,
    involvesPersonalData:
      mission.role === "sales_sdr" || mission.role === "closer" || mission.role === "customer_success",
    channel: isClosing ? "email" : "internal",
    legalSensitive: false,
    agentConfidence: evidence.agentConfidence,
    historicalAccuracy: evidence.historicalAccuracy,
    dataQuality: evidence.dataQuality,
    permission:
      evidence.permission ?? (mission.autonomy === "approval" ? "requires-approval" : "allowed"),
  };
}

export function buildNexusMissionAgenticPlan(
  mission: NexusGrowthMission,
  evidence: NexusMissionAgenticEvidence = {},
): NexusMissionAgenticPlan {
  const actionContext = missionToActionContext(mission, evidence);
  const policyDecision = decideAutonomy(actionContext);
  const floor = missionFloor(mission);
  const effectiveMode = floor ? stricterMode(policyDecision.mode, floor) : policyDecision.mode;
  const capability = capabilityFor(mission);

  let guardrailReason: string | null = null;
  if (capability === "recommendation_only") {
    guardrailReason = "Mission har kun suggest-fullmakt; Nexus kan analysere internt, men ikke forberede eller utføre ekstern handling.";
  } else if (floor && effectiveMode !== policyDecision.mode) {
    guardrailReason = `Mission-kontrakten strammer policy fra ${policyDecision.mode} til ${effectiveMode}.`;
  } else if (policyDecision.hardGate) {
    guardrailReason = policyDecision.hardGate;
  }

  const externalSideEffectAllowed =
    capability === "policy_governed" &&
    effectiveMode === "live" &&
    actionContext.channel !== "internal" &&
    actionContext.permission === "allowed";

  return {
    missionId: mission.id,
    opportunityId: mission.opportunityId,
    agentId: actionContext.agentId,
    actionClass: actionContext.actionClass,
    capability,
    actionContext,
    policyDecision,
    effectiveMode,
    guardrailReason,
    externalSideEffectAllowed,
  };
}
