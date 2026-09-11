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

test("country-only profile triggers clarification instead of silent no-match", () => {
  const plan = buildNoMatchClarificationPlan({
    profile: profile(),
    criteria: [criterion("location", "Spain")],
  });
  assert.equal(plan.action, "send_clarification");
  assert.equal(plan.reason, "SEARCH_CRITERIA_TOO_BROAD_OR_INCOMPLETE");
  assert.deepEqual(plan.missingFields, ["location", "budget", "property_type", "bedrooms"]);
  assert.equal(plan.questions.length, 4);
  assert.equal(plan.currentCriteriaLines.some((line) => line.includes("Spain")), true);
});

test("specific profile with no matches is escalated instead of asking customer to loosen hard criteria automatically", () => {
  const plan = buildNoMatchClarificationPlan({
    profile: profile({ budget_amount: 500000, budget_currency: "EUR" }),
    criteria: [
      criterion("location", "Altea"),
      criterion("property_type", "villa"),
      criterion("bedrooms", 3),
    ],
  });
  assert.equal(plan.action, "human_review");
  assert.equal(plan.reason, "NO_MATCHES_WITH_SPECIFIC_PROFILE");
  assert.deepEqual(plan.missingFields, []);
  assert.deepEqual(plan.questions, []);
});

test("clarification email is transparent and asks for missing facts without changing criteria", () => {
  const plan = buildNoMatchClarificationPlan({
    profile: profile({ budget_amount: 450000, budget_currency: "EUR" }),
    criteria: [criterion("location", "Benidorm")],
  });
  const email = buildNoMatchClarificationEmail({ customerName: "Kari Nordmann", plan });
  assert.match(email.subject, /informasjon/i);
  assert.match(email.bodyText, /Hei Kari/);
  assert.match(email.bodyText, /ingen boliger/i);
  assert.match(email.bodyText, /boligtyper/i);
  assert.match(email.bodyText, /soverom/i);
  assert.match(email.bodyText, /svarer direkte på denne e-posten/i);
  assert.doesNotMatch(email.bodyText, /jeg har endret/i);
});
