import assert from "node:assert/strict";
import test from "node:test";
import {
  assessClosingRisk,
  defaultProbabilityForStage,
  decorateClosingDeal,
  pipelineStatusForClosingStage,
  recommendClosingAction,
} from "./deal";

const NOW = new Date("2026-07-11T08:00:00.000Z");

test("flags an overdue reservation deal as critical", () => {
  const risk = assessClosingRisk(
    {
      stage: "OFFER_RESERVATION",
      status: "ACTIVE",
      next_action: "Follow up reservation",
      next_action_due_at: "2026-07-08T10:00:00.000Z",
      decision_makers: ["Gerald", "Partner"],
      objections: ["Financing terms"],
      preferred_property_ref: "PROP-42",
      financing_status: "PENDING",
      expected_closing_date: "2026-07-10",
    },
    NOW,
  );

  assert.equal(risk.level, "CRITICAL");
  assert.equal(risk.overdue, true);
  assert.ok(risk.score >= 60);
  assert.ok(risk.reasons.some((reason) => /forsinket/i.test(reason)));
});

test("recommends recording decision makers before progressing", () => {
  const action = recommendClosingAction(
    {
      stage: "REQUIREMENTS_CONFIRMED",
      next_action: "Prepare shortlist",
      next_action_due_at: "2026-07-15T10:00:00.000Z",
      decision_makers: [],
      objections: [],
    },
    NOW,
  );

  assert.match(action, /beslutningstakere/i);
});

test("maps closing stages back to the CRM pipeline", () => {
  assert.equal(pipelineStatusForClosingStage("VIEWING_COMPLETED"), "VIEWING");
  assert.equal(pipelineStatusForClosingStage("LEGAL_DUE_DILIGENCE"), "NEGOTIATION");
  assert.equal(pipelineStatusForClosingStage("COMPLETED"), "WON");
});

test("uses deterministic stage probabilities", () => {
  assert.equal(defaultProbabilityForStage("QUALIFIED"), 20);
  assert.equal(defaultProbabilityForStage("VIEWING_PLANNED"), 55);
  assert.equal(defaultProbabilityForStage("CONTRACT_SIGNED"), 97);
});

test("decorates a healthy viewing deal with calculated guidance", () => {
  const deal = decorateClosingDeal(
    {
      id: "deal-1",
      stage: "VIEWING_PLANNED",
      status: "ACTIVE",
      next_action: "Confirm viewing route",
      next_action_due_at: "2026-07-14T10:00:00.000Z",
      decision_makers: ["Buyer", "Spouse"],
      objections: [],
      expected_closing_date: "2026-09-01",
    },
    NOW,
  );

  assert.equal(deal.stage, "VIEWING_PLANNED");
  assert.equal(deal.calculated_risk_level, "LOW");
  assert.match(deal.recommended_action, /visningsrute/i);
});
