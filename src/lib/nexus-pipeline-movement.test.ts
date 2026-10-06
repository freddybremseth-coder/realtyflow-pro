import assert from "node:assert/strict";
import test from "node:test";
import { assessPipelineMovement } from "./nexus-pipeline-movement";

const now = new Date("2026-09-07T18:00:00.000Z");

test("keeps planned waiting out of stagnation", () => {
  const result = assessPipelineMovement({ id:"1", email:"a@example.com", pipeline_status:"ON_HOLD", waiting_on:"customer", waiting_until:"2026-10-01T10:00:00.000Z", waiting_reason:"Kunden kommer i oktober" }, now);
  assert.equal(result?.cause, "waiting_planned");
  assert.equal(result?.needsAction, false);
});

test("treats ON_HOLD without a waiting date as fail-closed", () => {
  const result = assessPipelineMovement({ id:"hold-no-date", email:"hold@example.com", pipeline_status:"ON_HOLD" }, now);
  assert.equal(result?.cause, "waiting_planned");
  assert.equal(result?.needsAction, false);
  assert.match(result?.action || "", /ventedato/i);
});

test("excludes terminal reply classifications even if stage is still qualified", () => {
  const result = assessPipelineMovement({ id:"stale-terminal", email:"x@example.com", pipeline_status:"QUALIFIED", last_reply_classification:"no_longer_buying" }, now);
  assert.equal(result, null);
});

test("moves qualified buyers with direction toward matching", () => {
  const result = assessPipelineMovement({ id:"2", email:"b@example.com", pipeline_status:"QUALIFIED", preferred_location:"Altea", last_contact:"2026-09-01T10:00:00.000Z" }, now);
  assert.equal(result?.cause, "ready_for_matching");
  assert.equal(result?.targetStage, "MATCHING");
});

test("flags qualified buyers without direction without advancing them", () => {
  const result = assessPipelineMovement({ id:"3", email:"c@example.com", pipeline_status:"QUALIFIED", last_contact:"2026-09-01T10:00:00.000Z" }, now);
  assert.equal(result?.cause, "missing_buyer_direction");
  assert.equal(result?.targetStage, null);
  assert.equal(result?.priority, "MEDIUM");
  assert.match(result?.action || "", /fortsatt er aktuelt/i);
});

test("surfaces unknown pipeline states as data quality", () => {
  const result = assessPipelineMovement({ id:"4", email:"d@example.com", pipeline_status:"paid" }, now);
  assert.equal(result?.cause, "data_quality");
  assert.equal(result?.priority, "CRITICAL");
});
