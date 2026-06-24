import assert from "node:assert/strict";
import test from "node:test";
import {
  saveLeadPropertyShortlistDraft,
  stableLeadPropertyShortlistPayloadHash,
  type LeadPropertyShortlistRepository,
} from "./shortlist";
import { LeadIntelligenceReviewError } from "./review";
import type { PropertyMatchPreviewResult } from "./property-match-preview";
import type { CreateLeadPropertyShortlistInput } from "./persistence";

const buyerProfileId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const rejectedPropertyId = "33333333-3333-4333-8333-333333333333";
const correlationId = "rf_mqshort_0123456789abcdef01234567";
const qualityReview = {
  status: "client_ready" as const,
  note: "Freddy har kvalitetssjekket pris og lenke.",
  checkedAt: "2026-06-24T10:00:00.000Z",
  checkedBy: "freddy.bremseth@gmail.com",
};
const needsMoreReview = {
  status: "verify_price_availability" as const,
  note: "Pris og tilgjengelighet må bekreftes med megler.",
  checkedAt: "2026-06-24T10:05:00.000Z",
  checkedBy: "freddy.bremseth@gmail.com",
};

function matchResult(): PropertyMatchPreviewResult {
  return {
    buyerProfileId,
    discoveryMode: "auto",
    bestEffort: false,
    analyzed: 2,
    matched: 1,
    candidateLimit: 120,
    missingPropertyReferences: [],
    skippedProperties: [],
    sideEffects: {
      leadsCreated: false,
      contactsCreated: false,
      emailsSent: false,
      matchesPersisted: false,
      shortlistCreated: false,
    },
    matches: [
      {
        propertyId,
        score: 72,
        eligibility: "eligible",
        dataQualityScore: 61,
        hardRequirementResults: [],
        preferenceResults: [],
        exclusionResults: [],
        budgetResult: null,
        verifiedFacts: [],
        unverifiedFacts: [],
        reasonsForMatch: ["Location matches."],
        concerns: [],
        questionsToVerify: [],
        property: {
          id: propertyId,
          reference: "N8513",
          title: "Moraira apartment",
          location: "Moraira",
          propertyType: "apartment",
          price: 395000,
          bedrooms: 2,
          bathrooms: 2,
          primaryImageUrl: "https://images.example.test/property.jpg",
          publicUrl: "https://properties.example.test/N8513",
        },
      },
      {
        propertyId: rejectedPropertyId,
        score: 28,
        eligibility: "rejected",
        dataQualityScore: 50,
        hardRequirementResults: [],
        preferenceResults: [],
        exclusionResults: [],
        budgetResult: null,
        verifiedFacts: [],
        unverifiedFacts: [],
        reasonsForMatch: [],
        concerns: ["Outside preferred location."],
        questionsToVerify: [],
        property: {
          id: rejectedPropertyId,
          reference: "N9999",
          title: "Elche apartment",
          location: "Elche",
          propertyType: "apartment",
          price: 250000,
          bedrooms: 2,
          bathrooms: 2,
          primaryImageUrl: null,
          publicUrl: null,
        },
      },
    ],
  };
}

class MemoryShortlistRepository implements LeadPropertyShortlistRepository {
  calls: CreateLeadPropertyShortlistInput[] = [];
  constructor(private readonly response: Partial<Awaited<ReturnType<LeadPropertyShortlistRepository["createPropertyShortlistDraft"]>>> = {}) {}

  async createPropertyShortlistDraft(input: CreateLeadPropertyShortlistInput) {
    this.calls.push(input);
    return {
      id: "44444444-4444-4444-8444-444444444444",
      duplicate: false,
      payloadHashMatches: true,
      itemCount: input.items.length,
      ...this.response,
    };
  }
}

test("saves a shortlist draft from recomputed match results without external side effects", async () => {
  const repository = new MemoryShortlistRepository();
  const result = await saveLeadPropertyShortlistDraft({
    request: {
      brand: "soleada",
      buyerProfileId,
      title: "Emmadale shortlist",
      idempotencySeed: correlationId,
      items: [
        { propertyId, decision: "current", qualityReview },
        { propertyId: rejectedPropertyId, decision: "needs_research", qualityReview: needsMoreReview },
      ],
    },
    correlationId,
    createdBy: "freddy.bremseth@gmail.com",
    repository,
    matchResult: matchResult(),
  });

  assert.equal(result.shortlistId, "44444444-4444-4444-8444-444444444444");
  assert.equal(result.itemCount, 2);
  assert.equal(result.sideEffects.emailsSent, false);
  assert.equal(result.sideEffects.leadsCreated, false);
  assert.equal(result.sideEffects.contactsCreated, false);
  assert.equal(result.sideEffects.presentationCreated, false);
  assert.equal(repository.calls[0].items[0].propertyReference, "N8513");
  assert.equal(repository.calls[0].items[0].qualityReviewStatus, "client_ready");
  assert.equal(repository.calls[0].items[0].qualityReviewNote, "Freddy har kvalitetssjekket pris og lenke.");
  assert.equal(repository.calls[0].items[0].qualityReviewCheckedBy, "freddy.bremseth@gmail.com");
  assert.equal(repository.calls[0].items[1].systemEligibility, "rejected");
  assert.equal(repository.calls[0].items[1].qualityReviewStatus, "verify_price_availability");
});

test("shortlist draft idempotency is stable for identical selected payloads", async () => {
  const first = stableLeadPropertyShortlistPayloadHash({
    brand: "soleada",
    buyerProfileId,
    items: [{ propertyId, decision: "current", rank: 1 }],
  });
  const second = stableLeadPropertyShortlistPayloadHash({
    items: [{ rank: 1, decision: "current", propertyId }],
    buyerProfileId,
    brand: "soleada",
  });

  assert.equal(first, second);
});

test("duplicate shortlist draft returns existing id without inserting duplicate items", async () => {
  const repository = new MemoryShortlistRepository({
    duplicate: true,
    itemCount: 1,
  });

  const result = await saveLeadPropertyShortlistDraft({
    request: {
      brand: "soleada",
      buyerProfileId,
      idempotencySeed: correlationId,
      items: [{ propertyId, decision: "current", qualityReview }],
    },
    correlationId,
    createdBy: "freddy.bremseth@gmail.com",
    repository,
    matchResult: matchResult(),
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.itemCount, 1);
});

test("selected property must be present in the recomputed match result", async () => {
  await assert.rejects(
    saveLeadPropertyShortlistDraft({
      request: {
        brand: "soleada",
        buyerProfileId,
        idempotencySeed: correlationId,
        items: [{ propertyId: "55555555-5555-4555-8555-555555555555", decision: "current", qualityReview }],
      },
      correlationId,
      createdBy: "freddy.bremseth@gmail.com",
      repository: new MemoryShortlistRepository(),
      matchResult: matchResult(),
    }),
    /Selected property is not present/,
  );
});

test("same idempotency key with different payload is rejected as a safe conflict", async () => {
  await assert.rejects(
    saveLeadPropertyShortlistDraft({
      request: {
        brand: "soleada",
        buyerProfileId,
        idempotencySeed: correlationId,
        items: [{ propertyId, decision: "current", qualityReview }],
      },
      correlationId,
      createdBy: "freddy.bremseth@gmail.com",
      repository: new MemoryShortlistRepository({
        duplicate: true,
        payloadHashMatches: false,
      }),
      matchResult: matchResult(),
    }),
    (error) =>
      error instanceof LeadIntelligenceReviewError &&
      error.code === "REVIEW_CONFLICT" &&
      error.status === 409,
  );
});
