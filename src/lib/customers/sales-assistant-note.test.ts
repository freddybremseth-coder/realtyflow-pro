import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSalesAssistantPrompt,
  SalesAssistantNoteAnalysisSchema,
  SalesAssistantNoteInputSchema,
  shouldCreateFollowupCalendarEvent,
  verifiedBuyerCriteria,
} from "./sales-assistant-note";

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
    buyerCriteria: [],
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
  assert.deepEqual(parsed.buyerCriteria, []);
});

test("long pasted correspondence is accepted up to the CRM intelligence limit", () => {
  const source = "a".repeat(25000);
  assert.equal(SalesAssistantNoteInputSchema.parse({
    note: source,
    nowIso: "2026-09-14T18:30:00.000Z",
    timezone: "Europe/Madrid",
    customerName: "Test Customer",
  }).note.length, 25000);
});

test("correspondence prompt separates customer facts, internal notes, historical dates and rich buyer criteria", () => {
  const prompt = buildSalesAssistantPrompt({
    note: "Forwarded email thread",
    nowIso: "2026-09-14T18:30:00.000Z",
    timezone: "Europe/Madrid",
    customerName: "Test Customer",
  });
  assert.match(prompt, /Distinguish the customer's own statements from internal colleague notes/);
  assert.match(prompt, /Ignore signatures/);
  assert.match(prompt, /already in the past.*historical context only/);
  assert.match(prompt, /Do not invent budget/);
  assert.match(prompt, /minimum bedrooms\/bathrooms -> bedrooms\/bathrooms with gte/);
  assert.match(prompt, /not ground floor -> floor_position preference with neq/);
  assert.match(prompt, /named development\/project -> other with otherKey development/);
});

test("Harald-like explicit correspondence yields verified bathrooms, area, location and floor criteria", () => {
  const raw = "Vi er på utkikk etter en leilighet i Delfin Natura. Har feriert i Albir i mange år. Ser etter en leilighet med minimum 3 soverom og 2 komplette bad. Størrelse over 100 kvm. Helst ikke bakkeplan.";
  const parsed = analysis({
    updateType: "email",
    buyerCriteria: [
      { criterionType: "hard_requirement", key: "property_type", otherKey: null, operator: "eq", value: "apartment", weight: null, severity: null, appliesToPropertyTypes: ["apartment"], sourceText: "Ser etter en leilighet", confidence: 0.99 },
      { criterionType: "hard_requirement", key: "bedrooms", otherKey: null, operator: "gte", value: "3", weight: null, severity: null, appliesToPropertyTypes: [], sourceText: "minimum 3 soverom", confidence: 0.99 },
      { criterionType: "hard_requirement", key: "bathrooms", otherKey: null, operator: "gte", value: "2", weight: null, severity: null, appliesToPropertyTypes: [], sourceText: "2 komplette bad", confidence: 0.99 },
      { criterionType: "hard_requirement", key: "living_area_m2", otherKey: null, operator: "gt", value: "100", weight: null, severity: null, appliesToPropertyTypes: [], sourceText: "Størrelse over 100 kvm", confidence: 0.98 },
      { criterionType: "hard_requirement", key: "location", otherKey: null, operator: "eq", value: "Albir", weight: null, severity: null, appliesToPropertyTypes: [], sourceText: "Albir", confidence: 0.97 },
      { criterionType: "preference", key: "floor_position", otherKey: null, operator: "neq", value: "ground_floor", weight: 0.8, severity: null, appliesToPropertyTypes: ["apartment"], sourceText: "Helst ikke bakkeplan", confidence: 0.98 },
      { criterionType: "preference", key: "other", otherKey: "development", operator: "eq", value: "Delfin Natura", weight: 0.95, severity: null, appliesToPropertyTypes: ["apartment"], sourceText: "Delfin Natura", confidence: 0.99 },
    ],
  });

  const verified = verifiedBuyerCriteria(parsed, raw);
  assert.deepEqual(verified.map((item) => [item.key, item.operator, item.value]), [
    ["property_type", "eq", "apartment"],
    ["bedrooms", "gte", 3],
    ["bathrooms", "gte", 2],
    ["living_area_m2", "gt", 100],
    ["location", "eq", "Albir"],
    ["floor_position", "neq", "ground_floor"],
    ["other", "eq", "Delfin Natura"],
  ]);
});

test("buyer criteria without exact source evidence or sufficient confidence are rejected", () => {
  const raw = "Kunden ønsker 3 soverom.";
  const parsed = analysis({
    buyerCriteria: [
      { criterionType: "hard_requirement", key: "bedrooms", otherKey: null, operator: "gte", value: "3", weight: null, severity: null, appliesToPropertyTypes: [], sourceText: "3 soverom", confidence: 0.99 },
      { criterionType: "hard_requirement", key: "bathrooms", otherKey: null, operator: "gte", value: "2", weight: null, severity: null, appliesToPropertyTypes: [], sourceText: "2 bad", confidence: 0.99 },
      { criterionType: "hard_requirement", key: "location", otherKey: null, operator: "eq", value: "Albir", weight: null, severity: null, appliesToPropertyTypes: [], sourceText: "Kunden", confidence: 0.7 },
    ],
  });
  const verified = verifiedBuyerCriteria(parsed, raw);
  assert.equal(verified.length, 1);
  assert.equal(verified[0].key, "bedrooms");
});
