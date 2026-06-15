import assert from "node:assert/strict";
import test from "node:test";
import {
  leadIntelligenceCriterionFingerprint,
  LeadIntelligenceReviewError,
  saveLeadIntelligenceReview,
  stableLeadIntelligenceIdempotencyKey,
  stableLeadIntelligenceReviewPayloadHash,
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
const serverContactCandidate = {
  contactId,
  name: "Emmadale",
  maskedPhone: "+47***14",
  maskedEmail: null,
  matchType: "exact_phone" as const,
  confidence: 0.98,
  reasons: ["Eksakt verifisert E.164-telefon"],
  matchValueHash: "hmac-sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};

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
    return { id: analysisRunId, duplicate: false, payloadHashMatches: true };
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

class StatefulRepository extends CaptureRepository {
  private intake: { id: string; key: string } | null = null;
  private analysis: { id: string; key: string; payloadHash: string | null } | null = null;
  private profile: { id: string; intakeId: string; criterionCount: number } | null = null;

  override async createIntake(input: any) {
    this.intakes.push(input);
    if (this.intake && this.intake.key === input.idempotencyKey) {
      return { id: this.intake.id, duplicate: true };
    }
    this.intake = { id: intakeId, key: input.idempotencyKey };
    return { id: intakeId, duplicate: false };
  }

  override async recordAnalysisRun(input: RecordLeadAnalysisRunInput) {
    this.analysisRuns.push(input);
    const payloadHash =
      input.reviewPayloadHash ||
      (input.resultJson &&
      typeof input.resultJson === "object" &&
      !Array.isArray(input.resultJson) &&
      typeof (input.resultJson as { reviewPayloadHash?: unknown }).reviewPayloadHash === "string"
        ? (input.resultJson as { reviewPayloadHash: string }).reviewPayloadHash
        : null);
    if (this.analysis && this.analysis.key === input.idempotencyKey) {
      return {
        id: this.analysis.id,
        duplicate: true,
        payloadHashMatches: this.analysis.payloadHash === payloadHash,
      };
    }
    this.analysis = { id: analysisRunId, key: input.idempotencyKey, payloadHash };
    return { id: analysisRunId, duplicate: false, payloadHashMatches: true };
  }

  override async createBuyerProfile(input: CreateBuyerProfileInput) {
    if (this.profile && this.profile.intakeId === input.intakeId) {
      return {
        id: this.profile.id,
        criterionCount: this.profile.criterionCount,
        duplicate: true,
      };
    }
    this.profiles.push(input);
    this.profile = {
      id: profileId,
      intakeId: input.intakeId,
      criterionCount: input.criteria.length,
    };
    return { id: profileId, criterionCount: input.criteria.length, duplicate: false };
  }
}

test("saveLeadIntelligenceReview writes intake, analysis, candidates, and approved profile", async () => {
  const repo = new CaptureRepository();
  const result = await saveLeadIntelligenceReview({
    request: baseRequest({
      contactDecision: {
        action: "connect_existing",
        contactId,
        explicitApproval: true,
      },
    }),
    repository: repo,
    serverContactCandidates: [serverContactCandidate],
    approvedBy: "Freddy.Bremseth@gmail.com",
    now: approvedAt,
  });

  assert.equal(result.intake.id, intakeId);
  assert.equal(result.contactCandidates.linkedContact, true);
  assert.equal(result.contactCandidates.createdContact, false);
  assert.equal(repo.intakes.length, 1);
  assert.equal(repo.analysisRuns[0].approved, true);
  assert.equal(repo.analysisRuns[0].approvedBy, "freddy.bremseth@gmail.com");
  assert.equal(
    (repo.analysisRuns[0].resultJson as { reviewPayloadHash?: string }).reviewPayloadHash,
    repo.analysisRuns[0].reviewPayloadHash,
  );
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
      return { id: analysisRunId, duplicate: true, payloadHashMatches: true };
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

test("identical review request twice returns same IDs without duplicate criteria or candidates", async () => {
  const repo = new StatefulRepository();
  const first = await saveLeadIntelligenceReview({
    request: baseRequest({
      contactDecision: {
        action: "connect_existing",
        contactId,
        explicitApproval: true,
      },
    }),
    repository: repo,
    serverContactCandidates: [serverContactCandidate],
    approvedBy: "freddy.bremseth@gmail.com",
    now: approvedAt,
  });
  const second = await saveLeadIntelligenceReview({
    request: baseRequest({
      contactDecision: {
        action: "connect_existing",
        contactId,
        explicitApproval: true,
      },
    }),
    repository: repo,
    serverContactCandidates: [serverContactCandidate],
    approvedBy: "freddy.bremseth@gmail.com",
    now: approvedAt,
  });

  assert.deepEqual(
    {
      intake: second.intake.id,
      analysis: second.analysisRun.id,
      profile: second.buyerProfile.id,
    },
    {
      intake: first.intake.id,
      analysis: first.analysisRun.id,
      profile: first.buyerProfile.id,
    },
  );
  assert.equal(second.status.newlySaved, false);
  assert.equal(second.status.duplicate, true);
  assert.equal(second.status.conflict, false);
  assert.equal(repo.profiles.length, 1);
  assert.equal(repo.candidates.length, 1);
});

async function assertReviewConflict(input: {
  first?: Record<string, unknown>;
  second: Record<string, unknown>;
  serverContactCandidates?: typeof serverContactCandidate[];
}) {
  const repo = new StatefulRepository();
  await saveLeadIntelligenceReview({
    request: baseRequest(input.first || {}),
    repository: repo,
    serverContactCandidates: input.serverContactCandidates || [],
    approvedBy: "freddy.bremseth@gmail.com",
    now: approvedAt,
  });
  const profilesBefore = repo.profiles.length;
  const candidatesBefore = repo.candidates.length;

  await assert.rejects(
    () =>
      saveLeadIntelligenceReview({
        request: baseRequest(input.second),
        repository: repo,
        serverContactCandidates: input.serverContactCandidates || [],
        approvedBy: "freddy.bremseth@gmail.com",
        now: approvedAt,
      }),
    (error) =>
      error instanceof LeadIntelligenceReviewError &&
      error.code === "REVIEW_CONFLICT" &&
      error.status === 409 &&
      error.details?.conflict === true,
  );

  assert.equal(repo.profiles.length, profilesBefore);
  assert.equal(repo.candidates.length, candidatesBefore);
}

test("changed analysis with same seed returns REVIEW_CONFLICT and preserves existing profile", async () => {
  const changed = extractedLead();
  changed.summary = "Changed reviewed summary.";
  await assertReviewConflict({
    second: {
      analysis: changed,
      reviewedCriteria: reviewedCriteriaFor(changed),
    },
  });
});

test("changed criterion approval with same seed returns REVIEW_CONFLICT", async () => {
  const changedReviews = reviewedCriteriaFor(extractedLead());
  changedReviews[0] = {
    ...changedReviews[0],
    approvalStatus: "rejected",
    customerConfirmed: false,
  };
  await assertReviewConflict({
    second: {
      reviewedCriteria: changedReviews,
    },
  });
});

test("changed contact decision with same seed returns REVIEW_CONFLICT", async () => {
  await assertReviewConflict({
    first: {
      contactDecision: {
        action: "connect_existing",
        contactId,
        explicitApproval: true,
      },
    },
    second: {
      contactDecision: {
        action: "create_new",
        contactId: null,
        explicitApproval: true,
      },
    },
    serverContactCandidates: [serverContactCandidate],
  });
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

test("review payload hash changes when approved payload changes", () => {
  const base = stableLeadIntelligenceReviewPayloadHash({
    brand: "soleada",
    source: "phone_call",
    analysis: extractedLead(),
    reviewedCriteria: reviewedCriteriaFor(),
    contactDecision: { action: "continue_without_contact", contactId: null },
    promptVersion: "lead-intelligence-extraction-v1",
  });
  const changed = stableLeadIntelligenceReviewPayloadHash({
    brand: "soleada",
    source: "phone_call",
    analysis: extractedLead(),
    reviewedCriteria: [
      {
        ...reviewedCriteriaFor()[0],
        approvalStatus: "rejected",
      },
      ...reviewedCriteriaFor().slice(1),
    ],
    contactDecision: { action: "continue_without_contact", contactId: null },
    promptVersion: "lead-intelligence-extraction-v1",
  });

  assert.match(base, /^sha256:v1:[0-9a-f]{64}$/);
  assert.notEqual(base, changed);
});
