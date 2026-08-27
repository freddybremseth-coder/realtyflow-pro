import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { createAdminSession, getAdminEmails } from "@/lib/admin-auth";
import { bestEffortNexusAutomationAudit } from "@/lib/nexus-automation-audit";
import { nexusInternalApiErrorMessage } from "@/lib/nexus-internal-api-error";
import {
  loadNexusMissionStateSnapshot,
  loadNexusRevenueCommandSnapshot,
} from "@/lib/nexus-command-readers";
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

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function internalOwnerHeaders() {
  const ownerEmail = getAdminEmails()[0];
  if (!ownerEmail) return null;
  const session = await createAdminSession(ownerEmail, "OWNER");
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("cookie", `realtyflow_admin=${encodeURIComponent(session)}`);
  return headers;
}

async function postMission(request: NextRequest, headers: Headers, path: string, missionId: string) {
  const response = await fetch(new URL(path, request.nextUrl.origin), {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({ missionId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(nexusInternalApiErrorMessage(path, response.status, body));
  return body;
}

function stateForMission(states: MissionAutopilotState[], missionId: string) {
  return states.find((state) => state.missionId === missionId) || null;
}

export async function GET(request: NextRequest) {
  const denied = requireCronApi(request);
  if (denied) return denied;

  const startedAt = new Date().toISOString();
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  let command: { growthMissions?: MissionAutopilotMission[] };
  let statePayload: { states?: MissionAutopilotState[] };
  try {
    [command, statePayload] = await Promise.all([
      loadNexusRevenueCommandSnapshot(supabase),
      loadNexusMissionStateSnapshot(supabase),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await bestEffortNexusAutomationAudit(supabase as never, {
      name: "Nexus Mission Autopilot",
      path: "/api/cron/nexus-mission-autopilot",
      status: "error",
      error: message,
      startedAt,
      output: { stage: "read_command_state_direct" },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const missions = command.growthMissions || [];
  let states = statePayload.states || [];
  const initialPlan = planMissionAutopilot(missions, states, 8);
  const selectedMissionIds = [...new Set(initialPlan.map((item) => item.missionId))];
  const results: Array<{ missionId: string; actions: string[]; finalState?: string | null; error?: string }> = [];

  let headers: Headers | null = null;
  if (selectedMissionIds.length) {
    headers = await internalOwnerHeaders().catch(() => null);
    if (!headers) {
      const error = "Could not create internal owner session for mission mutations";
      await bestEffortNexusAutomationAudit(supabase as never, {
        name: "Nexus Mission Autopilot",
        path: "/api/cron/nexus-mission-autopilot",
        status: "error",
        error,
        startedAt,
        input: { selectedMissionIds, candidateMissions: missions.length },
        output: { stage: "internal_owner_session_for_actions" },
      });
      return NextResponse.json({ error }, { status: 503 });
    }
  }

  for (const missionId of selectedMissionIds) {
    const mission = missions.find((item) => item.id === missionId);
    if (!mission || !headers) continue;
    const actions: string[] = [];
    let errorMessage: string | undefined;

    for (let step = 0; step < 3; step += 1) {
      const planned = nextMissionAutopilotAction(mission, stateForMission(states, missionId));
      if (!planned) break;
      try {
        await postMission(request, headers, endpointForAction[planned.action], missionId);
        actions.push(planned.action);
        const refreshed = await loadNexusMissionStateSnapshot(supabase);
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
  const responseBody = {
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
      note: "Autopilot reads Revenue Command and Mission State directly from the canonical Supabase models. Mutations still pass through the existing governed mission APIs.",
    },
  };

  const audit = await bestEffortNexusAutomationAudit(supabase as never, {
    name: "Nexus Mission Autopilot",
    path: "/api/cron/nexus-mission-autopilot",
    status: errors === 0 ? "success" : "error",
    input: { selectedMissionIds, candidateMissions: missions.length, directRead: true },
    output: responseBody,
    error: errors === 0 ? null : `${errors} mission error(s)`,
    startedAt,
    finishedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ...responseBody, audit });
}
