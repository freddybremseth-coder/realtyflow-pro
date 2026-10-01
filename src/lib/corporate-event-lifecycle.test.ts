import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCorporateEventSignal,
  CORPORATE_EVENT_SIGNAL_GUARDRAILS,
} from "./corporate-event-lifecycle";

test("attendance records engagement without sales automation", () => {
  const result = applyCorporateEventSignal({
    currentStatus: "REGISTERED",
    signal: "ATTENDED",
    occurredAt: "2026-09-28T12:00:00.000Z",
  });
  assert.equal(result.status, "ATTENDED");
  assert.equal(result.attended_at, "2026-09-28T12:00:00.000Z");
  assert.equal(CORPORATE_EVENT_SIGNAL_GUARDRAILS.automaticPipelineChange, false);
  assert.equal(CORPORATE_EVENT_SIGNAL_GUARDRAILS.automaticProspectQualification, false);
  assert.equal(CORPORATE_EVENT_SIGNAL_GUARDRAILS.automaticOutreach, false);
});

test("CTA click never overrides a later assessment request", () => {
  const result = applyCorporateEventSignal({
    currentStatus: "ASSESSMENT_REQUESTED",
    signal: "CTA_CLICKED",
    occurredAt: "2026-09-28T12:10:00.000Z",
  });
  assert.equal(result.status, "ASSESSMENT_REQUESTED");
  assert.equal(result.cta_clicked_at, "2026-09-28T12:10:00.000Z");
});

test("documented attendance cannot be downgraded to no-show", () => {
  assert.throws(() => applyCorporateEventSignal({
    currentStatus: "ATTENDED",
    signal: "NO_SHOW",
    occurredAt: "2026-09-28T12:15:00.000Z",
  }), /Kan ikke nedgradere/);
});
