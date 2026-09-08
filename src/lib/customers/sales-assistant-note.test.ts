import assert from "node:assert/strict";
import test from "node:test";
import { SalesAssistantNoteAnalysisSchema, shouldCreateFollowupCalendarEvent } from "./sales-assistant-note";

function analysis(overrides: Record<string, unknown> = {}) {
  return SalesAssistantNoteAnalysisSchema.parse({
    polishedNote: "Kunden er fortsatt interessert. Ring om to uker.",
    title: "Telefonoppfølging",
    updateType: "phone_call",
    outcome: "interested",
    nextAction: "Ring kunden og gå gjennom nye alternativer.",
    nextFollowup: "2026-09-22T10:00:00.000Z",
    followupConfidence: 0.96,
    calendarRecommended: true,
    calendarTitle: "Ring kunde – nye alternativer",
    calendarDurationMinutes: 30,
    propertyReference: null,
    explicitFacts: ["Kunden er fortsatt interessert."],
    ...overrides,
  });
}

test("high-confidence explicit follow-up can create a calendar event", () => {
  assert.equal(shouldCreateFollowupCalendarEvent(analysis()), true);
});

test("low-confidence timing never creates a calendar event", () => {
  assert.equal(shouldCreateFollowupCalendarEvent(analysis({ followupConfidence: 0.72 })), false);
});

test("calendar opt-out is respected even with a date", () => {
  assert.equal(shouldCreateFollowupCalendarEvent(analysis({ calendarRecommended: false })), false);
});

test("analysis contract requires polished note and preserves structured follow-up fields", () => {
  const parsed = analysis();
  assert.equal(parsed.updateType, "phone_call");
  assert.equal(parsed.nextAction, "Ring kunden og gå gjennom nye alternativer.");
  assert.equal(parsed.explicitFacts.length, 1);
});
