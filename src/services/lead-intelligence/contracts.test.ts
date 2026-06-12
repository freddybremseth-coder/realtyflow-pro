import assert from "node:assert/strict";
import test from "node:test";
import {
  CustomerMessageDraftSchema,
  ExtractedLeadSchema,
  NormalizedPropertyForMatchingSchema,
  PropertyMatchSchema,
  normalizePhoneForLeadLookup,
} from "./contracts";

const emmadaleExtractedLead = {
  contact: {
    name: "Emmadale",
    phone: "+47 90 17 47 14",
    email: null,
    language: "no",
    country: "NO",
  },
  purchaseReadiness: {
    level: "ready_to_buy",
    confidence: 0.9,
    reasoning: "Kunden er kjopeklar dersom riktig objekt dukker opp.",
  },
  budget: {
    amount: 440000,
    currency: "EUR",
    includesCosts: true,
    approximate: true,
    hardLimit: null,
  },
  propertyTypes: ["end_townhouse", "apartment", "penthouse"],
  locations: {
    preferred: [],
    excluded: [],
    flexible: true,
  },
  hardRequirements: [
    {
      key: "bedrooms",
      operator: "gte",
      value: 2,
      sourceText: "Minst 2 soverom.",
    },
    {
      key: "floor_position",
      operator: "eq",
      value: "top_floor",
      sourceText: "Maa vaere paa toppen.",
      appliesToPropertyTypes: ["apartment", "penthouse"],
    },
    {
      key: "has_lift",
      operator: "eq",
      value: true,
      sourceText: "Maa vaere heis om det er opp i etasjene.",
      appliesToPropertyTypes: ["apartment", "penthouse"],
    },
  ],
  preferences: [
    {
      key: "terrace_area_m2",
      weight: 0.85,
      value: { min: 20 },
      sourceText: "Stor aapen terrasse eventuelt ut fra stue 20 kvm+",
      appliesToPropertyTypes: ["apartment", "penthouse"],
    },
    {
      key: "view_quality",
      weight: 0.8,
      value: "good",
      sourceText: "God utsikt.",
    },
  ],
  exclusions: [
    {
      key: "future_building_risk",
      severity: "reject",
      value: "municipal_or_undeveloped_adjacent_plot",
      sourceText: "Kommunale tomten paa siden som kan bygges paa i fremtiden.",
    },
    {
      key: "view_privacy_loss_risk",
      severity: "major_penalty",
      value: true,
      sourceText: "Kan bygges paa i fremtiden.",
    },
  ],
  missingInformation: [
    { key: "financing", question: "Er kjoepet kontant eller finansiert?", priority: "high" },
    { key: "absolute_budget", question: "Er 440 000 EUR en absolutt totalgrense?", priority: "high" },
    { key: "parking", question: "Er parkering et krav?", priority: "medium" },
    { key: "pool", question: "Oensker kunden basseng?", priority: "medium" },
    { key: "orientation", question: "Er solretning viktig?", priority: "low" },
  ],
  summary:
    "Kunden er fleksibel paa omraade og vurderer enderekkehus eller toppleilighet med utsikt, stor terrasse og minst to soverom.",
  suggestedNextAction:
    "Freddy boer godkjenne leadprofilen, avklare budsjettgrense og verifisere nabotomt-/utsiktsrisiko for aktuelle boliger.",
};

test("Emmadale expected extracted lead fixture satisfies the contract", () => {
  const parsed = ExtractedLeadSchema.parse(emmadaleExtractedLead);

  assert.equal(parsed.contact.name, "Emmadale");
  assert.equal(parsed.contact.email, null);
  assert.equal(parsed.purchaseReadiness.level, "ready_to_buy");
  assert.equal(parsed.budget.amount, 440000);
  assert.equal(parsed.budget.includesCosts, true);
  assert.equal(parsed.locations.flexible, true);
  assert.equal(parsed.hardRequirements.some((row) => row.key === "floor_position"), true);
  assert.equal(parsed.exclusions.some((row) => row.key === "future_building_risk"), true);
});

test("normalizes phone numbers for duplicate lookup without inventing contact data", () => {
  assert.equal(normalizePhoneForLeadLookup("+47 90 17 47 14"), "+4790174714");
  assert.equal(normalizePhoneForLeadLookup("0047 90 17 47 14"), "+4790174714");
  assert.equal(normalizePhoneForLeadLookup(null), null);
});

test("rejects invented or malformed email values", () => {
  assert.throws(() =>
    ExtractedLeadSchema.parse({
      ...emmadaleExtractedLead,
      contact: { ...emmadaleExtractedLead.contact, email: "unknown@example" },
    }),
  );
});

test("requires unknown property facts to stay explicit in matching inputs", () => {
  const property = NormalizedPropertyForMatchingSchema.parse({
    propertyId: "property-1",
    brandId: "soleada",
    facts: {
      has_lift: {
        value: null,
        verificationStatus: "unknown",
        sourceField: null,
        source: null,
        verifiedAt: null,
      },
      bedrooms: {
        value: 2,
        verificationStatus: "verified",
        sourceField: "properties.bedrooms",
        source: "public.properties",
        verifiedAt: "2026-06-12T00:00:00.000Z",
      },
    },
    dataQualityScore: 55,
    updatedAt: null,
  });

  assert.equal(property.facts.has_lift.verificationStatus, "unknown");
});

test("match results encode hard requirement failures deterministically", () => {
  const match = PropertyMatchSchema.parse({
    propertyId: "property-1",
    buyerProfileId: "profile-1",
    score: 34,
    eligibility: "rejected",
    hardRequirementResults: [
      {
        key: "has_lift",
        outcome: "unknown",
        expected: true,
        actual: null,
        sourceField: null,
        reason: "Heis er ukjent og kan ikke behandles som oppfylt.",
      },
    ],
    preferenceResults: [],
    exclusionResults: [
      {
        key: "future_building_risk",
        outcome: "fail",
        expected: "no_future_building_risk",
        actual: "unknown",
        sourceField: null,
        reason: "Nabotomt maa kontrolleres foer presentasjon.",
      },
    ],
    budgetResult: {
      key: "estimated_total_cost",
      outcome: "pass",
      expected: { max: 440000, currency: "EUR" },
      actual: 430000,
      sourceField: "calculated.estimated_total_cost",
      reason: "Estimert totalramme er innenfor kundens oppgitte budsjett.",
    },
    dataQualityScore: 45,
    verifiedFacts: ["bedrooms"],
    unverifiedFacts: ["has_lift", "future_building_risk"],
    reasonsForMatch: ["Minst to soverom."],
    concerns: ["Heis og nabotomt er ikke verifisert."],
    questionsToVerify: ["Har bygget heis?", "Finnes fremtidig byggerisiko foran utsikt?"],
  });

  assert.equal(match.eligibility, "rejected");
  assert.equal(match.hardRequirementResults[0].outcome, "unknown");
});

test("message drafts are drafts by default and do not imply automatic sending", () => {
  const draft = CustomerMessageDraftSchema.parse({
    leadId: "lead-1",
    contactId: "contact-1",
    brand: "soleada",
    channel: "email",
    subject: "Boliger som kan passe",
    bodyText: "Hei Emmadale, her er et utkast Freddy maa godkjenne.",
    bodyHtml: null,
    propertyIds: ["property-1"],
    profileVersion: 1,
    status: "draft",
    approvedBy: null,
    approvedAt: null,
    sentAt: null,
  });

  assert.equal(draft.status, "draft");
  assert.equal(draft.sentAt, null);
});
