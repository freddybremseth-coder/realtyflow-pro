import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { sha256 } from "@/lib/agentic/ids";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { NexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";

export interface NexusAiDemoOrder {
  id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  company_name?: string | null;
  package_id?: string | null;
  status?: string | null;
  billing_status?: string | null;
  preview_url?: string | null;
  claim_url?: string | null;
}

export interface NexusAiPreparedMessage {
  subject: string;
  body: string;
}

const PREPARABLE_STAGES = new Set(["new_lead", "qualified", "demo_or_solution"]);

export function canPrepareAiDemoMission(mission: NexusGrowthMission, plan: NexusMissionAgenticPlan) {
  return (
    mission.pipelineId === "ai_products_services" &&
    mission.role === "sales_sdr" &&
    PREPARABLE_STAGES.has(mission.stageId) &&
    plan.actionClass === "draft" &&
    plan.capability === "prepare_only" &&
    plan.effectiveMode === "draft-first"
  );
}

function firstName(value?: string | null) {
  const name = String(value || "").trim();
  return name ? name.split(/\s+/)[0] : "der";
}

function safeLink(value?: string | null) {
  const link = String(value || "").trim();
  return /^https?:\/\//i.test(link) ? link : "";
}

export function composeAiDemoMissionDraft(
  mission: NexusGrowthMission,
  order: NexusAiDemoOrder,
): NexusAiPreparedMessage {
  const hello = `Hei ${firstName(order.customer_name)},`;
  const company = String(order.company_name || "").trim();
  const preview = safeLink(order.preview_url);
  const claim = safeLink(order.claim_url);
  const demoLine = preview ? `\n\nDu kan se demoen her: ${preview}` : "";
  const claimLine = claim ? `\n\nHvis du ønsker å gå videre med denne demoen, finner du claim-siden her: ${claim}` : "";

  if (mission.stageId === "new_lead") {
    return {
      subject: company ? `Oppfølging på AI-demoen for ${company}` : "Oppfølging på AI-demoen",
      body: `${hello}\n\nJeg følger opp interessen din for demoen. Før vi går videre vil jeg gjerne forstå hvilket konkret problem eller resultat du ønsker at løsningen skal hjelpe med, og hvem som er med på beslutningen.${demoLine}\n\nSvar gjerne kort med det viktigste use-caset, så kan vi gjøre neste steg mer relevant.\n\nVennlig hilsen\nFreddy`,
    };
  }

  if (mission.stageId === "qualified") {
    return {
      subject: company ? `Neste steg for demoen til ${company}` : "Neste steg for AI-demoen",
      body: `${hello}\n\nJeg følger opp demoen for å sikre at vi bygger videre på riktig behov. Det viktigste nå er å bekrefte use-case, hvem som skal bruke løsningen, og hva som må være på plass for at dere skal kunne vurdere den ordentlig.${demoLine}\n\nSend meg gjerne en kort oppdatering, så tar vi neste steg derfra.\n\nVennlig hilsen\nFreddy`,
    };
  }

  return {
    subject: company ? `Oppfølging på demoen for ${company}` : "Oppfølging på AI-demoen",
    body: `${hello}\n\nJeg følger opp demoen mens den er fersk. Se gjerne gjennom den konkrete løsningen og gi meg beskjed om hva som treffer behovet, hva som mangler, og hvilket spørsmål som eventuelt står i veien for neste beslutningssteg.${demoLine}${claimLine}\n\nDa kan vi avklare neste steg uten å gjøre prosessen mer komplisert enn nødvendig.\n\nVennlig hilsen\nFreddy`,
  };
}

export function preparedAiMissionTraceStep(
  run: AgentRun,
  mission: NexusGrowthMission,
  draftId: string,
  now = new Date(),
): AgentTraceStep {
  return {
    id: `step_${sha256(`${run.id}:prepared-ai:${mission.id}:${draftId}`).slice(0, 24)}`,
    ts: now.toISOString(),
    kind: "tool_result",
    label: "AI/SaaS demo follow-up draft prepared",
    tool: "create_draft",
    inputSummary: mission.nextAction,
    outputSummary: `Draft ${draftId} prepared; nothing sent.`,
    outcome: "executed",
    data: {
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      transition: "prepared",
      artifact_type: "message_draft",
      draft_id: draftId,
      channel: "email",
      domain: "ai_products_services",
      external_action_executed: false,
    },
  };
}
