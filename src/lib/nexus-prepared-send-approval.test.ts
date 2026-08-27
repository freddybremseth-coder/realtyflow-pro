import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRun } from "@/lib/agentic/schemas";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import {
  preparedDraftApprovalInput,
  preparedDraftIdFromRun,
  sendApprovalTraceStep,
  sendPersonalDecisionForPreparedDraft,
} from "@/lib/nexus-prepared-send-approval";

const mission: NexusGrowthMission = {
  id: "mission:opp:1:qualified",
  opportunityId: "opp:1",
  brandId: "zeneco",
  pipelineId: "real_estate_sales",
  stageId: "qualified",
  role: "sales_sdr",
  objective: "qualify",
  title: "Følg opp kjøper",
  nextAction: "Send en kort oppfølging",
  whyNow: "Kunden er aktiv og trenger neste steg.",
  desiredOutcome: "Avklart interesse og timing",
  priority: "HIGH",
  priorityScore: 88,
  expectedValue: 500000,
  currency: "EUR",
  dueInHours: 8,
  autonomy: "prepare",
  href: "/customers",
};

const run: AgentRun = {
  id: "run_1",
  agentId: "nexus_sales_sdr",
  goal: "Flytt saken videre",
  status: "pending",
  correlationId: "rf_1",
  idempotencyKey: "mission_key",
  startedAt: "2026-08-27T00:00:00Z",
  steps: [
    {
      id: "step_prepared",
      ts: "2026-08-27T00:01:00Z",
      kind: "tool_result",
      label: "Prepared",
      data: { mission_id: mission.id, transition: "prepared", draft_id: "draft_1" },
    },
  ],
};

test("prepared draft id is read only from a matching prepared transition", () => {
  assert.equal(preparedDraftIdFromRun(run, mission.id), "draft_1");
  assert.equal(preparedDraftIdFromRun(run, "mission:other"), null);
});

test("prepared customer communication can never become a live send", () => {
  const decision = sendPersonalDecisionForPreparedDraft(run);
  assert.notEqual(decision.mode, "live");
});

test("send approval references the persisted message draft and real recipient", () => {
  const input = preparedDraftApprovalInput(mission, run, {
    id: "draft_1",
    contactRef: "buyer@example.com",
    channel: "email",
    subject: "Oppfølging",
    body: "Hei",
    status: "draft",
  });
  assert.equal(input.gatedActionClass, "send_personal");
  assert.equal(input.subjectType, "message_draft");
  assert.equal(input.subjectRef, "draft_1");
  assert.equal(input.draftId, "draft_1");
  assert.equal(input.customerRef, "buyer@example.com");
  assert.equal(input.confidence, undefined);
  assert.notEqual(input.decisionMode, "live");
});

test("approval trace records that no external action executed", () => {
  const step = sendApprovalTraceStep(run, mission, "approval_1", "draft_1", new Date("2026-08-27T00:02:00Z"));
  assert.equal(step.data?.transition, "request_send_approval");
  assert.equal(step.data?.draft_id, "draft_1");
  assert.equal(step.data?.approval_id, "approval_1");
  assert.equal(step.data?.external_action_executed, false);
});
