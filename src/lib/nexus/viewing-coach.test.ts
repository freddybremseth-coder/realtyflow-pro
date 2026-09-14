import assert from "node:assert/strict";
import test from "node:test";
import { buildViewingCoachPlan } from "./viewing-coach";

test("negative viewing feedback becomes a safe rematch signal without changing Buyer Profile", () => {
  const plan = buildViewingCoachPlan({
    note: "Vi likte ikke stilen og boligen var for liten.",
    propertyTitle: "Villa Sol",
    propertyLocation: "Altea",
  });
  assert.equal(plan.sentiment, "negative");
  assert.equal(plan.shouldRematch, true);
  assert.equal(plan.requiresBuyerProfileReview, false);
  assert.equal(plan.tasteSignal?.sentiment, "negative");
  assert.equal(plan.tasteSignal?.location, "Altea");
  assert.deepEqual(plan.reasons.sort(), ["style_dislike", "too_small"].sort());
  assert.equal(plan.safety.secondaryRankingOnly, true);
  assert.equal(plan.safety.buyerProfileMutation, false);
  assert.equal(plan.safety.pipelineMutation, false);
  assert.equal(plan.safety.customerSend, false);
});

test("explicit criteria change requires Buyer Profile review and is never silently applied", () => {
  const plan = buildViewingCoachPlan({
    note: "Fin bolig, men budsjettet er maks 450 000 og vi må ha minst 3 soverom.",
  });
  assert.equal(plan.requiresBuyerProfileReview, true);
  assert.equal(plan.explicitCriteriaEvidence.length >= 1, true);
  assert.match(plan.nextAction, /Gjennomgå Buyer Profile/i);
  assert.equal(plan.safety.buyerProfileMutation, false);
});

test("high purchase intent recommends negotiation review but never moves pipeline automatically", () => {
  const plan = buildViewingCoachPlan({
    note: "Dette er favoritten vår. Vi ønsker å kjøpe og gå videre med bud.",
    propertyReference: "N-123",
  });
  assert.equal(plan.highIntent, true);
  assert.equal(plan.shouldRematch, false);
  assert.match(plan.nextAction, /NEGOTIATION/);
  assert.equal(plan.safety.pipelineMutation, false);
  assert.equal(plan.safety.customerSend, false);
});

test("completed viewing without feedback asks for evidence instead of inventing preferences", () => {
  const plan = buildViewingCoachPlan({ note: "" });
  assert.equal(plan.sentiment, "neutral");
  assert.equal(plan.tasteSignal, null);
  assert.equal(plan.shouldRematch, false);
  assert.match(plan.nextAction, /konkret kundefeedback mangler/i);
});
