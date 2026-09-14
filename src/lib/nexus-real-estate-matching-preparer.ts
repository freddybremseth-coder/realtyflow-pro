import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { sha256 } from "@/lib/agentic/ids";
import {
  evaluateBuyerProfileHealth,
  type BuyerCriterionHealthInput,
  type BuyerProfileHealthInput,
} from "@/lib/nexus/buyer-profile-health";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { NexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";

export interface RealEstateMatchingContact {
  id: string;
  name?: string | null;
  email?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  pipeline_status?: string | null;
}

export interface RealEstateMatchingBuyerProfile extends BuyerProfileHealthInput {
  id: string;
  version?: number | null;
}

export function canPrepareRealEstateMatchingMission(
  mission: NexusGrowthMission,
  plan: NexusMissionAgenticPlan,
) {
  return (
    mission.pipelineId === "real_estate_sales" &&
    mission.stageId === "property_matching" &&
    mission.role === "sales_sdr" &&
    mission.objective === "advance_stage" &&
    plan.actionClass === "match" &&
    plan.capability === "prepare_only" &&
    plan.effectiveMode === "draft-first"
  );
}

export function matchingWorkItemPriority(priority: unknown): "HIGH" | "MEDIUM" | "LOW" {
  const normalized = String(priority || "MEDIUM").trim().toUpperCase();
  if (normalized === "CRITICAL" || normalized === "HIGH") return "HIGH";
  if (normalized === "LOW") return "LOW";
  return "MEDIUM";
}

export function buildRealEstateMatchingPreparation(
  mission: NexusGrowthMission,
  contact: RealEstateMatchingContact,
  buyerProfile: RealEstateMatchingBuyerProfile,
  criteria: BuyerCriterionHealthInput[],
  now = new Date(),
) {
  const health = evaluateBuyerProfileHealth(buyerProfile, criteria, now);
  const contactName = String(contact.name || contact.email || "kjøper").trim();
  const version = Math.max(1, Number(buyerProfile.version || 1));
  const sourceId = `nexus-matching:${mission.id}:${buyerProfile.id}:v${version}`;
  const ready = String(buyerProfile.status || "").toLowerCase() === "approved" && health.status !== "BLOCKED";
  const nextAction = ready
    ? "Kjør automatisk property matching mot siste godkjente Buyer Profile. Klargjør shortlist for quality review; ingenting sendes til kunden før review/preflight."
    : "Buyer Profile er ikke trygg nok for automatisk matching. Løs dokumenterte blokkeringer før property matching starter.";

  return {
    ready,
    sourceId,
    health,
    title: `Klargjør boligmatching: ${contactName}`,
    description: [
      `Nexus Pro Sales har identifisert en ${mission.priority.toLowerCase()} prioritert matching-mission.`,
      `Pipeline: ${mission.stageId}.`,
      `Buyer Profile v${version}: ${health.status} · ${health.score}/100.`,
      health.warnings.length ? `Varsler: ${health.warnings.join(" | ")}` : "Ingen Buyer Profile-varsler som stopper matching.",
      health.blockers.length ? `Blokkeringer: ${health.blockers.join(" | ")}` : "Ingen Buyer Profile-blokkeringer.",
      "Dette er et internt matching-artefakt. Ingen kundemelding sendes, ingen pipeline-status endres og Buyer Profile endres ikke.",
    ].join("\n"),
    nextAction,
    metadata: {
      kind: "nexus_pro_sales_matching",
      domain: "real_estate",
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      contact_id: contact.id,
      classification: "property_interest",
      buyer_profile_id: buyerProfile.id,
      buyer_profile_status: "APPROVED",
      buyer_profile_version: version,
      buyer_profile_sync_at: now.toISOString(),
      buyer_profile_sync_by: "Nexus Pro Sales Orchestrator",
      buyer_profile_sync_status: "linked_existing",
      buyer_profile_health_status: health.status,
      buyer_profile_health_score: health.score,
      buyer_profile_health_warnings: health.warnings,
      matching_origin: "nexus_mission_autopilot",
      property_match_prepared_at: null,
      shortlist_prepared_at: null,
      external_action_executed: false,
      customer_send: false,
    },
  };
}

export function preparedMatchingTraceStep(
  run: AgentRun,
  mission: NexusGrowthMission,
  workItemId: string,
  buyerProfileId: string,
  now = new Date(),
): AgentTraceStep {
  return {
    id: `step_${sha256(`${run.id}:matching_prepared:${mission.id}:${workItemId}:${buyerProfileId}`).slice(0, 24)}`,
    ts: now.toISOString(),
    kind: "tool_result",
    label: "Real estate matching mission prepared",
    inputSummary: mission.nextAction,
    outputSummary: `Matching work item ${workItemId} prepared from approved Buyer Profile ${buyerProfileId}; nothing sent.`,
    outcome: "executed",
    data: {
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      transition: "prepared",
      artifact_type: "property_matching_work_item",
      artifact_id: workItemId,
      buyer_profile_id: buyerProfileId,
      external_action_executed: false,
      customer_send: false,
    },
  };
}
