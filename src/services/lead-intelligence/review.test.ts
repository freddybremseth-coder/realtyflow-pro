import assert from "node:assert/strict";
import test from "node:test";
import {
  leadIntelligenceCriterionFingerprint,
  LeadIntelligenceReviewError,
  saveLeadIntelligenceReview,
  stableLeadIntelligenceIdempotencyKey,
  type LeadIntelligenceReviewRepository,
} from "./review";
import type {
  CreateBuyerProfileInput,
  LeadContactCandidateInput,
  RecordLeadAnalysisRunInput,
} from "./persistence";

const intakeId = "11111111-1111-4111-8111-111111111111";
const analysisRunId = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const contactId = "44444444-4444-4444-8444-444444444444";
const correlationId = "rf_mi7v4zk0_0123456789abcdef01234567";
const approvedAt = new Date("2026-06-14T12:00:00.000Z");

function extractedLead() {
  return {
    contact: {
      name: "Emmadale",
      phone: "+4790174714",
      email: null,
      language: null,
      country: "NO",
    },
    purchaseReadiness: {
      level: "ready_to_buy",
      confidence: 0.9,
      reasoning: "Kunden er kjøpeklar om riktig objekt dukker opp.",
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
        confidence: 0.95,
        appliesToPropertyTypes: ["apartment", "penthouse"],
      },
    ],
    preferences: [
      {
        key: "terrace_area_m2",
        operator: "gte",
        value: 20,
        sourceText: "Stor åpen terrasse eventuelt ut fra stue 20 kvm+",
        confidence: 0.9,
        weight: 0.8,
        appliesToPropertyTypes: ["apartment", "penthouse"],
      },
    ],
    exclusions: [
      {
        key: "future_building_risk",
        operator: "eq",
        value: true,
        sourceText: "kommunale tomten på siden som kan bygges på i fremtiden",
        confidence: 0.96,
        severity: "reject",
      },
    ],
    missingInformation: [
      {
        key: "availability_status",
        question: "Når ønsker kunden å kjøpe?",
        priority: "high",
      },
    ],
    summary: "Kjøpeklar kunde med fleksibelt område og budsjett ca. 440.000 EUR inkludert omkostninger.",
    suggestedNextAction: "Avklar finansiering og absolutt budsjettgrense.",
  };
}

function baseRequest(overrides: Record<string, unknown> = {}) {
  const analysis = extractedLead();
  return {
    brand: "soleada",
    source: "phone_call",
    rawText: "Restricted reviewed intake text",
    language: "no",
    correlationId,
    analysis,
    analysisMeta: {
      model: "mock-lead-model",
      promptVersion: "lead-intelligence-extraction-v1",
      durationMs: 100,
      repaired: false,
    },
    contactDecision: {
      action: "continue_without_contact",
      contactId: null,
      explicitApproval: true,
    },
    reviewedCriteria: reviewedCriteriaFor(analysis),
    ...overrides,
  };
}

function reviewedCriteriaFor(analysis = extractedLead()) {
  return [
    {
      criterionType: "hard_requirement",
      fingerprint: leadIntelligenceCriterionFingerprint({
        criterionType: "hard_requirement",
        index: 0,
        item: analysis.hardRequirements[0],
      }),
      approvalStatus: "approved",
      customerConfirmed: true,
    },
    {
      criterionType: "preference",
      fingerprint: leadIntelligenceCriterionFingerprint({
        criterionType: "preference",
        index: 0,
        item: analysis.preferences[0],
      }),
      approvalStatus: "approved",
      customerConfirmed: false,
    },
    {
      criterionType: "exclusion",
      fingerprint: leadIntelligenceCriterionFingerprint({
        criterionType: "exclusion",
        index: 0,
        item: analysis.exclusions[0],
      }),
      approvalStatus: "approved",
      customerConfirmed: false,
    },
    {
      criterionType: "missing_information",
      fingerprint: leadIntelligenceCriterionFingerprint({
        criterionType: "missing_information",
        index: 0,
        item: analysis.missingInformation[0],
      }),
      approvalStatus: "rejected",
      customerConfirmed: false,
    },
  ];
}

class CaptureRepository implements LeadIntelligenceReviewRepository {
  intakes: unknown[] = [];
  analysisRuns: RecordLeadAnalysisRunInput[] = [];
  candidates: LeadContactCandidateInput[][] = [];
  profiles: CreateBuyerProfileInput[] = [];

  async createIntake(input: any) {
    this.intakes.push(input);
    return { id: intakeId, duplicate: false };
  }

  async recordAnalysisRun(input: RecordLeadAnalysisRunInput) {
    this.analysisRuns.push(input);
    return { id: analysisRunId, duplicate: false };
  }

  async recordContactCandidates(input: LeadContactCandidateInput[]) {
    this.candidates.push(input);
    return input.map((_, index) => `candidate-${index + 1}`);
  }

  async createBuyerProfile(input: CreateBuyerProfileInput) {
    this.profiles.push(input);
    return { id: profileId, criterionCount: input.criteria.length };
  }
}

test("saveLeadIntelligenceReview writes intake, analysis, candidates, and approved profile", async () => {
  const repo = new CaptureRepository();
  const serverContactCandidates = [
    {
      contactId,
      name: "Emmadale",
      maskedPhone: "+47***14",
      maskedEmail: null,
      matchType: "exact_phone" as const,
      confidence: 0.98,
      reasons: ["Eksakt verifisert E.164-telefon"],
      matchValueHash: "hmac-sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  ];
  const result = await saveLeadIntelligenceReview({
    request: baseRequest({
      contactDecision: {
        action: "connect_existing",
        contactId,
        explicitApproval: true,
      },
    }),
    repository: repo,
    serverContactCandidates,
    approvedBy: "Freddy.Bremseth@gmail.com",
    now: approvedAt,
  });

  assert.equal(result.intake.id, intakeId);
  assert.equal(result.contactCandidates.linkedContact, true);
  assert.equal(result.contactCandidates.createdContact, false);
  assert.equal(repo.intakes.length, 1);
  assert.equal(repo.analysisRuns[0].approved, true);
  assert.equal(repo.analysisRuns[0].approvedBy, "freddy.bremseth@gmail.com");
  assert.equal(repo.candidates[0][0].status, "selected");
  assert.equal(repo.profiles[0].contactId, contactId);
  assert.equal(repo.profiles[0].status, "approved");
  assert.equal(repo.profiles[0].criteria.length, 4);
  assert.equal(repo.profiles[0].criteria[3].active, false);
  assert.equal((repo.intakes[0] as any).rawTextRestricted, null);
  assert.equal((repo.intakes[0] as any).rawTextRetentionUntil, null);
});

test("review save requires every criterion to have item-level approval", async () => {
  await assert.rejects(
    () =>
      saveLeadIntelligenceReview({
        request: baseRequest({
          reviewedCriteria: [
            {
              criterionType: "hard_requirement",
              fingerprint: leadIntelligenceCriterionFingerprint({
                criterionType: "hard_requirement",
                index: 0,
                item: extractedLead().hardRequirements[0],
              }),
              approvalStatus: "approved",
              customerConfirmed: true,
            },
          ],
        }),
        repository: new CaptureRepository(),
        serverContactCandidates: [],
        approvedBy: "freddy.bremseth@gmail.com",
        now: approvedAt,
      }),
    /All criteria require item-level review/,
  );
});

test("connect_existing must point to a server-verified contact candidate", async () => {
  await assert.rejects(
    () =>
      saveLeadIntelligenceReview({
        request: baseRequest({
          contactDecision: {
            action: "connect_existing",
            contactId,
            explicitApproval: true,
          },
        }),
        repository: new CaptureRepository(),
        serverContactCandidates: [],
        approvedBy: "freddy.bremseth@gmail.com",
        now: approvedAt,
      }),
    (error) =>
      error instanceof LeadIntelligenceReviewError &&
      error.code === "CONTACT_CANDIDATE_STALE",
  );
});

test("create_new decision does not create or link a contact in this phase", async () => {
  const repo = new CaptureRepository();
  const result = await saveLeadIntelligenceReview({
    request: baseRequest({
      contactDecision: {
        action: "create_new",
        contactId: null,
        explicitApproval: true,
      },
    }),
    repository: repo,
    serverContactCandidates: [],
    approvedBy: "freddy.bremseth@gmail.com",
    now: approvedAt,
  });

  assert.equal(result.contactCandidates.createdContact, false);
  assert.equal(result.contactCandidates.linkedContact, false);
  assert.equal(repo.profiles[0].contactId, null);
});

test("review fingerprints invalidate stale or reordered item-level approvals", async () => {
  const analysis = extractedLead();
  const reordered = {
    ...analysis,
    hardRequirements: [
      {
        key: "has_lift",
        operator: "eq",
        value: true,
        sourceText: "Må være heis om det er opp i etasjene.",
        confidence: 0.9,
        appliesToPropertyTypes: ["apartment", "penthouse"],
      },
      analysis.hardRequirements[0],
    ],
  };

  await assert.rejects(
    () =>
      saveLeadIntelligenceReview({
        request: baseRequest({
          analysis: reordered,
          reviewedCriteria: reviewedCriteriaFor(analysis),
        }),
        repository: new CaptureRepository(),
        serverContactCandidates: [],
        approvedBy: "freddy.bremseth@gmail.com",
        now: approvedAt,
      }),
    /All criteria require item-level review/,
  );
});

test("idempotent duplicate save returns existing records without duplicate criteria", async () => {
  class DuplicateRepository extends CaptureRepository {
    override async createIntake(input: any) {
      this.intakes.push(input);
      return { id: intakeId, duplicate: true };
    }

    override async recordAnalysisRun(input: RecordLeadAnalysisRunInput) {
      this.analysisRuns.push(input);
      return { id: analysisRunId, duplicate: true };
    }

    override async createBuyerProfile(input: CreateBuyerProfileInput) {
      this.profiles.push(input);
      return { id: profileId, criterionCount: input.criteria.length, duplicate: true };
    }
  }

  const result = await saveLeadIntelligenceReview({
    request: baseRequest(),
    repository: new DuplicateRepository(),
    serverContactCandidates: [],
    approvedBy: "freddy.bremseth@gmail.com",
    now: approvedAt,
  });

  assert.equal(result.intake.duplicate, true);
  assert.equal(result.analysisRun.duplicate, true);
  assert.equal(result.buyerProfile.duplicate, true);
  assert.equal(result.contactCandidates.duplicate, true);
});

test("idempotent review can resume after a partial intake-only write", async () => {
  class PartialIntakeRepository extends CaptureRepository {
    override async createIntake(input: any) {
      this.intakes.push(input);
      return { id: intakeId, duplicate: true };
    }
  }

  const repo = new PartialIntakeRepository();
  const result = await saveLeadIntelligenceReview({
    request: baseRequest(),
    repository: repo,
    serverContactCandidates: [],
    approvedBy: "freddy.bremseth@gmail.com",
    now: approvedAt,
  });

  assert.equal(result.intake.duplicate, true);
  assert.equal(result.analysisRun.duplicate, false);
  assert.equal(result.buyerProfile.duplicate, false);
  assert.equal(repo.profiles.length, 1);
});

test("stable idempotency keys are deterministic and exclude transient ordering", () => {
  const first = stableLeadIntelligenceIdempotencyKey("lead-intake-v1", {
    brand: "soleada",
    rawText: "same",
    nested: { b: 2, a: 1 },
  });
  const second = stableLeadIntelligenceIdempotencyKey("lead-intake-v1", {
    nested: { a: 1, b: 2 },
    rawText: "same",
    brand: "soleada",
  });

  assert.equal(first, second);
});
