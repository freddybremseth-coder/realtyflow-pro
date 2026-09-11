import assert from "node:assert/strict";
import test from "node:test";
import { buildRevenueBrain } from "./revenue-brain";
import type { RevenueCommandCenter } from "@/lib/revenue/command";

function command(actions: RevenueCommandCenter["topActions"]): RevenueCommandCenter {
  return {
    generatedAt: "2026-09-11T18:00:00.000Z",
    headline: "Test",
    summary: {
      criticalActions: 0,
      highActions: 0,
      activeDeals: 0,
      forecast30Commission: 0,
      forecast90Commission: 0,
      overdueCommission: 0,
      readyToInvoiceCommission: 0,
      monthlyRecurringRevenue: 0,
      annualRecurringRevenue: 0,
      potentialAnnualRecurringRevenue: 0,
      recoverNow: 0,
      recoveryValue: 0,
      approvalReady: 0,
      closingHighRisk: 0,
      afterSalesDue: 0,
      dataQualityScore: 100,
    },
    workstreams: [],
    topActions: actions,
    warnings: [],
    safety: {
      readOnly: true,
      automaticSending: false,
      automaticApproval: false,
      automaticPipelineChanges: false,
    },
  };
}

test("Revenue Brain ranks commercial urgency but remains read-only", () => {
  const brain = buildRevenueBrain(command([
    {
      id: "followup-1",
      source: "today",
      priority: "HIGH",
      score: 82,
      title: "Prioritert salgsoppfølging",
      subject: "Kari",
      description: "Følg opp kunden.",
      value: 0,
      href: "/customers/kari",
      contactId: "kari",
    },
    {
      id: "closing-1",
      source: "closing",
      priority: "CRITICAL",
      score: 112,
      title: "Closing med høy risiko",
      subject: "Ola",
      description: "Avklar kontrakten.",
      value: 18000,
      href: "/closing",
      contactId: "ola",
    },
  ]));

  assert.equal(brain.mode, "READ_ONLY_V1");
  assert.equal(brain.actions[0]?.id, "closing-1");
  assert.equal(brain.actions[0]?.policyClass, "HUMAN_REQUIRED");
  assert.equal(brain.actions[1]?.policyClass, "DRAFT_ONLY");
  assert.equal(brain.actions.every((item) => item.automaticExecutionAllowed === false), true);
  assert.deepEqual(brain.safety, {
    readOnly: true,
    automaticExecution: false,
    automaticSending: false,
    automaticApproval: false,
    automaticCriteriaChanges: false,
    explicitPolicyRequiredForFutureAutonomy: true,
  });
});

test("Revenue Brain deduplicates multiple opportunities for the same contact", () => {
  const brain = buildRevenueBrain(command([
    {
      id: "today-same",
      source: "today",
      priority: "HIGH",
      score: 80,
      title: "Follow-up",
      subject: "Same customer",
      description: "Follow up.",
      value: 0,
      href: "/customers/1",
      contactId: "contact-1",
    },
    {
      id: "closing-same",
      source: "closing",
      priority: "CRITICAL",
      score: 108,
      title: "Closing",
      subject: "Same customer",
      description: "Protect the deal.",
      value: 12000,
      href: "/closing",
      contactId: "contact-1",
    },
  ]));

  assert.equal(brain.actions.length, 1);
  assert.equal(brain.actions[0]?.id, "closing-same");
  assert.equal(brain.summary.considered, 2);
  assert.equal(brain.summary.ranked, 1);
});

test("Revenue Brain limits output and includes explainable rationale", () => {
  const actions = Array.from({ length: 15 }, (_, index) => ({
    id: `recovery-${index}`,
    source: "recovery" as const,
    priority: "HIGH" as const,
    score: 80 - index,
    title: "Recovery",
    subject: `Customer ${index}`,
    description: "Prepare recovery follow-up.",
    value: 1000 + index * 100,
    href: "/recovery",
    contactId: `contact-${index}`,
  }));

  const brain = buildRevenueBrain(command(actions), 5);
  assert.equal(brain.actions.length, 5);
  assert.equal(brain.actions[0]?.rank, 1);
  assert.equal(brain.actions[4]?.rank, 5);
  assert.equal(brain.actions.every((item) => item.rationale.some((line) => line.includes("Revenue Brain-score"))), true);
  assert.equal(brain.summary.autoSafe, 0);
});
