import assert from "node:assert/strict";
import test from "node:test";
import { buildCommandCenter, type CommandCenterInput } from "@/lib/agentic/command-center";
import type { ApprovalItem } from "@/lib/agentic/approval-gateway";

const appr = (over: Partial<ApprovalItem>): ApprovalItem => ({
  id: "a", title: "t", gatedActionClass: "send_personal", subjectType: "message_draft", status: "pending", ...over,
});

const input: CommandCenterInput = {
  pendingApprovals: [
    appr({ id: "p1", risk: "low", estimatedOpportunityEur: 5000 }),
    appr({ id: "p2", risk: "critical", estimatedOpportunityEur: 1000 }),
    appr({ id: "p3", risk: "high", estimatedOpportunityEur: 20000 }),
  ],
  recentEvents: [
    { eventType: "automation_recommended", outcome: "recommended", revenueImpactEur: 14000 },
    { eventType: "automation_recommended", outcome: "recommended", revenueImpactEur: 8000 },
    { eventType: "automation_executed", outcome: "executed", revenueImpactEur: 12000 },
    { eventType: "note", outcome: "rejected", revenueImpactEur: 5000 },
  ],
};

test("aggregerer tellinger og opportunity", () => {
  const s = buildCommandCenter(input);
  assert.equal(s.pendingCount, 3);
  assert.equal(s.pendingOpportunityEur, 26000);
  assert.equal(s.agentRecommended, 2);
  assert.equal(s.agentExecuted, 1);
});

test("attribuert inntekt teller kun executed/approved med impact", () => {
  const s = buildCommandCenter(input);
  assert.equal(s.attributedRevenueEur, 12000); // ikke recommended, ikke rejected
});

test("next best actions sorteres kritisk→høy→lav, maks 5", () => {
  const s = buildCommandCenter(input);
  assert.deepEqual(s.nextBestActions.map((a) => a.id), ["p2", "p3", "p1"]);
});

test("tomt inn → nuller, ingen krasj", () => {
  const s = buildCommandCenter({ pendingApprovals: [], recentEvents: [] });
  assert.equal(s.pendingCount, 0);
  assert.equal(s.attributedRevenueEur, 0);
  assert.deepEqual(s.nextBestActions, []);
});
