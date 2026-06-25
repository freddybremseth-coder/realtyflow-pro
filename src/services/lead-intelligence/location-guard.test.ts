import assert from "node:assert/strict";
import test from "node:test";
import { applyLeadPropertyLocationGuard } from "./location-guard";
import type { PropertyMatchPreviewResult } from "./property-match-preview";
import type { LeadMatchProfile } from "./property-matching";

const buyerProfileId = "11111111-1111-4111-8111-111111111111";

function profileForPolop(): LeadMatchProfile {
  return {
    buyerProfileId,
    budget: {
      amount: 500000,
      currency: "EUR",
      includesCosts: false,
      approximate: true,
      hardLimit: null,
    },
    propertyTypes: [],
    locations: {
      preferred: ["Polop"],
      excluded: [],
      flexible: true,
    },
    hardRequirements: [],
    preferences: [],
    exclusions: [],
  };
}

function match(propertyId: string, location: string) {
  return {
    propertyId,
    buyerProfileId,
    score: 80,
    eligibility: "eligible",
    hardRequirementResults: [],
    preferenceResults: [],
    exclusionResults: [],
    budgetResult: null,
    dataQualityScore: 80,
    verifiedFacts: [],
    unverifiedFacts: [],
    reasonsForMatch: [],
    concerns: [],
    questionsToVerify: [],
    property: {
      id: propertyId,
      reference: propertyId,
      title: propertyId,
      location,
      propertyType: "villa",
      price: 450000,
      bedrooms: 3,
      bathrooms: 2,
      primaryImageUrl: null,
      publicUrl: null,
    },
  } as PropertyMatchPreviewResult["matches"][number];
}

test("auto discovery keeps Polop-area matches and filters distant Guardamar matches", () => {
  const result: PropertyMatchPreviewResult = {
    buyerProfileId,
    discoveryMode: "auto",
    bestEffort: false,
    analyzed: 2,
    matched: 2,
    candidateLimit: 20,
    missingPropertyReferences: [],
    skippedProperties: [],
    matches: [
      match("polop-1", "Polop"),
      match("guardamar-1", "Guardamar del Segura"),
    ],
    sideEffects: {
      leadsCreated: false,
      contactsCreated: false,
      emailsSent: false,
      matchesPersisted: false,
      shortlistCreated: false,
    },
  };

  const guarded = applyLeadPropertyLocationGuard(result, profileForPolop());

  assert.deepEqual(guarded.matches.map((item) => item.property.location), ["Polop"]);
  assert.equal(guarded.matched, 1);
});

test("explicit property references are not hidden by the auto discovery location guard", () => {
  const result: PropertyMatchPreviewResult = {
    buyerProfileId,
    discoveryMode: "explicit",
    bestEffort: false,
    analyzed: 1,
    matched: 1,
    candidateLimit: null,
    missingPropertyReferences: [],
    skippedProperties: [],
    matches: [match("guardamar-1", "Guardamar del Segura")],
    sideEffects: {
      leadsCreated: false,
      contactsCreated: false,
      emailsSent: false,
      matchesPersisted: false,
      shortlistCreated: false,
    },
  };

  const guarded = applyLeadPropertyLocationGuard(result, profileForPolop());

  assert.equal(guarded.matches.length, 1);
  assert.equal(guarded.matches[0].property.location, "Guardamar del Segura");
});
