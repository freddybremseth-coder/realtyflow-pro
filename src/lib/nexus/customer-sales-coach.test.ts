import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerSalesCoachFallback } from "./customer-sales-coach";
import type { CustomerSalesAdvisorOutput } from "./customer-sales-advisor";

function advisor(overrides: Partial<CustomerSalesAdvisorOutput> = {}): CustomerSalesAdvisorOutput {
  return {
    contactId: "c1",
    stage: "MATCHING",
    priority: "P1",
    score: 80,
    headline: "Kunden trenger shortlist-feedback.",
    momentum: "HOT",
    scores: { profile: 90, engagement: 80, timing: 75, intent: 85, overall: 82 },
    whyNow: ["Kunden svarte nylig."],
    signals: ["Buyer Profile finnes."],
    risks: [],
    missing: [],
    nextBestAction: {
      action: "Be kunden rangere alternativene.",
      why: "Feedback strammer inn søket.",
      channel: "CALL",
    },
    stageGuidance: {
      current: "MATCHING",
      next: "VIEWING",
      completionPercent: 67,
      readyToAdvance: false,
      criteria: [],
    },
    discoveryQuestions: ["Hvilket alternativ er nærmest riktig?"],
    coach: { do: [], avoid: [] },
    guardrail: "Ingen autosend.",
    ...overrides,
  };
}

test("customer sales coach uses advisor next best action and never implies autosend", () => {
  const output = buildCustomerSalesCoachFallback({
    mode: "NEXT_STEP",
    contact: { name: "Ola Nordmann" },
    buyerProfile: { summary: "Ser etter leilighet nær sjøen." },
    criteria: [],
    communicationDialogue: {},
    advisor: advisor(),
  });

  assert.equal(output.nextBestAction.action, "Be kunden rangere alternativene.");
  assert.match(output.sellerCoach.avoid.join(" "), /Ikke send automatisk/);
  assert.match(output.customerSituation.needHypothesis, /leilighet nær sjøen/);
});

test("email coach creates a draft only and uses verified first name", () => {
  const output = buildCustomerSalesCoachFallback({
    mode: "EMAIL",
    contact: { name: "Ola Nordmann" },
    buyerProfile: { summary: "Ser etter bolig." },
    criteria: [],
    communicationDialogue: {},
    advisor: advisor(),
  });

  assert.match(output.emailDraft.body, /^Hei Ola,/);
  assert.ok(output.emailDraft.subject.length > 0);
});

test("paused advisor produces no outreach draft", () => {
  const paused = advisor({
    stage: "ON_HOLD",
    priority: "PAUSED",
    momentum: "PAUSED",
    nextBestAction: {
      action: "Vent til avtalt dato.",
      why: "Kunden er på vent.",
      channel: "NONE",
    },
  });

  const output = buildCustomerSalesCoachFallback({
    mode: "EMAIL",
    contact: { name: "Kari Kunde" },
    buyerProfile: null,
    criteria: [],
    communicationDialogue: {},
    advisor: paused,
  });

  assert.equal(output.emailDraft.body, "");
  assert.equal(output.nextBestAction.channel, "NONE");
});
