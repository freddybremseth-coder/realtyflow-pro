import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { sha256 } from "@/lib/agentic/ids";
import { buildCustomerProfileCompleteness, type BuyerCriterionInput } from "@/lib/customer-360";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { NexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";

export interface RealEstateQualificationContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_value?: number | null;
  property_interest?: string | null;
  next_followup?: string | null;
  notes?: string | null;
  brand_id?: string | null;
}

export interface RealEstateBuyerProfileInput {
  id?: string | null;
  budget_amount?: number | null;
  budget_currency?: string | null;
  purchase_readiness?: string | null;
  summary?: string | null;
}

export function canPrepareRealEstateQualificationMission(
  mission: NexusGrowthMission,
  plan: NexusMissionAgenticPlan,
) {
  return (
    mission.pipelineId === "real_estate_sales" &&
    mission.role === "sales_sdr" &&
    mission.objective === "qualify" &&
    plan.actionClass === "enrich" &&
    plan.capability === "prepare_only" &&
    plan.effectiveMode === "draft-first"
  );
}

export function buildRealEstateQualificationBrief(
  mission: NexusGrowthMission,
  contact: RealEstateQualificationContact,
  buyerProfile: RealEstateBuyerProfileInput | null,
  criteria: BuyerCriterionInput[] = [],
) {
  const completeness = buildCustomerProfileCompleteness(
    {
      email: contact.email,
      phone: contact.phone,
      pipeline_value: Number(buyerProfile?.budget_amount || contact.pipeline_value || 0),
      property_interest: contact.property_interest,
      next_followup: contact.next_followup,
    },
    criteria,
  );

  const missing = [...completeness.missing];
  if (!buyerProfile?.id) missing.unshift("Strukturert Buyer Profile");
  const uniqueMissing = [...new Set(missing)];
  const contactName = String(contact.name || contact.email || "kjøper").trim();
  const hasProfile = Boolean(buyerProfile?.id);
  const nextAction = hasProfile
    ? `Oppdater Buyer Profile med verifiserte mangler (${uniqueMissing.slice(0, 4).join(", ") || "ingen kritiske mangler"}) og kjør deretter property matching mot dokumenterte kriterier.`
    : `Opprett Buyer Profile fra dokumenterte CRM-fakta, verifiser ${uniqueMissing.slice(0, 4).join(", ") || "kjøpskriteriene"}, og kjør deretter property matching.`;

  return {
    title: `Kvalifiser kjøperprofil: ${contactName}`,
    description: [
      `Nexus qualification brief for en ${mission.priority.toLowerCase()} prioritert kjøpersak.`,
      `CRM-signal: ${mission.whyNow}`,
      `Anbefalt neste steg: ${mission.nextAction}`,
      buyerProfile?.summary ? `Eksisterende Buyer Profile: ${buyerProfile.summary}` : "Det finnes ingen strukturert Buyer Profile for kontakten ennå.",
      `Profilgrunnlag: ${completeness.score}% komplett etter dokumenterte kriterier.`,
      `Mangler: ${uniqueMissing.join(", ") || "ingen registrerte mangler"}.`,
      "Dette er et internt qualification/matching-artefakt. Ingen kundemelding er sendt.",
    ].join("\n"),
    nextAction,
    completeness,
    missing: uniqueMissing,
    metadata: {
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      contact_id: contact.id,
      buyer_profile_id: buyerProfile?.id || null,
      buyer_profile_exists: hasProfile,
      completeness_score: completeness.score,
      missing: uniqueMissing,
      crm_property_interest: contact.property_interest || null,
      crm_pipeline_value: Number(contact.pipeline_value || 0) || null,
      buyer_profile_budget: Number(buyerProfile?.budget_amount || 0) || null,
      buyer_profile_currency: buyerProfile?.budget_currency || null,
      purchase_readiness: buyerProfile?.purchase_readiness || null,
      source_reason: mission.whyNow,
      source_next_action: mission.nextAction,
      external_action_executed: false,
    },
  };
}

export function preparedQualificationTraceStep(
  run: AgentRun,
  mission: NexusGrowthMission,
  workItemId: string,
  now = new Date(),
): AgentTraceStep {
  return {
    id: `step_${sha256(`${run.id}:qualification_prepared:${mission.id}:${workItemId}`).slice(0, 24)}`,
    ts: now.toISOString(),
    kind: "tool_result",
    label: "Real estate qualification brief prepared",
    inputSummary: mission.nextAction,
    outputSummary: `Qualification work item ${workItemId} prepared; no CRM criteria changed and nothing sent.`,
    outcome: "executed",
    data: {
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      transition: "prepared",
      artifact_type: "qualification_work_item",
      artifact_id: workItemId,
      external_action_executed: false,
    },
  };
}
