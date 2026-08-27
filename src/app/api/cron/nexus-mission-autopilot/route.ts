import { NextRequest, NextResponse } from "next/server";
import { requireCronApi } from "@/lib/api-cron";
import { createAdminSession, getAdminEmails } from "@/lib/admin-auth";
import {
  nextMissionAutopilotAction,
  planMissionAutopilot,
  type MissionAutopilotMission,
  type MissionAutopilotState,
  type MissionAutopilotAction,
} from "@/lib/nexus-mission-autopilot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const endpointForAction: Record<MissionAutopilotAction, string> = {
  advance: "/api/nexus/revenue-command/missions/advance",
  prepare_real_estate: "/api/nexus/revenue-command/missions/prepare/real-estate",
  prepare_ai: "/api/nexus/revenue-command/missions/prepare/ai",
  prepare_publishing: "/api/nexus/revenue-command/missions/prepare/publishing",
  request_send_approval: "/api/nexus/revenue-command/missions/approve-send",
};

async function internalOwnerHeaders() {
  const ownerEmail = getAdminEmails()[0];
  if (!ownerEmail) return null;
  const session = await createAdminSession(ownerEmail, "OWNER");
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("cookie", `realtyflow_admin=${encodeURIComponent(session)}`);
  return headers;
}

async function readJson(request: NextRequest, headers: Headers, path: string) {
  const response = await fetch(new URL(path, request.nextUrl.origin), {
    method: "GET",
    cache: "no-store",
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${path} failed (${response.status})`);
  return body;
}

async function postMission(request: NextRequest, headers: Headers, path: string, missionId: string) {
  const response = await fetch(new URL(path, request.nextUrl.origin), {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({ missionId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${path} failed (${response.status})`);
  return body;
}

function stateForMission(states: MissionAutopilotState[], missionId: string) {
  return states.find((state) => state.missionId === missionId) || null;
}

export async function GET(request: NextRequest) {
  const denied = requireCronApi(request);
  if (denied) return denied;

  const headers = await internalOwnerHeaders().catch(() => null);
  if (!headers) return NextResponse.json({ error: "Could not create internal owner session" }, { status: 503 });

  let command: { growthMissions?: MissionAutopilotMission[] };
  let statePayload: { states?: MissionAutopilotState[] };
  try {
    [command, statePayload] = await Promise.all([
      readJson(request, headers, "/api/nexus/revenue-command"),
      readJson(request, headers, "/api/nexus/revenue-command/missions/state"),
    ]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }

  const missions = command.growthMissions || [];
  let states = statePayload.states || [];
  const initialPlan = planMissionAutopilot(missions, states, 8);
  const selectedMissionIds = [...new Set(initialPlan.map((item) => item.missionId))];
  const results: Array<{ missionId: string; actions: string[]; finalState?: string | null; error?: string }> = [];

  for (const missionId of selectedMissionIds) {
    const mission = missions.find((item) => item.id === missionId);
    if (!mission) continue;
    const actions: string[] = [];
    let errorMessage: string | undefined;

    for (let step = 0; step < 3; step += 1) {
      const planned = nextMissionAutopilotAction(mission, stateForMission(states, missionId));
      if (!planned) break;
      try {
        await postMission(request, headers, endpointForAction[planned.action], missionId);
        actions.push(planned.action);
        const refreshed = await readJson(request, headers, "/api/nexus/revenue-command/missions/state");
        states = refreshed.states || states;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        break;
      }
    }

    results.push({
      missionId,
      actions,
      finalState: stateForMission(states, missionId)?.operationalState || null,
      ...(errorMessage ? { error: errorMessage } : {}),
    });
  }

  const errors = results.filter((item) => item.error).length;
  return NextResponse.json({
    ok: errors === 0,
    generatedAt: new Date().toISOString(),
    selected: selectedMissionIds.length,
    processed: results.length,
    errors,
    results,
    safety: {
      priorityGate: "HIGH/CRITICAL or score >= 80",
      autonomyGate: "prepare only",
      externalActionExecuted: false,
      humanApprovalStillRequiredForCustomerSend: true,
      closingAutopilot: false,
      note: "Autopilot may prepare internal artifacts and queue real message drafts for human approval. It never approves or sends them.",
    },
  });
}
