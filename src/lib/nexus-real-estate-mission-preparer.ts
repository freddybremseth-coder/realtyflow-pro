import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { sha256 } from "@/lib/agentic/ids";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { NexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";

export interface NexusRealEstateDraftContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface NexusPreparedMessage {
  subject: string;
  body: string;
}

export function canPrepareRealEstateMission(
  mission: NexusGrowthMission,
  plan: NexusMissionAgenticPlan,
) {
  return (
    mission.pipelineId === "real_estate_sales" &&
    mission.role === "sales_sdr" &&
    plan.actionClass === "draft" &&
    plan.capability === "prepare_only" &&
    plan.effectiveMode === "draft-first"
  );
}

function firstName(value?: string | null) {
  const name = String(value || "").trim();
  return name ? name.split(/\s+/)[0] : "der";
}

export function composeRealEstateMissionDraft(
  mission: NexusGrowthMission,
  contact: NexusRealEstateDraftContact,
): NexusPreparedMessage {
  const hello = `Hei ${firstName(contact.name)},`;

  if (mission.stageId === "new_lead") {
    return {
      subject: "Oppfølging på boligsøket ditt",
      body: `${hello}\n\nJeg følger opp henvendelsen din om bolig på Costa Blanca. For at jeg skal kunne velge relevante alternativer, vil jeg gjerne bekrefte område, budsjett, boligtype og når du ser for deg å kjøpe.\n\nSvar gjerne med det som er viktigst for deg, så tar vi neste steg derfra.\n\nVennlig hilsen\nFreddy`,
    };
  }

  if (mission.stageId === "viewing") {
    return {
      subject: "Neste steg i boligsøket ditt",
      body: `${hello}\n\nJeg følger opp boligsøket ditt etter visningene. For å prioritere riktig videre vil jeg gjerne vite hvilke alternativer som traff best, hva som eventuelt manglet, og om du ønsker nye forslag eller en ny visning.\n\nSend meg gjerne en kort tilbakemelding, så tilpasser jeg neste steg.\n\nVennlig hilsen\nFreddy`,
    };
  }

  return {
    subject: "Oppfølging på boligsøket ditt",
    body: `${hello}\n\nJeg følger opp boligsøket ditt for å sikre at vi prioriterer riktig videre. Gi meg gjerne en kort oppdatering på hva som er viktigst akkurat nå, og om krav, område, budsjett eller tidslinje har endret seg.\n\nDa kan jeg tilpasse neste steg til det du faktisk trenger.\n\nVennlig hilsen\nFreddy`,
  };
}

export function preparedMissionTraceStep(
  run: AgentRun,
  mission: NexusGrowthMission,
  draftId: string,
  now = new Date(),
): AgentTraceStep {
  return {
    id: `step_${sha256(`${run.id}:prepared:${mission.id}:${draftId}`).slice(0, 24)}`,
    ts: now.toISOString(),
    kind: "tool_result",
    label: "Real estate customer follow-up draft prepared",
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
      external_action_executed: false,
    },
  };
}
