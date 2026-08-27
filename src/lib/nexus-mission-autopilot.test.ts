import assert from "node:assert/strict";
import test from "node:test";
import { nextMissionAutopilotAction, planMissionAutopilot } from "./nexus-mission-autopilot";

const baseMission = {
  id: "mission:1",
  pipelineId: "real_estate_sales",
  role: "sales_sdr",
  autonomy: "prepare",
  priority: "HIGH",
  priorityScore: 90,
};

test("starts only high-priority prepare missions", () => {
  assert.equal(nextMissionAutopilotAction(baseMission)?.action, "advance");
  assert.equal(nextMissionAutopilotAction({ ...baseMission, autonomy: "approval" }), null);
  assert.equal(nextMissionAutopilotAction({ ...baseMission, priority: "MEDIUM", priorityScore: 60 }), null);
});

test("routes awaiting preparation to the correct business preparer", () => {
  assert.equal(nextMissionAutopilotAction(baseMission, { missionId: baseMission.id, operationalState: "awaiting_preparation" })?.action, "prepare_real_estate");
  assert.equal(nextMissionAutopilotAction({ ...baseMission, pipelineId: "ai_products_services" }, { missionId: baseMission.id, operationalState: "awaiting_preparation" })?.action, "prepare_ai");
  assert.equal(nextMissionAutopilotAction({ ...baseMission, pipelineId: "publishing", role: "content_influencer" }, { missionId: baseMission.id, operationalState: "awaiting_preparation" })?.action, "prepare_publishing");
});

test("only real customer message drafts enter send approval", () => {
  assert.equal(nextMissionAutopilotAction(baseMission, { missionId: baseMission.id, operationalState: "prepared", draftId: "draft-1" })?.action, "request_send_approval");
  assert.equal(nextMissionAutopilotAction({ ...baseMission, pipelineId: "publishing" }, { missionId: baseMission.id, operationalState: "prepared", draftId: "draft-1" }), null);
  assert.equal(nextMissionAutopilotAction(baseMission, { missionId: baseMission.id, operationalState: "prepared", draftId: null }), null);
});

test("never autopilots closer or human-required missions", () => {
  const closer = { ...baseMission, role: "closer", autonomy: "approval" };
  assert.equal(nextMissionAutopilotAction(closer, { missionId: closer.id, operationalState: "pending" }), null);
});

test("portfolio planner prioritizes score and respects limit", () => {
  const missions = [
    { ...baseMission, id: "m1", priorityScore: 81 },
    { ...baseMission, id: "m2", priorityScore: 97 },
    { ...baseMission, id: "m3", priorityScore: 88 },
  ];
  const plan = planMissionAutopilot(missions, [], 2);
  assert.deepEqual(plan.map((item) => item.missionId), ["m2", "m3"]);
});
