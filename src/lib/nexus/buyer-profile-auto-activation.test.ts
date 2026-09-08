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

const completeProfile = { score: 100, missing: [] as string[] };

test("complete profile plus complete 95 percent persona evidence is AUTO eligible", () => {
  const decision = decideBuyerProfileAutoActivation(candidate(), completeProfile);
  assert.equal(decision.safety.tier, "AUTO");
  assert.equal(decision.personaAutoEligible, true);
  assert.equal(decision.profileComplete, true);
  assert.equal(decision.canAutoActivate, true);
});

test("95 percent persona evidence does not imply a complete Buyer Profile", () => {
  const decision = decideBuyerProfileAutoActivation(candidate(), {
    score: 57,
    missing: ["Boligtype", "Soverom", "Kjøpstidslinje"],
  });
  assert.equal(decision.personaAutoEligible, true);
  assert.equal(decision.profileComplete, false);
  assert.equal(decision.safety.tier, "REVIEW");
  assert.equal(decision.canAutoActivate, false);
  assert.match(decision.reason, /Boligtype/);
});

test("95 percent candidate with missing Persona evidence remains REVIEW", () => {
  const decision = decideBuyerProfileAutoActivation(
    candidate({ missingInformation: ["budsjett"] }),
    completeProfile,
  );
  assert.equal(decision.personaAutoEligible, false);
  assert.equal(decision.safety.tier, "REVIEW");
  assert.equal(decision.canAutoActivate, false);
  assert.match(decision.reason, /budsjett/);
});

test("80 to 94 percent complete candidates stay REVIEW", () => {
  const decision = decideBuyerProfileAutoActivation(candidate({ confidence: 91 }), completeProfile);
  assert.equal(decision.safety.tier, "REVIEW");
  assert.equal(decision.personaAutoEligible, false);
  assert.equal(decision.canAutoActivate, false);
});

test("candidate below review threshold escalates to FREDDY", () => {
  const decision = decideBuyerProfileAutoActivation(candidate({ confidence: 72 }), completeProfile);
  assert.equal(decision.safety.tier, "FREDDY");
  assert.equal(decision.canAutoActivate, false);
});

test("missing deterministic persona is never auto activated", () => {
  const decision = decideBuyerProfileAutoActivation(
    candidate({ persona: null, confidence: 35, missingInformation: ["tydelig formål med boligkjøpet"] }),
    completeProfile,
  );
  assert.equal(decision.safety.tier, "FREDDY");
  assert.equal(decision.personaAutoEligible, false);
  assert.equal(decision.canAutoActivate, false);
});
