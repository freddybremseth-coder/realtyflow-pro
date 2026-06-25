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

function match(propertyId: string, location: string, title = propertyId) {
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
      title,
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

function autoResult(matches: PropertyMatchPreviewResult["matches"]): PropertyMatchPreviewResult {
  return {
    buyerProfileId,
    discoveryMode: "auto",
    bestEffort: false,
    analyzed: matches.length,
    matched: matches.length,
    candidateLimit: 20,
    missingPropertyReferences: [],
    skippedProperties: [],
    matches,
    sideEffects: {
      leadsCreated: false,
      contactsCreated: false,
      emailsSent: false,
      matchesPersisted: false,
      shortlistCreated: false,
    },
  };
}

test("auto discovery keeps Polop-area matches and filters distant Guardamar matches", () => {
  const guarded = applyLeadPropertyLocationGuard(
    autoResult([
      match("polop-1", "Polop"),
      match("guardamar-1", "Guardamar del Segura"),
    ]),
    profileForPolop(),
  );

  assert.deepEqual(guarded.matches.map((item) => item.property.location), ["Polop"]);
  assert.equal(guarded.matched, 1);
});

test("auto discovery uses area profile regions to filter Los Alcazares and Hondon from Polop searches", () => {
  const guarded = applyLeadPropertyLocationGuard(
    autoResult([
      match("polop-1", "Costa Blanca North", "Moderne luksusvillaer til salgs i Polop de la Marina"),
      match("los-alcazares-1", "Los Alcazares, La Serena Golf", "Nytt boligkompleks i Los Alcazares"),
      match("hondon-1", "Hondón de las Nieves, Pueblo", "Leiligheter i Hondón de las Nieves"),
    ]),
    profileForPolop(),
  );

  assert.deepEqual(guarded.matches.map((item) => item.propertyId), ["polop-1"]);
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
