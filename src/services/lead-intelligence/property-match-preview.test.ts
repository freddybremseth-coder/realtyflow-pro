import assert from "node:assert/strict";
import test from "node:test";
import type { QueryClient } from "./persistence";
import {
  LeadPropertyMatchPreviewRequestSchema,
  isMissingPropertyReferenceColumnError,
  loadApprovedLeadMatchProfileWithDb,
  previewLeadPropertyMatches,
  previewLeadPropertyMatchesForProfile,
} from "./property-match-preview";
import type { LeadMatchProfile } from "./property-matching";

const buyerProfileId = "11111111-1111-4111-8111-111111111111";
const intakeId = "55555555-5555-4555-8555-555555555555";
const eligiblePropertyId = "22222222-2222-4222-8222-222222222222";
const rejectedPropertyId = "33333333-3333-4333-8333-333333333333";
const crossBrandPropertyId = "44444444-4444-4444-8444-444444444444";
const eligiblePropertyRef = "N8513";

function approvedProfile(): LeadMatchProfile {
  return {
    buyerProfileId,
    budget: {
      amount: 440000,
      currency: "EUR",
      includesCosts: true,
      approximate: true,
      hardLimit: null,
    },
    propertyTypes: ["apartment", "penthouse"],
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
        value: 20,
        weight: 0.8,
        sourceText: "Stor aapen terrasse 20 kvm+.",
      },
    ],
    exclusions: [
      {
        key: "future_building_risk",
        operator: "eq",
        value: true,
        severity: "reject",
        sourceText: "Kommunal tomt kan bygges paa.",
      },
    ],
  };
}

test("property match preview request validates brand, references, legacy ids, bounds and duplicates", () => {
  const autoParse = LeadPropertyMatchPreviewRequestSchema.safeParse({
    brand: "soleada",
    buyerProfileId,
    autoDiscover: true,
    candidateLimit: 25,
    maxResults: 5,
  });
  assert.equal(autoParse.success, true);
  if (autoParse.success) {
    assert.equal(autoParse.data.autoDiscover, true);
    assert.deepEqual(autoParse.data.propertyReferences, []);
    assert.equal(autoParse.data.candidateLimit, 25);
  }

  const refParse = LeadPropertyMatchPreviewRequestSchema.safeParse({
    brand: "soleada",
    buyerProfileId,
    propertyReferences: [eligiblePropertyRef],
  });
  assert.equal(refParse.success, true);
  if (refParse.success) {
    assert.deepEqual(refParse.data.propertyReferences, [eligiblePropertyRef]);
  }

  const legacyIdParse = LeadPropertyMatchPreviewRequestSchema.safeParse({
    brand: "soleada",
    buyerProfileId,
    propertyIds: [eligiblePropertyId],
  });
  assert.equal(legacyIdParse.success, true);
  if (legacyIdParse.success) {
    assert.deepEqual(legacyIdParse.data.propertyReferences, [eligiblePropertyId]);
  }

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "neuralbeat",
      buyerProfileId,
      propertyReferences: [eligiblePropertyRef],
    }).success,
    false,
  );

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "soleada",
      buyerProfileId,
      propertyReferences: Array.from({ length: 21 }, (_, index) => `N${String(index).padStart(4, "0")}`),
    }).success,
    false,
  );

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "soleada",
      buyerProfileId,
      propertyReferences: [eligiblePropertyRef, eligiblePropertyRef.toLowerCase()],
    }).success,
    false,
  );

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "soleada",
      buyerProfileId,
      propertyReferences: ["https://example.com/property"],
    }).success,
    false,
  );

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "soleada",
      buyerProfileId,
      autoDiscover: true,
      propertyReferences: [eligiblePropertyRef],
    }).success,
    false,
  );

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "soleada",
      buyerProfileId,
    }).success,
    false,
  );
});

test("property lookup treats missing optional reference columns as non-fatal only", () => {
  assert.equal(isMissingPropertyReferenceColumnError({ code: "42703" }), true);
  assert.equal(isMissingPropertyReferenceColumnError({ code: "PGRST204" }), true);
  assert.equal(isMissingPropertyReferenceColumnError({ code: "42501" }), false);
  assert.equal(isMissingPropertyReferenceColumnError({ code: "PGRST301" }), false);
  assert.equal(isMissingPropertyReferenceColumnError({ code: undefined }), false);
});

test("loads approved buyer profile as deterministic match profile", async () => {
  class ProfileDb implements QueryClient {
    queries: string[] = [];
    async query<T>(sql: string) {
      this.queries.push(sql);
      if (sql.includes("from public.buyer_profiles")) {
        return {
          rows: [
            {
              id: buyerProfileId,
              intakeId,
              budgetAmount: 440000,
              budgetCurrency: "EUR",
              budgetIncludesCosts: true,
              budgetApproximate: true,
              locationFlexible: true,
            },
          ] as T[],
        };
      }
      if (sql.includes("from public.lead_analysis_runs")) {
        return {
          rows: [
            {
              resultJson: {
                schemaVersion: "lead-intelligence-review-save-v1",
                reviewPayloadHash: "sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                analysis: {
                  contact: {
                    name: "Test",
                    phone: null,
                    email: null,
                    language: "no",
                    country: "NO",
                  },
                  purchaseReadiness: {
                    level: "warm",
                    confidence: 0.8,
                    reasoning: "Approved analysis fixture.",
                  },
                  budget: {
                    amount: 440000,
                    currency: "EUR",
                    includesCosts: true,
                    approximate: true,
                    hardLimit: null,
                  },
                  propertyTypes: ["apartment"],
                  locations: {
                    preferred: ["Moreira"],
                    excluded: ["Polop"],
                    flexible: false,
                  },
                  hardRequirements: [],
                  preferences: [],
                  exclusions: [],
                  missingInformation: [],
                  summary: "Wants Moraira.",
                  suggestedNextAction: "Preview matches.",
                },
              },
            },
          ] as T[],
        };
      }
      return {
        rows: [
          {
            criterionType: "hard_requirement",
            key: "bedrooms",
            otherKey: null,
            operator: "gte",
            value: 2,
            weight: null,
            severity: null,
            appliesToPropertyTypes: [],
            sourceText: "Minst 2 soverom.",
            confidence: 0.9,
          },
          {
            criterionType: "preference",
            key: "terrace_area_m2",
            otherKey: null,
            operator: "gte",
            value: 20,
            weight: 0.8,
            severity: null,
            appliesToPropertyTypes: ["apartment"],
            sourceText: "Terrasse 20 kvm+.",
            confidence: 0.8,
          },
          {
            criterionType: "exclusion",
            key: "future_building_risk",
            otherKey: null,
            operator: "eq",
            value: true,
            weight: null,
            severity: "reject",
            appliesToPropertyTypes: [],
            sourceText: "Nabotomt kan bygges paa.",
            confidence: 0.95,
          },
        ] as T[],
      };
    }
  }

  const db = new ProfileDb();
  const profile = await loadApprovedLeadMatchProfileWithDb(db, {
    brand: "soleada",
    buyerProfileId,
  });

  assert.equal(profile?.buyerProfileId, buyerProfileId);
  assert.equal(profile?.budget.amount, 440000);
  assert.equal(profile?.hardRequirements.length, 1);
  assert.equal(profile?.preferences[0].weight, 0.8);
  assert.equal(profile?.exclusions[0].severity, "reject");
  assert.deepEqual(profile?.locations.preferred, ["Moraira"]);
  assert.deepEqual(profile?.locations.excluded, ["Polop"]);
  assert.equal(db.queries.some((sql) => sql.includes("status = 'approved'")), true);
});

test("loads persisted criteria with buyer-friendly matching normalization", async () => {
  class ProfileDb implements QueryClient {
    async query<T>(sql: string) {
      if (sql.includes("from public.buyer_profiles")) {
        return {
          rows: [
            {
              id: buyerProfileId,
              intakeId,
              budgetAmount: 600000,
              budgetCurrency: "EUR",
              budgetIncludesCosts: true,
              budgetApproximate: true,
              locationFlexible: true,
            },
          ] as T[],
        };
      }
      if (sql.includes("from public.lead_analysis_runs")) {
        return { rows: [] as T[] };
      }
      return {
        rows: [
          {
            criterionType: "hard_requirement",
            key: "purchase_price",
            otherKey: null,
            operator: "eq",
            value: 600000,
            weight: null,
            severity: null,
            appliesToPropertyTypes: [],
            sourceText: "600000 euro",
            confidence: 0.8,
          },
          {
            criterionType: "hard_requirement",
            key: "bedrooms",
            otherKey: null,
            operator: "eq",
            value: 2,
            weight: null,
            severity: null,
            appliesToPropertyTypes: [],
            sourceText: "2 soverom",
            confidence: 0.8,
          },
          {
            criterionType: "hard_requirement",
            key: "bathrooms",
            otherKey: null,
            operator: "eq",
            value: 2,
            weight: null,
            severity: null,
            appliesToPropertyTypes: [],
            sourceText: "2 bad",
            confidence: 0.8,
          },
        ] as T[],
      };
    }
  }

  const profile = await loadApprovedLeadMatchProfileWithDb(new ProfileDb(), {
    brand: "soleada",
    buyerProfileId,
  });

  assert.equal(profile?.hardRequirements.some((criterion) => criterion.key === "purchase_price"), false);
  assert.equal(profile?.hardRequirements.find((criterion) => criterion.key === "bedrooms")?.operator, "gte");
  assert.equal(profile?.hardRequirements.find((criterion) => criterion.key === "bathrooms")?.operator, "gte");

  const result = await previewLeadPropertyMatchesForProfile(
    {
      brand: "soleada",
      buyerProfileId,
      propertyReferences: [eligiblePropertyRef],
    },
    profile!,
    async () => [
      {
        id: eligiblePropertyId,
        ref: eligiblePropertyRef,
        brand: "soleada",
        property_type: "villa",
        price: 505500,
        bedrooms: 3,
        bathrooms: 3,
      },
    ],
  );

  assert.equal(result.matched, 1);
  assert.equal(result.matches[0].eligibility, "eligible");
  assert.equal(result.matches[0].hardRequirementResults.some((row) => row.key === "purchase_price"), false);
});

test("preview ranks explicit property set and returns only safe match DTOs", async () => {
  const result = await previewLeadPropertyMatchesForProfile(
    {
      brand: "soleada",
      buyerProfileId,
      propertyReferences: [eligiblePropertyRef, rejectedPropertyId],
    },
    approvedProfile(),
    async (_brand, references) => {
      assert.deepEqual(references, [eligiblePropertyRef, rejectedPropertyId]);
      return [
        {
          id: rejectedPropertyId,
          brand: "soleada",
          property_type: "apartment",
          price: 450000,
          bedrooms: 2,
          has_lift: true,
          terrace_area_m2: 30,
        },
        {
          id: eligiblePropertyId,
          ref: eligiblePropertyRef,
          title: "Finestrat top apartment",
          town: "Finestrat",
          brand: "soleada",
          property_type: "apartment",
          price: 360000,
          bedrooms: 2,
          bathrooms: 2,
          has_lift: true,
          terrace_area_m2: 24,
          future_building_risk: false,
          image_url: "https://images.example.test/property.jpg",
          listing_url: "https://properties.example.test/N8513",
        },
      ];
    },
  );

  assert.equal(result.analyzed, 2);
  assert.equal(result.discoveryMode, "explicit");
  assert.equal(result.matched, 1);
  assert.equal(result.candidateLimit, null);
  assert.equal(result.matches[0].propertyId, eligiblePropertyId);
  assert.equal(result.matches[0].property.reference, eligiblePropertyRef);
  assert.equal(result.matches[0].property.title, "Finestrat top apartment");
  assert.equal(result.matches[0].property.location, "Finestrat");
  assert.equal(result.matches[0].property.price, 360000);
  assert.equal(result.matches[0].property.bathrooms, 2);
  assert.equal(result.matches[0].property.primaryImageUrl, "https://images.example.test/property.jpg");
  assert.equal(result.matches[0].property.publicUrl, "https://properties.example.test/N8513");
  assert.equal(result.matches[1].eligibility, "rejected");
  assert.equal(result.sideEffects.emailsSent, false);
  assert.equal(result.sideEffects.matchesPersisted, false);
  assert.equal(JSON.stringify(result).includes("service_role"), false);
  assert.equal(JSON.stringify(result).includes("raw"), false);
});

test("preview can auto-discover bounded inventory candidates without explicit references", async () => {
  const result = await previewLeadPropertyMatches(
    LeadPropertyMatchPreviewRequestSchema.parse({
      brand: "soleada",
      buyerProfileId,
      autoDiscover: true,
      candidateLimit: 3,
      maxResults: 2,
    }),
    {
      loadApprovedBuyerProfile: async () => approvedProfile(),
      loadProperties: async () => {
        throw new Error("explicit lookup should not run");
      },
      loadCandidateProperties: async (_brand, _profile, candidateLimit) => {
        assert.equal(candidateLimit, 3);
        return [
          {
            id: eligiblePropertyId,
            brand: "soleada",
            property_type: "apartment",
            price: 360000,
            bedrooms: 2,
            has_lift: true,
            terrace_area_m2: 24,
            future_building_risk: false,
          },
          {
            id: rejectedPropertyId,
            brand: "soleada",
            property_type: "apartment",
            price: 650000,
            bedrooms: 1,
            has_lift: true,
          },
        ];
      },
    },
  );

  assert.equal(result.discoveryMode, "auto");
  assert.equal(result.candidateLimit, 3);
  assert.equal(result.analyzed, 2);
  assert.equal(result.matched, 1);
  assert.equal(result.missingPropertyReferences.length, 0);
  assert.equal(result.matches.length, 2);
  assert.equal(result.sideEffects.shortlistCreated, false);
});

test("preview marks missing and cross-brand properties without leaking raw rows", async () => {
  const result = await previewLeadPropertyMatchesForProfile(
    {
      brand: "soleada",
      buyerProfileId,
      propertyReferences: [eligiblePropertyId, crossBrandPropertyId],
    },
    approvedProfile(),
    async () => [
      {
        id: eligiblePropertyId,
        brand: "soleada",
        property_type: "apartment",
        price: 360000,
        bedrooms: 2,
        has_lift: true,
      },
      {
        id: crossBrandPropertyId,
        brand: "zeneco",
        property_type: "apartment",
        price: 360000,
        bedrooms: 2,
        has_lift: true,
        internal_notes: "do not expose this text",
      },
    ],
  );

  assert.equal(result.missingPropertyReferences.length, 0);
  assert.deepEqual(result.skippedProperties, [
    { propertyId: crossBrandPropertyId, reason: "PROPERTY_BRAND_MISMATCH" },
  ]);
  assert.equal(JSON.stringify(result).includes("internal_notes"), false);
  assert.equal(JSON.stringify(result).includes("do not expose"), false);
});

test("preview can match properties resolved through legacy reference field", async () => {
  const result = await previewLeadPropertyMatchesForProfile(
    {
      brand: "soleada",
      buyerProfileId,
      propertyReferences: ["N8514"],
    },
    approvedProfile(),
    async () => [
      {
        id: eligiblePropertyId,
        reference: "N8514",
        brand: "soleada",
        property_type: "apartment",
        price: 360000,
        bedrooms: 2,
        has_lift: true,
        terrace_area_m2: 24,
      },
    ],
  );

  assert.equal(result.missingPropertyReferences.length, 0);
  assert.equal(result.matched, 1);
});

test("preview reports unknown buyer profile as stable safe error", async () => {
  await assert.rejects(
    () =>
      previewLeadPropertyMatches(
        {
          brand: "soleada",
          buyerProfileId,
          propertyReferences: [eligiblePropertyRef],
        },
        {
          loadApprovedBuyerProfile: async () => null,
          loadProperties: async () => [],
        },
      ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "BUYER_PROFILE_NOT_FOUND",
  );
});
