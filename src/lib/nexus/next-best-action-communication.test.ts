import assert from "node:assert/strict";
import test from "node:test";
import { attachCommunicationLearningToRevenueBrain } from "@/lib/nexus/next-best-action-communication";
import type { RevenueBrainSnapshot } from "@/lib/nexus/revenue-brain";

function brain(): RevenueBrainSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_V1",
    actions: [{
      id: "a1",
      rank: 1,
      baseOpportunityScore: 80,
      learningAdjustment: 0,
      opportunityScore: 80,
      priority: "HIGH",
      source: "today",
      title: "Følg opp aktiv kunde",
      subject: "Kunde",
      recommendedAction: "Forbered oppfølging",
      href: "/crm/1",
      contactId: "c1",
      expectedValueEur: 400000,
      policyClass: "DRAFT_ONLY",
      policyActionType: "email.sales_followup_draft",
      policyReason: "Draft only",
      rationale: [],
      automaticExecutionAllowed: false,
    }],
    summary: {
      considered: 1, ranked: 1, critical: 0, humanRequired: 0, draftOnly: 1,
      autoSafe: 0, wait: 0, forbidden: 0, learningAdjusted: 0, representedValueEur: 400000,
    },
    safety: {
      readOnly: true,
      automaticExecution: false,
      automaticSending: false,
      automaticApproval: false,
      automaticCriteriaChanges: false,
      explicitPolicyRequiredForFutureAutonomy: true,
      policyRegistryEnforced: true,
      outcomeLearningRankingOnly: true,
      outcomeLearningCanChangePolicy: false,
    },
  };
}

test("adds evidence-backed timing and content advice without changing policy", () => {
  const result = attachCommunicationLearningToRevenueBrain({
    brain: brain(),
    contacts: [{ id: "c1", brand_id: "zeneco" }],
    rules: [
      { brand_id: "zeneco", dimension: "send_hour_utc", value: "18", sample: 30, reply_rate: 0.42, evidence: "strong", verdict: "prefer", finding: "18 UTC performs best", status: "active" },
      { brand_id: "zeneco", dimension: "message_length", value: "short", sample: 18, reply_rate: 0.34, evidence: "moderate", verdict: "prefer", finding: "Short performs better", status: "active" },
      { brand_id: "zeneco", dimension: "tone", value: "formal", sample: 15, evidence: "moderate", verdict: "avoid", status: "active" },
    ],
  });

  const action = result.actions[0];
  assert.equal(action.policyClass, "DRAFT_ONLY");
  assert.equal(action.automaticExecutionAllowed, false);
  assert.equal(action.communicationAdvice.recommendationOnly, true);
  assert.equal(action.communicationAdvice.timing.preferredHourUtc, 18);
  assert.equal(action.communicationAdvice.message.preferredLength, "short");
  assert.deepEqual(action.communicationAdvice.message.avoidTone, ["formal"]);
  assert.equal(result.communicationLearning.policyCanBeChanged, false);
  assert.equal(result.communicationLearning.customerSendEnabled, false);
});

test("ignores limited and inactive learning rules", () => {
  const result = attachCommunicationLearningToRevenueBrain({
    brain: brain(),
    contacts: [{ id: "c1", brand_id: "zeneco" }],
    rules: [
      { brand_id: "zeneco", dimension: "send_hour_utc", value: "8", sample: 8, evidence: "limited", verdict: "prefer", status: "active" },
      { brand_id: "zeneco", dimension: "message_length", value: "long", sample: 40, evidence: "strong", verdict: "prefer", status: "inactive" },
    ],
  });

  assert.equal(result.actions[0].communicationAdvice.evidence, "none");
  assert.equal(result.actions[0].communicationAdvice.timing.preferredHourUtc, null);
  assert.equal(result.actions[0].communicationAdvice.message.preferredLength, null);
});

test("does not leak one brand's communication learning into another brand", () => {
  const result = attachCommunicationLearningToRevenueBrain({
    brain: brain(),
    contacts: [{ id: "c1", brand_id: "soleada" }],
    rules: [
      { brand_id: "zeneco", dimension: "send_hour_utc", value: "18", sample: 30, evidence: "strong", verdict: "prefer", status: "active" },
    ],
  });

  assert.equal(result.actions[0].communicationAdvice.evidence, "none");
  assert.equal(result.actions[0].communicationAdvice.timing.preferredHourUtc, null);
});
