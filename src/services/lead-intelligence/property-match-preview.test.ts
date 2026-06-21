import assert from "node:assert/strict";
import test from "node:test";
import type { QueryClient } from "./persistence";
import {
  LeadPropertyMatchPreviewRequestSchema,
  loadApprovedLeadMatchProfileWithDb,
  previewLeadPropertyMatches,
  previewLeadPropertyMatchesForProfile,
} from "./property-match-preview";
import type { LeadMatchProfile } from "./property-matching";

const buyerProfileId = "11111111-1111-4111-8111-111111111111";
const eligiblePropertyId = "22222222-2222-4222-8222-222222222222";
const rejectedPropertyId = "33333333-3333-4333-8333-333333333333";
const crossBrandPropertyId = "44444444-4444-4444-8444-444444444444";

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

test("property match preview request validates brand, ids, bounds and duplicates", () => {
  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "soleada",
      buyerProfileId,
      propertyIds: [eligiblePropertyId],
    }).success,
    true,
  );

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "neuralbeat",
      buyerProfileId,
      propertyIds: [eligiblePropertyId],
    }).success,
    false,
  );

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "soleada",
      buyerProfileId,
      propertyIds: Array.from({ length: 21 }, (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      ),
    }).success,
    false,
  );

  assert.equal(
    LeadPropertyMatchPreviewRequestSchema.safeParse({
      brand: "soleada",
      buyerProfileId,
      propertyIds: [eligiblePropertyId, eligiblePropertyId],
    }).success,
    false,
  );
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
              budgetAmount: 440000,
              budgetCurrency: "EUR",
              budgetIncludesCosts: true,
              budgetApproximate: true,
              locationFlexible: true,
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
  assert.equal(db.queries.some((sql) => sql.includes("status = 'approved'")), true);
});

test("preview ranks explicit property set and returns only safe match DTOs", async () => {
  const result = await previewLeadPropertyMatchesForProfile(
    {
      brand: "soleada",
      buyerProfileId,
      propertyIds: [eligiblePropertyId, rejectedPropertyId],
    },
    approvedProfile(),
    async () => [
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
        brand: "soleada",
        property_type: "apartment",
        price: 360000,
        bedrooms: 2,
        has_lift: true,
        terrace_area_m2: 24,
        future_building_risk: false,
      },
    ],
  );

  assert.equal(result.analyzed, 2);
  assert.equal(result.matched, 2);
  assert.equal(result.matches[0].propertyId, eligiblePropertyId);
  assert.equal(result.sideEffects.emailsSent, false);
  assert.equal(result.sideEffects.matchesPersisted, false);
  assert.equal(JSON.stringify(result).includes("service_role"), false);
  assert.equal(JSON.stringify(result).includes("raw"), false);
});

test("preview marks missing and cross-brand properties without leaking raw rows", async () => {
  const result = await previewLeadPropertyMatchesForProfile(
    {
      brand: "soleada",
      buyerProfileId,
      propertyIds: [eligiblePropertyId, crossBrandPropertyId],
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

  assert.equal(result.missingPropertyIds.length, 0);
  assert.deepEqual(result.skippedProperties, [
    { propertyId: crossBrandPropertyId, reason: "PROPERTY_BRAND_MISMATCH" },
  ]);
  assert.equal(JSON.stringify(result).includes("internal_notes"), false);
  assert.equal(JSON.stringify(result).includes("do not expose"), false);
});

test("preview reports unknown buyer profile as stable safe error", async () => {
  await assert.rejects(
    () =>
      previewLeadPropertyMatches(
        {
          brand: "soleada",
          buyerProfileId,
          propertyIds: [eligiblePropertyId],
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
