import assert from "node:assert/strict";
import test from "node:test";
import type { PersonaBackfillCandidate } from "@/lib/persona-backfill";
import { decideBuyerProfileAutoActivation } from "./buyer-profile-auto-activation";

function candidate(overrides: Partial<PersonaBackfillCandidate> = {}): PersonaBackfillCandidate {
  return {
    contactId: "contact-1",
    persona: "family",
    confidence: 95,
    evidence: [],
    missingInformation: [],
    reason: "strong CRM evidence",
    requiresHumanReview: true,
    ...overrides,
  };
}

test("complete 95 percent candidate is AUTO eligible", () => {
  const decision = decideBuyerProfileAutoActivation(candidate());
  assert.equal(decision.safety.tier, "AUTO");
  assert.equal(decision.requiredDataComplete, true);
  assert.equal(decision.canAutoActivate, true);
});

test("95 percent candidate with missing required evidence remains REVIEW", () => {
  const decision = decideBuyerProfileAutoActivation(candidate({ missingInformation: ["budsjett"] }));
  assert.equal(decision.safety.tier, "REVIEW");
  assert.equal(decision.canAutoActivate, false);
  assert.match(decision.reason, /budsjett/);
});

test("80 to 94 percent complete candidates stay REVIEW", () => {
  const decision = decideBuyerProfileAutoActivation(candidate({ confidence: 91 }));
  assert.equal(decision.safety.tier, "REVIEW");
  assert.equal(decision.canAutoActivate, false);
});

test("candidate below review threshold escalates to FREDDY", () => {
  const decision = decideBuyerProfileAutoActivation(candidate({ confidence: 72 }));
  assert.equal(decision.safety.tier, "FREDDY");
  assert.equal(decision.canAutoActivate, false);
});

test("missing deterministic persona is never auto activated", () => {
  const decision = decideBuyerProfileAutoActivation(candidate({ persona: null, confidence: 35, missingInformation: ["tydelig formål med boligkjøpet"] }));
  assert.equal(decision.safety.tier, "FREDDY");
  assert.equal(decision.canAutoActivate, false);
});
