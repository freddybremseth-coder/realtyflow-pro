export type MissionAutopilotAction =
  | "advance"
  | "prepare_real_estate"
  | "prepare_real_estate_qualification"
  | "prepare_ai"
  | "prepare_publishing"
  | "request_send_approval";

export interface MissionAutopilotMission {
  id: string;
  pipelineId: string;
  role: string;
  autonomy: string;
  priority: string;
  priorityScore: number;
  actionClass?: string | null;
}

export interface MissionAutopilotState {
  missionId: string;
  operationalState?: string | null;
  draftId?: string | null;
}

export interface MissionAutopilotPlanItem {
  missionId: string;
  action: MissionAutopilotAction;
  reason: string;
}

function eligiblePriority(mission: MissionAutopilotMission) {
  return mission.priority === "CRITICAL" || mission.priority === "HIGH" || Number(mission.priorityScore || 0) >= 80;
}

export function nextMissionAutopilotAction(
  mission: MissionAutopilotMission,
  state?: MissionAutopilotState | null,
): MissionAutopilotPlanItem | null {
  if (!eligiblePriority(mission)) return null;
  if (mission.autonomy !== "prepare") return null;
  if (!["real_estate_sales", "ai_products_services", "publishing"].includes(mission.pipelineId)) return null;

  const operationalState = state?.operationalState || null;
  if (!operationalState || operationalState === "pending") {
    return { missionId: mission.id, action: "advance", reason: "High-priority prepare mission has not entered governance yet." };
  }

  if (operationalState === "awaiting_preparation") {
    if (mission.pipelineId === "real_estate_sales" && mission.role === "sales_sdr") {
      if (mission.actionClass === "enrich") {
        return {
          missionId: mission.id,
          action: "prepare_real_estate_qualification",
          reason: "Real-estate qualification mission needs an internal Buyer Intelligence brief, not a customer email draft.",
        };
      }
      if (mission.actionClass === "draft") {
        return {
          missionId: mission.id,
          action: "prepare_real_estate",
          reason: "Real-estate Sales/SDR draft mission is ready for its customer-message preparer.",
        };
      }
      return null;
    }
    if (mission.pipelineId === "ai_products_services" && mission.role === "sales_sdr" && mission.actionClass === "draft") {
      return { missionId: mission.id, action: "prepare_ai", reason: "AI Sales/SDR draft mission is ready for its DemoSites preparer." };
    }
    if (mission.pipelineId === "publishing") {
      return { missionId: mission.id, action: "prepare_publishing", reason: "Publishing mission is ready for an internal Book Growth brief." };
    }
    return null;
  }

  if (
    operationalState === "prepared" &&
    state?.draftId &&
    mission.actionClass === "draft" &&
    ["real_estate_sales", "ai_products_services"].includes(mission.pipelineId)
  ) {
    return { missionId: mission.id, action: "request_send_approval", reason: "A real customer message draft exists; queue it for human approval without sending." };
  }

  return null;
}

export function planMissionAutopilot(
  missions: MissionAutopilotMission[],
  states: MissionAutopilotState[] = [],
  limit = 8,
) {
  const stateByMission = new Map(states.map((state) => [state.missionId, state]));
  return missions
    .slice()
    .sort((a, b) => Number(b.priorityScore || 0) - Number(a.priorityScore || 0))
    .map((mission) => nextMissionAutopilotAction(mission, stateByMission.get(mission.id)))
    .filter((item): item is MissionAutopilotPlanItem => Boolean(item))
    .slice(0, Math.max(0, limit));
}
