import assert from "node:assert/strict";
import test from "node:test";
import { measureExecutionThroughputHealth } from "./execution-throughput-health";

function rec(id: string, contact = `contact-${id}`) {
  return {
    id: `event-${id}`,
    event_type: "automation_recommended",
    contact_id: contact,
    source_system: "nexus_revenue_brain",
    source_id: id,
    metadata: { recommendation_id: id },
  };
}

function exec(id: string, contact = `contact-${id}`) {
  return {
    id: `execution-${id}`,
    event_type: "automation_executed",
    contact_id: contact,
    source_system: "nexus_revenue_brain",
    source_id: id,
    metadata: { recommendation_id: id, execution_evidence: "human_confirmed" },
  };
}

test("marks recommendation backlog with zero execution as degraded", () => {
  const result = measureExecutionThroughputHealth([rec("a"), rec("b")]);
  assert.equal(result.state, "DEGRADED");
  assert.equal(result.recommendations, 2);
  assert.equal(result.executedRecommendations, 0);
  assert.equal(result.openRecommendationBacklog, 2);
  assert.equal(result.executionRate, 0);
  assert.ok(result.reasons.includes("recommendation_backlog_without_execution"));
});

test("becomes active only when execution evidence exists", () => {
  const result = measureExecutionThroughputHealth([rec("a"), rec("b"), exec("a")]);
  assert.equal(result.state, "ACTIVE");
  assert.equal(result.executedRecommendations, 1);
  assert.equal(result.executionRate, 50);
  assert.equal(result.linkedExecutionCoverage, 100);
});

test("does not count approval decisions as execution throughput", () => {
  const result = measureExecutionThroughputHealth([
    rec("a"),
    {
      event_type: "automation_executed",
      source_system: "manual",
      metadata: { agentic_outcome: "approved", subject_type: "message_draft" },
    },
  ]);
  assert.equal(result.state, "DEGRADED");
  assert.equal(result.executedRecommendations, 0);
  assert.equal(result.legacyApprovalEventsMasqueradingAsExecuted, 1);
});

test("portfolio execution can be traceable without a contact", () => {
  const result = measureExecutionThroughputHealth([
    {
      event_type: "automation_executed",
      source_system: "agentic_executor",
      source_id: "approval-social-1",
      metadata: { agentic_outcome: "executed", subject_ref: "publication-1" },
    },
  ]);
  assert.equal(result.state, "IDLE");
  assert.equal(result.untraceableActualExecutions, 0);
});

test("flags actual execution with no contact, source, run or subject identity", () => {
  const result = measureExecutionThroughputHealth([
    { event_type: "automation_executed", source_system: "agentic_executor", metadata: { agentic_outcome: "executed" } },
  ]);
  assert.equal(result.untraceableActualExecutions, 1);
  assert.ok(result.reasons.includes("untraceable_execution_receipts"));
});
