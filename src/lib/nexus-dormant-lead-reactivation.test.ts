import assert from "node:assert/strict";
import test from "node:test";
import {
  assessDormantLead,
  composeDormantLeadReactivationDraft,
  lastMeaningfulEngagement,
} from "./nexus-dormant-lead-reactivation";

const now = new Date("2026-08-27T10:00:00.000Z");

const baseContact = {
  id: "contact-1",
  name: "Kari Nordmann",
  email: "kari@example.com",
  brandId: "soleada",
  pipelineStatus: "QUALIFIED",
  nurtureStatus: "active",
  propertyInterest: "Albir og områder nær stranden",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const lifestyleCriteria = [
  {
    key: "other",
    other_key: "daily_life:beach_walkability",
    criterion_type: "preference",
    value: true,
    weight: 0.95,
    source: "manual",
    source_text: "Vil kunne gå til stranden",
    confidence: 1,
    customer_confirmed: true,
    approval_status: "approved",
    active: true,
  },
  {
    key: "other",
    other_key: "social:scandinavian",
    criterion_type: "preference",
    value: true,
    weight: 0.8,
    source: "manual",
    source_text: "Trives godt i skandinavisk miljø",
    confidence: 1,
    customer_confirmed: true,
    approval_status: "approved",
    active: true,
  },
  {
    key: "other",
    other_key: "environment:quiet",
    criterion_type: "preference",
    value: true,
    weight: 0.8,
    source: "ai_inference",
    source_text: "Mulig preferanse for ro",
    confidence: 0.55,
    customer_confirmed: false,
    approval_status: "approved",
    active: true,
  },
];

test("uses the newest real engagement signal instead of row freshness", () => {
  assert.equal(
    lastMeaningfulEngagement({
      ...baseContact,
      lastContact: "2025-01-01T00:00:00.000Z",
      latestRevenueEventAt: "2025-02-01T00:00:00.000Z",
      latestNurtureSentAt: "2025-03-01T00:00:00.000Z",
    }),
    "2025-03-01T00:00:00.000Z",
  );
});

test("qualified old lead with verified lifestyle evidence becomes hot dormant", () => {
  const result = assessDormantLead(baseContact, lifestyleCriteria, now);
  assert.equal(result.segment, "hot_dormant");
  assert.equal(result.eligibleForDraft, true);
  assert.ok(result.score >= 75);
  assert.ok(result.lifestyleSummary.includes("daily_life:beach_walkability"));
});

test("recent engagement blocks dormant reactivation even for a qualified lead", () => {
  const result = assessDormantLead(
    { ...baseContact, lastContact: "2026-08-15T00:00:00.000Z" },
    lifestyleCriteria,
    now,
  );
  assert.equal(result.eligibleForDraft, false);
});

test("suppressed or invalid contacts never receive a reactivation draft", () => {
  const assessment = assessDormantLead(
    { ...baseContact, explicitlyOptedOut: true },
    lifestyleCriteria,
    now,
  );
  assert.equal(assessment.segment, "do_not_reactivate");
  assert.equal(composeDormantLeadReactivationDraft(baseContact, lifestyleCriteria, assessment), null);
});

test("draft asserts confirmed preferences but keeps inferred signals as questions", () => {
  const assessment = assessDormantLead(baseContact, lifestyleCriteria, now);
  const draft = composeDormantLeadReactivationDraft(baseContact, lifestyleCriteria, assessment);
  assert.ok(draft);
  assert.match(draft!.body, /gåavstand til stranden/);
  assert.match(draft!.body, /skandinavisk miljø/);
  assert.doesNotMatch(draft!.body, /rolige omgivelser var viktig/);
  assert.equal(draft!.objective, "get_reply");
  assert.equal(draft!.safety.externalActionExecuted, false);
});
