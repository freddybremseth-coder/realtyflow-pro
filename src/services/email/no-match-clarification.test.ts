import assert from "node:assert/strict";
import test from "node:test";
import { buildNoMatchClarificationEmail, buildNoMatchClarificationPlan } from "./no-match-clarification";

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    brand: "zeneco",
    status: "approved",
    budget_amount: null,
    budget_currency: null,
    budget_includes_costs: null,
    budget_approximate: false,
    location_flexible: false,
    ...overrides,
  } as any;
}

function criterion(key: string, value: unknown, type = "hard_requirement") {
  return {
    criterion_type: type,
    key,
    value,
    source_text: null,
    confidence: 1,
  } as any;
}

test("country-only profile prepares one precise clarification instead of a multi-question email", () => {
  const plan = buildNoMatchClarificationPlan({
    profile: profile(),
    criteria: [criterion("location", "Spain")],
  });
  assert.equal(plan.action, "prepare_clarification");
  assert.equal(plan.reason, "SEARCH_CRITERIA_TOO_BROAD_OR_INCOMPLETE");
  assert.deepEqual(plan.missingFields, ["location", "budget", "property_type", "bedrooms"]);
  assert.equal(plan.questions.length, 1);
  assert.equal(plan.constraintFocus, "location");
  assert.match(plan.primaryQuestion, /område|steder/i);
  assert.equal(plan.currentCriteriaLines.some((line) => line.includes("Spain")), true);
});

test("specific profile with no matches proposes one flexibility question without changing hard criteria", () => {
  const plan = buildNoMatchClarificationPlan({
    profile: profile({ budget_amount: 500000, budget_currency: "EUR", location_flexible: false }),
    criteria: [
      criterion("location", "Altea"),
      criterion("property_type", "villa"),
      criterion("bedrooms", 3),
    ],
  });
  assert.equal(plan.action, "human_review");
  assert.equal(plan.reason, "NO_MATCHES_WITH_SPECIFIC_PROFILE");
  assert.deepEqual(plan.missingFields, []);
  assert.equal(plan.questions.length, 1);
  assert.equal(plan.constraintFocus, "location");
  assert.match(plan.primaryQuestion, /Altea/);
  assert.match(plan.primaryQuestion, /nærliggende områder/i);
});

test("when location is flexible a specific profile asks about the next most useful constraint", () => {
  const plan = buildNoMatchClarificationPlan({
    profile: profile({ budget_amount: 450000, budget_currency: "EUR", location_flexible: true }),
    criteria: [
      criterion("location", "Benidorm"),
      criterion("property_type", "apartment"),
      criterion("bedrooms", 2),
    ],
  });
  assert.equal(plan.constraintFocus, "budget");
  assert.match(plan.primaryQuestion, /450[ .]?000/);
  assert.match(plan.primaryQuestion, /absolutt tak/i);
});

test("clarification draft is transparent, asks only one question and promises no silent criteria change", () => {
  const plan = buildNoMatchClarificationPlan({
    profile: profile({ budget_amount: 450000, budget_currency: "EUR" }),
    criteria: [criterion("location", "Benidorm")],
  });
  const email = buildNoMatchClarificationEmail({ customerName: "Kari Nordmann", plan });
  assert.match(email.subject, /én avklaring/i);
  assert.match(email.bodyText, /Hei Kari/);
  assert.match(email.bodyText, /ingen boliger/i);
  assert.match(email.bodyText, /én ting/i);
  assert.match(email.bodyText, new RegExp(plan.primaryQuestion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(email.bodyText, /uten å endre noen av kriteriene før du har bekreftet det/i);
  assert.doesNotMatch(email.bodyText, /jeg har endret/i);
});
