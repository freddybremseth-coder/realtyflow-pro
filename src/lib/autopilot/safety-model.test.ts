import assert from "node:assert/strict";
import test from "node:test";
import { decideAutopilotTier } from "./safety-model";

test("auto-activates a complete high-confidence Buyer Profile", () => {
  const decision = decideAutopilotTier({
    actionType: "buyer_profile_activation",
    risk: "low",
    confidence: 0.97,
    requiredDataComplete: true,
  });
  assert.equal(decision.tier, "AUTO");
  assert.equal(decision.allowed, true);
});

test("routes medium-confidence Buyer Profile to review", () => {
  const decision = decideAutopilotTier({
    actionType: "buyer_profile_activation",
    risk: "low",
    confidence: 0.88,
    requiredDataComplete: true,
  });
  assert.equal(decision.tier, "REVIEW");
});

test("blocks outbound communication for do-not-contact", () => {
  const decision = decideAutopilotTier({
    actionType: "customer_message",
    risk: "low",
    confidence: 0.99,
    verifiedRecipient: true,
    consentKnown: true,
    doNotContact: true,
  });
  assert.equal(decision.tier, "FREDDY");
  assert.equal(decision.allowed, false);
});

test("auto-allows a verified high-confidence outbound message", () => {
  const decision = decideAutopilotTier({
    actionType: "customer_message",
    risk: "low",
    confidence: 0.98,
    verifiedRecipient: true,
    consentKnown: true,
    doNotContact: false,
  });
  assert.equal(decision.tier, "AUTO");
});

test("property delivery requires match score 90 or higher for AUTO", () => {
  const decision = decideAutopilotTier({
    actionType: "property_delivery",
    risk: "low",
    confidence: 0.98,
    verifiedRecipient: true,
    consentKnown: true,
    matchScore: 84,
  });
  assert.equal(decision.tier, "REVIEW");
});

test("low-risk NEW to CONTACT transition can run automatically", () => {
  const decision = decideAutopilotTier({
    actionType: "pipeline_transition",
    risk: "low",
    confidence: 0.98,
    currentStage: "NEW",
    targetStage: "CONTACT",
  });
  assert.equal(decision.tier, "AUTO");
});

test("terminal pipeline transition stays with Freddy", () => {
  const decision = decideAutopilotTier({
    actionType: "pipeline_transition",
    risk: "medium",
    confidence: 0.99,
    currentStage: "NEGOTIATION",
    targetStage: "WON",
  });
  assert.equal(decision.tier, "FREDDY");
});

test("conflicting evidence always escalates before confidence", () => {
  const decision = decideAutopilotTier({
    actionType: "data_update",
    risk: "low",
    confidence: 1,
    conflictingEvidence: true,
  });
  assert.equal(decision.tier, "FREDDY");
});

test("legal and financial actions remain human-controlled", () => {
  for (const actionType of ["legal", "financial", "negotiation"] as const) {
    const decision = decideAutopilotTier({ actionType, risk: "low", confidence: 1 });
    assert.equal(decision.tier, "FREDDY");
  }
});
