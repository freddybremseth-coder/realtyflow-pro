import assert from "node:assert/strict";
import test from "node:test";
import {
  saveLeadCustomerPresentationDraft,
  type LeadCustomerPresentationRepository,
} from "./presentation";
import { LeadIntelligenceError } from "./extraction";
import { LeadIntelligenceReviewError } from "./review";
import type {
  CreateLeadCustomerPresentationDraftInput,
  LeadCustomerPresentationShortlistSnapshot,
} from "./persistence";

const buyerProfileId = "11111111-1111-4111-8111-111111111111";
const shortlistId = "22222222-2222-4222-8222-222222222222";
const propertyId = "33333333-3333-4333-8333-333333333333";
const correlationId = "rf_mqpres_0123456789abcdef01234567";

function snapshot(overrides: Partial<LeadCustomerPresentationShortlistSnapshot> = {}): LeadCustomerPresentationShortlistSnapshot {
  return {
    brand: "soleada",
    buyerProfileId,
    shortlistId,
    shortlistTitle: "Moraira shortlist",
    buyerSummary: "Kunden ønsker villa rundt Moraira med 3 soverom.",
    budgetAmount: 700000,
    budgetCurrency: "EUR",
    budgetIncludesCosts: false,
    budgetApproximate: false,
    locationFlexible: true,
    items: [
      {
        propertyId,
        propertyReference: "N8513",
        propertyTitle: "Villa nær Moraira",
        propertyLocation: "Moraira",
        propertyPrice: 650000,
        propertyBedrooms: 3,
        propertyBathrooms: 2,
        propertyPrimaryImageUrl: "https://images.example.test/n8513.jpg",
        propertyPublicUrl: "https://properties.example.test/n8513",
        rank: 1,
        decision: "current",
        systemEligibility: "eligible",
        score: 82,
        dataQualityScore: 70,
        reasons: ["bedrooms matches (unverified).", "bathrooms matches (unverified)."],
        concerns: ["Availability must be verified."],
        questionsToVerify: ["Confirm community fees."],
        qualityReviewStatus: "client_ready",
        qualityReviewNote: "Freddy har kontrollert at denne kan deles med kunden.",
        qualityReviewCheckedAt: "2026-06-24T10:00:00.000Z",
        qualityReviewCheckedBy: "freddy.bremseth@gmail.com",
      },
    ],
    ...overrides,
  };
}

class MemoryPresentationRepository implements LeadCustomerPresentationRepository {
  calls: CreateLeadCustomerPresentationDraftInput[] = [];

  constructor(
    private readonly source: LeadCustomerPresentationShortlistSnapshot | null = snapshot(),
    private readonly response: Partial<Awaited<ReturnType<LeadCustomerPresentationRepository["createCustomerPresentationDraft"]>>> = {},
  ) {}

  async loadShortlistSnapshotForPresentation() {
    return this.source;
  }

  async getCustomerPresentationDraft() {
    return null;
  }

  async listCustomerPresentationDraftHistory() {
    return [];
  }

  async createCustomerPresentationDraft(input: CreateLeadCustomerPresentationDraftInput) {
    this.calls.push(input);
    return {
      presentationId: "44444444-4444-4444-8444-444444444444",
      messageDraftId: "55555555-5555-4555-8555-555555555555",
      duplicate: false,
      payloadHashMatches: true,
      ...this.response,
    };
  }
}

test("saves a deterministic presentation and email draft without external side effects", async () => {
  const repository = new MemoryPresentationRepository();
  const result = await saveLeadCustomerPresentationDraft({
    request: {
      brand: "soleada",
      buyerProfileId,
      shortlistId,
      idempotencySeed: correlationId,
      language: "nb",
    },
    correlationId,
    createdBy: "freddy.bremseth@gmail.com",
    repository,
  });

  assert.equal(result.presentationId, "44444444-4444-4444-8444-444444444444");
  assert.equal(result.messageDraftId, "55555555-5555-4555-8555-555555555555");
  assert.equal(result.status, "draft");
  assert.equal(result.messageStatus, "draft");
  assert.equal(result.itemCount, 1);
  assert.equal(result.messageDraft.subject.includes("Moraira"), true);
  assert.equal(result.messageDraft.bodyText.includes("Aktuelt fordi: Antall soverom ser ut til å passe, men må verifiseres."), true);
  assert.equal(result.messageDraft.bodyText.includes("Min vurdering: Freddy har kontrollert at denne kan deles med kunden."), true);
  assert.equal(result.messageDraft.bodyText.includes("bathrooms matches (unverified)"), false);
  assert.equal(result.messageDraft.bodyText.includes("Se boligen på nettsiden: https://properties.example.test/n8513"), true);
  assert.equal(result.messageDraft.bodyHtml?.includes('href="https://properties.example.test/n8513"'), true);
  assert.equal(result.presentationPreview.properties.length, 1);
  assert.equal(result.presentationPreview.properties[0].reference, "N8513");
  assert.equal(result.presentationPreview.properties[0].publicUrl, "https://properties.example.test/n8513");
  assert.equal(result.presentationPreview.properties[0].imageUrl, "https://images.example.test/n8513.jpg");
  assert.deepEqual(result.presentationPreview.properties[0].reasons.slice(0, 2), [
    "Antall soverom ser ut til å passe, men må verifiseres.",
    "Antall bad ser ut til å passe, men må verifiseres.",
  ]);
  assert.equal(result.presentationPreview.needs.some((item) => item.includes("Kunden ønsker villa")), true);
  assert.equal(result.sideEffects.emailSent, false);
  assert.equal(result.sideEffects.leadsCreated, false);
  assert.equal(result.sideEffects.contactsCreated, false);
  assert.equal(result.sideEffects.propertyMatchingStarted, false);
  assert.equal(result.sideEffects.presentationPublished, false);
  assert.equal(repository.calls[0].messageDraft.subject.includes("Moraira"), true);
  assert.equal(repository.calls[0].messageDraft.bodyText.includes("Villa nær Moraira"), true);
  assert.equal(repository.calls[0].messageDraft.bodyText.includes("Se boligen på nettsiden: https://properties.example.test/n8513"), true);
  assert.equal(repository.calls[0].messageDraft.bodyHtml?.includes('href="https://properties.example.test/n8513"'), true);
  assert.equal(repository.calls[0].messageDraft.bodyHtml?.includes("Se boligen på nettsiden"), true);
  assert.equal(repository.calls[0].messageDraft.sentAt, null);
  assert.equal(repository.calls[0].presentationJson && typeof repository.calls[0].presentationJson === "object", true);
});

test("presentation email draft does not fabricate missing property website links", async () => {
  const repository = new MemoryPresentationRepository(
    snapshot({
      items: [
        {
          ...snapshot().items[0],
          propertyPublicUrl: null,
        },
      ],
    }),
  );

  await saveLeadCustomerPresentationDraft({
    request: {
      brand: "soleada",
      buyerProfileId,
      shortlistId,
      idempotencySeed: correlationId,
      language: "nb",
    },
    correlationId,
    createdBy: "freddy.bremseth@gmail.com",
    repository,
  });

  assert.equal(repository.calls[0].messageDraft.bodyText.includes("Boliglenker kontrolleres før endelig sending."), true);
  assert.equal(repository.calls[0].messageDraft.bodyText.includes("Boliglenke mangler i systemet"), false);
  assert.equal(repository.calls[0].messageDraft.bodyHtml?.includes("Boliglenker kontrolleres før endelig sending."), true);
  assert.equal(repository.calls[0].messageDraft.bodyHtml?.includes("properties.example.test"), false);
});

test("presentation email draft summarizes repeated common match reasons once", async () => {
  const baseItem = snapshot().items[0];
  const repository = new MemoryPresentationRepository(
    snapshot({
      items: [
        baseItem,
        {
          ...baseItem,
          propertyId: "33333333-3333-4333-8333-333333333334",
          propertyReference: "N8514",
          propertyTitle: "Villa alternativ 2",
          rank: 2,
        },
        {
          ...baseItem,
          propertyId: "33333333-3333-4333-8333-333333333335",
          propertyReference: "N8515",
          propertyTitle: "Villa alternativ 3",
          rank: 3,
        },
      ],
    }),
  );

  await saveLeadCustomerPresentationDraft({
    request: {
      brand: "soleada",
      buyerProfileId,
      shortlistId,
      idempotencySeed: correlationId,
      language: "nb",
    },
    correlationId,
    createdBy: "freddy.bremseth@gmail.com",
    repository,
  });

  const body = repository.calls[0].messageDraft.bodyText;
  assert.equal(body.includes("Felles for forslagene er at romfordelingen ser ut til å passe behovet for soverom og bad."), true);
  assert.equal(body.includes("Passer fordi:"), false);
  assert.equal(body.includes("Aktuelt fordi: Antall soverom ser ut til å passe"), false);
  assert.equal(body.includes("Aktuelt fordi: Antall bad ser ut til å passe"), false);
});

test("presentation draft only uses Freddy client-ready shortlist items", async () => {
  const baseItem = snapshot().items[0];
  const repository = new MemoryPresentationRepository(
    snapshot({
      items: [
        baseItem,
        {
          ...baseItem,
          propertyId: "33333333-3333-4333-8333-333333333334",
          propertyReference: "N8514",
          propertyTitle: "Villa som må sjekkes",
          rank: 2,
          qualityReviewStatus: "verify_price_availability",
          qualityReviewNote: "Må bekrefte pris først.",
        },
      ],
    }),
  );

  const result = await saveLeadCustomerPresentationDraft({
    request: {
      brand: "soleada",
      buyerProfileId,
      shortlistId,
      idempotencySeed: correlationId,
      language: "nb",
    },
    correlationId,
    createdBy: "freddy.bremseth@gmail.com",
    repository,
  });

  assert.equal(result.itemCount, 1);
  assert.equal(result.messageDraft.bodyText.includes("Villa nær Moraira"), true);
  assert.equal(result.messageDraft.bodyText.includes("Villa som må sjekkes"), false);
  assert.equal(repository.calls[0].presentationJson && typeof repository.calls[0].presentationJson === "object", true);
});

test("presentation draft rejects shortlist without client-ready quality review", async () => {
  const repository = new MemoryPresentationRepository(
    snapshot({
      items: [
        {
          ...snapshot().items[0],
          qualityReviewStatus: "needs_review",
          qualityReviewNote: "Må kvalitetssikres før deling.",
        },
      ],
    }),
  );

  await assert.rejects(
    saveLeadCustomerPresentationDraft({
      request: {
        brand: "soleada",
        buyerProfileId,
        shortlistId,
        idempotencySeed: correlationId,
      },
      correlationId,
      createdBy: "freddy.bremseth@gmail.com",
      repository,
    }),
    (error) => error instanceof LeadIntelligenceError && error.code === "INVALID_REQUEST",
  );
  assert.equal(repository.calls.length, 0);
});

test("duplicate presentation draft returns existing IDs for identical payload", async () => {
  const repository = new MemoryPresentationRepository(snapshot(), {
    duplicate: true,
  });
  const result = await saveLeadCustomerPresentationDraft({
    request: {
      brand: "soleada",
      buyerProfileId,
      shortlistId,
      idempotencySeed: correlationId,
    },
    correlationId,
    createdBy: "freddy.bremseth@gmail.com",
    repository,
  });

  assert.equal(result.duplicate, true);
  assert.equal(repository.calls.length, 1);
});

test("same idempotency key with different presentation payload is rejected as conflict", async () => {
  await assert.rejects(
    saveLeadCustomerPresentationDraft({
      request: {
        brand: "soleada",
        buyerProfileId,
        shortlistId,
        idempotencySeed: correlationId,
        title: "Changed title",
      },
      correlationId,
      createdBy: "freddy.bremseth@gmail.com",
      repository: new MemoryPresentationRepository(snapshot(), {
        duplicate: true,
        payloadHashMatches: false,
        messageDraftId: null,
      }),
    }),
    (error) =>
      error instanceof LeadIntelligenceReviewError &&
      error.code === "REVIEW_CONFLICT" &&
      error.status === 409,
  );
});

test("missing or empty shortlist snapshot is rejected before persistence write", async () => {
  const missing = new MemoryPresentationRepository(null);
  await assert.rejects(
    saveLeadCustomerPresentationDraft({
      request: {
        brand: "soleada",
        buyerProfileId,
        shortlistId,
        idempotencySeed: correlationId,
      },
      correlationId,
      createdBy: "freddy.bremseth@gmail.com",
      repository: missing,
    }),
    (error) => error instanceof LeadIntelligenceError && error.code === "INVALID_REQUEST",
  );
  assert.equal(missing.calls.length, 0);

  const empty = new MemoryPresentationRepository(snapshot({ items: [] }));
  await assert.rejects(
    saveLeadCustomerPresentationDraft({
      request: {
        brand: "soleada",
        buyerProfileId,
        shortlistId,
        idempotencySeed: correlationId,
      },
      correlationId,
      createdBy: "freddy.bremseth@gmail.com",
      repository: empty,
    }),
    (error) => error instanceof LeadIntelligenceError && error.code === "INVALID_REQUEST",
  );
  assert.equal(empty.calls.length, 0);
});
