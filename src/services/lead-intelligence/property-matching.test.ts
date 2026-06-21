import assert from "node:assert/strict";
import test from "node:test";
import type { ExtractedLead } from "./contracts";
import {
  calculatePropertyBudget,
  leadMatchProfileFromExtractedLead,
  matchPropertyToLeadProfile,
  normalizePropertyForLeadMatching,
  rankPropertyMatches,
} from "./property-matching";

const emmadaleLead: ExtractedLead = {
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
    reasoning: "Customer is ready to buy if a suitable property appears.",
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
      operator: "gte",
      value: { min: 20 },
      weight: 0.9,
      sourceText: "Stor aapen terrasse eventuelt ut fra stue 20 kvm+",
      appliesToPropertyTypes: ["apartment", "penthouse"],
    },
    {
      key: "view_quality",
      operator: "eq",
      value: "good",
      weight: 0.8,
      sourceText: "God utsikt.",
    },
  ],
  exclusions: [
    {
      key: "future_building_risk",
      operator: "eq",
      value: true,
      severity: "reject",
      sourceText: "Kommunal tomt paa siden kan bygges paa.",
    },
  ],
  missingInformation: [
    {
      key: "parking",
      question: "Is parking required?",
      priority: "medium",
    },
  ],
  summary: "Flexible area, wants end townhouse or top apartment with terrace and view.",
  suggestedNextAction: "Verify budget and adjacent plot risk before recommending properties.",
};

const profile = leadMatchProfileFromExtractedLead("profile-emmadale-v1", emmadaleLead);

test("normalizes raw property rows into bounded matching facts", () => {
  const property = normalizePropertyForLeadMatching({
    id: "prop-good",
    property_type: "apartment",
    price: "360.000 EUR",
    bedrooms: 2,
    bathrooms: 2,
    town: "Altea",
    terrace_size: 25,
    lift: true,
    is_top_floor: true,
    pool: true,
    description: "Penthouse with panoramic sea view.",
  });

  assert.equal(property.propertyId, "prop-good");
  assert.equal(property.facts.property_type.value, "apartment");
  assert.equal(property.facts.purchase_price.value, 360000);
  assert.equal(property.facts.terrace_area_m2.value, 25);
  assert.equal(property.facts.has_lift.value, true);
  assert.equal(property.facts.floor_position.value, "top_floor");
  assert.equal(property.facts.view_quality.value, "good");
  assert.equal(property.facts.view_quality.verificationStatus, "inferred");
});

test("budget calculator estimates total cost when buyer budget includes costs", () => {
  const property = normalizePropertyForLeadMatching({
    id: "prop-budget",
    property_type: "apartment",
    price: 360000,
    is_new_build: false,
  });

  const budget = calculatePropertyBudget(emmadaleLead.budget, property);

  assert.equal(budget.purchasePrice, 360000);
  assert.equal(budget.estimatedTotalCost, 414000);
  assert.equal(budget.assumption, "estimated_from_purchase_price");
  assert.equal(budget.taxRate, 0.1);
});

test("deterministic match accepts a verified eligible property", () => {
  const property = normalizePropertyForLeadMatching(
    {
      id: "prop-eligible",
      property_type: "apartment",
      price: 360000,
      bedrooms: 2,
      bathrooms: 2,
      terrace_size: 25,
      has_lift: true,
      is_top_floor: true,
      future_building_risk: false,
      description: "Top floor apartment with panoramic sea view.",
    },
    { source: "test-fixture", verifiedAt: "2026-06-21T10:00:00.000Z" },
  );

  const match = matchPropertyToLeadProfile(profile, property);

  assert.equal(match.eligibility, "eligible");
  assert.ok(match.score > 75);
  assert.equal(match.budgetResult?.outcome, "pass");
  assert.equal(match.hardRequirementResults.every((row) => row.outcome === "pass"), true);
  assert.ok(match.verifiedFacts.includes("bedrooms"));
  assert.ok(match.reasonsForMatch.some((reason) => reason.includes("within the buyer budget")));
});

test("hard requirement breach rejects apartment that is not top floor", () => {
  const property = normalizePropertyForLeadMatching({
    id: "prop-low-floor",
    property_type: "apartment",
    price: 330000,
    bedrooms: 2,
    terrace_size: 30,
    has_lift: true,
    floor_position: "middle_floor",
    description: "Apartment with views.",
  });

  const match = matchPropertyToLeadProfile(profile, property);

  assert.equal(match.eligibility, "rejected");
  assert.equal(match.hardRequirementResults.some((row) => row.key === "floor_position" && row.outcome === "fail"), true);
  assert.ok(match.score <= 25);
});

test("unknown lift is not treated as satisfied", () => {
  const property = normalizePropertyForLeadMatching({
    id: "prop-unknown-lift",
    property_type: "apartment",
    price: 330000,
    bedrooms: 2,
    terrace_size: 30,
    is_top_floor: true,
    description: "Top floor apartment with views.",
  });

  const match = matchPropertyToLeadProfile(profile, property);

  assert.equal(match.eligibility, "conditional");
  assert.equal(match.hardRequirementResults.some((row) => row.key === "has_lift" && row.outcome === "unknown"), true);
  assert.ok(match.questionsToVerify.some((question) => question.includes("has_lift")));
});

test("future building risk exclusion rejects property", () => {
  const property = normalizePropertyForLeadMatching({
    id: "prop-risk",
    property_type: "townhouse",
    price: 310000,
    bedrooms: 3,
    description: "End townhouse beside an undeveloped adjacent plot with future building risk.",
  });

  const match = matchPropertyToLeadProfile(profile, property);

  assert.equal(match.eligibility, "rejected");
  assert.equal(match.exclusionResults.some((row) => row.key === "future_building_risk" && row.outcome === "fail"), true);
});

test("unknown future building risk creates verification question instead of false confidence", () => {
  const property = normalizePropertyForLeadMatching({
    id: "prop-unknown-risk",
    property_type: "townhouse",
    price: 310000,
    bedrooms: 3,
    description: "End townhouse in a residential area.",
  });

  const match = matchPropertyToLeadProfile(profile, property);

  assert.equal(match.eligibility, "conditional");
  assert.equal(match.exclusionResults.some((row) => row.key === "future_building_risk" && row.outcome === "unknown"), true);
});

test("property clearly over total budget is rejected", () => {
  const property = normalizePropertyForLeadMatching({
    id: "prop-over-budget",
    property_type: "penthouse",
    price: 450000,
    bedrooms: 2,
    terrace_size: 30,
    has_lift: true,
    is_top_floor: true,
    description: "Top floor penthouse with sea view.",
  });

  const match = matchPropertyToLeadProfile(profile, property);

  assert.equal(match.eligibility, "rejected");
  assert.equal(match.budgetResult?.outcome, "fail");
  assert.ok(match.concerns.some((concern) => concern.includes("above the buyer budget")));
});

test("fixed preferred location rejects properties outside the requested area", () => {
  const fixedMorairaProfile = {
    ...profile,
    locations: {
      preferred: ["Moreira"],
      excluded: [],
      flexible: false,
    },
  };
  const moraira = normalizePropertyForLeadMatching({
    id: "prop-moraira",
    property_type: "apartment",
    price: 350000,
    bedrooms: 2,
    terrace_size: 25,
    has_lift: true,
    is_top_floor: true,
    town: "Moraira",
    future_building_risk: false,
    description: "Top floor apartment with panoramic sea view.",
  });
  const altea = normalizePropertyForLeadMatching({
    id: "prop-altea",
    property_type: "apartment",
    price: 350000,
    bedrooms: 2,
    terrace_size: 25,
    has_lift: true,
    is_top_floor: true,
    town: "Altea",
    future_building_risk: false,
    description: "Top floor apartment with panoramic sea view.",
  });

  const morairaMatch = matchPropertyToLeadProfile(fixedMorairaProfile, moraira);
  const alteaMatch = matchPropertyToLeadProfile(fixedMorairaProfile, altea);

  assert.equal(morairaMatch.eligibility, "eligible");
  assert.ok(morairaMatch.score > alteaMatch.score);
  assert.ok(morairaMatch.reasonsForMatch.some((reason) => reason.includes("preferred area Moraira")));
  assert.equal(alteaMatch.eligibility, "rejected");
  assert.ok(alteaMatch.concerns.some((concern) => concern.includes("does not match the required preferred area")));
});

test("flexible preferred location gives a bonus without rejecting other areas", () => {
  const flexibleFinestratProfile = {
    ...profile,
    locations: {
      preferred: ["Finestrat"],
      excluded: [],
      flexible: true,
    },
  };
  const finestratMatch = matchPropertyToLeadProfile(flexibleFinestratProfile, normalizePropertyForLeadMatching({
    id: "prop-flex-finestrat",
    property_type: "apartment",
    price: 350000,
    bedrooms: 2,
    terrace_size: 25,
    has_lift: true,
    is_top_floor: true,
    town: "Finestrat",
    future_building_risk: false,
    description: "Top floor apartment with panoramic sea view.",
  }));
  const alteaMatch = matchPropertyToLeadProfile(flexibleFinestratProfile, normalizePropertyForLeadMatching({
    id: "prop-flex-altea",
    property_type: "apartment",
    price: 350000,
    bedrooms: 2,
    terrace_size: 25,
    has_lift: true,
    is_top_floor: true,
    town: "Altea",
    future_building_risk: false,
    description: "Top floor apartment with panoramic sea view.",
  }));

  assert.equal(finestratMatch.eligibility, "eligible");
  assert.notEqual(alteaMatch.eligibility, "rejected");
  assert.ok(finestratMatch.score > alteaMatch.score);
});

test("flexible preferred Moraira rejects known areas outside the 30 km radius", () => {
  const flexibleMorairaProfile = {
    ...profile,
    budget: {
      amount: 700000,
      currency: "EUR" as const,
      includesCosts: null,
      approximate: false,
      hardLimit: null,
    },
    propertyTypes: ["villa" as const],
    locations: {
      preferred: ["Moraira"],
      excluded: [],
      flexible: true,
    },
    hardRequirements: [
      {
        key: "bedrooms" as const,
        operator: "gte" as const,
        value: 3,
        sourceText: "3 soverom",
        appliesToPropertyTypes: ["villa" as const],
      },
      {
        key: "bathrooms" as const,
        operator: "gte" as const,
        value: 2,
        sourceText: "2 bad",
        appliesToPropertyTypes: ["villa" as const],
      },
    ],
    preferences: [],
    exclusions: [],
  };

  const benissaMatch = matchPropertyToLeadProfile(flexibleMorairaProfile, normalizePropertyForLeadMatching({
    id: "prop-flex-benissa",
    property_type: "villa",
    price: 650000,
    bedrooms: 3,
    bathrooms: 2,
    town: "Benissa",
    future_building_risk: false,
    description: "Villa close to Moraira.",
  }));
  const finestratMatch = matchPropertyToLeadProfile(flexibleMorairaProfile, normalizePropertyForLeadMatching({
    id: "prop-flex-finestrat",
    property_type: "villa",
    price: 650000,
    bedrooms: 3,
    bathrooms: 2,
    town: "Finestrat, Cala De Finestrat",
    future_building_risk: false,
    description: "Villa outside the Moraira radius.",
  }));
  const elcheMatch = matchPropertyToLeadProfile(flexibleMorairaProfile, normalizePropertyForLeadMatching({
    id: "prop-flex-elche",
    property_type: "villa",
    price: 650000,
    bedrooms: 3,
    bathrooms: 2,
    town: "Elche",
    future_building_risk: false,
    description: "Villa far from Moraira.",
  }));

  assert.notEqual(benissaMatch.eligibility, "rejected");
  assert.ok(benissaMatch.reasonsForMatch.some((reason) => reason.includes("within the flexible 30 km radius")));
  assert.equal(finestratMatch.eligibility, "rejected");
  assert.equal(elcheMatch.eligibility, "rejected");
  assert.ok(finestratMatch.concerns.some((concern) => concern.includes("outside the flexible 30 km radius")));
  assert.ok(elcheMatch.concerns.some((concern) => concern.includes("outside the flexible 30 km radius")));
});

test("matching is deterministic and ranking is stable", () => {
  const good = matchPropertyToLeadProfile(profile, normalizePropertyForLeadMatching({
    id: "prop-a",
    property_type: "apartment",
    price: 350000,
    bedrooms: 2,
    terrace_size: 25,
    has_lift: true,
    is_top_floor: true,
    description: "Top floor apartment with panoramic sea view.",
  }));
  const conditional = matchPropertyToLeadProfile(profile, normalizePropertyForLeadMatching({
    id: "prop-b",
    property_type: "apartment",
    price: 350000,
    bedrooms: 2,
    terrace_size: 18,
    is_top_floor: true,
    description: "Top floor apartment.",
  }));
  const rejected = matchPropertyToLeadProfile(profile, normalizePropertyForLeadMatching({
    id: "prop-c",
    property_type: "apartment",
    price: 520000,
    bedrooms: 2,
    terrace_size: 25,
    has_lift: true,
    is_top_floor: true,
  }));

  const again = matchPropertyToLeadProfile(profile, normalizePropertyForLeadMatching({
    id: "prop-a",
    property_type: "apartment",
    price: 350000,
    bedrooms: 2,
    terrace_size: 25,
    has_lift: true,
    is_top_floor: true,
    description: "Top floor apartment with panoramic sea view.",
  }));

  assert.deepEqual(good, again);
  assert.deepEqual(rankPropertyMatches([rejected, conditional, good]).map((row) => row.propertyId), [
    "prop-a",
    "prop-b",
    "prop-c",
  ]);
});
