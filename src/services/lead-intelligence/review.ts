import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ExtractedLeadSchema,
  ExtractedExclusionSchema,
  ExtractedPreferenceSchema,
  ExtractedRequirementSchema,
  LEAD_INTELLIGENCE_LIMITS,
  LanguageCodeSchema,
  type ExtractedLead,
  MissingInformationSchema,
} from "./contracts";
import { LeadIntelligenceRealEstateBrandSchema } from "./brand-allowlist";
import {
  ContactLinkDecisionSchema,
  LeadContactCandidateMatchTypeSchema,
  LeadContactCandidateStatusSchema,
  LeadIntakeSourcePersistenceSchema,
  type CreateBuyerProfileInput,
  type LeadContactCandidateInput,
  type LeadContactCandidatePreview,
  type RecordLeadAnalysisRunInput,
} from "./persistence";
import {
  criterionReviewFingerprint,
  stableReviewJson,
} from "./review-shared";

export type LeadIntelligenceReviewErrorCode =
  | "INVALID_REQUEST"
  | "CONTACT_DECISION_REQUIRES_EXPLICIT_ACTION"
  | "CONTACT_LINKING_DISABLED"
  | "CONTACT_CREATION_DISABLED"
  | "CONTACT_CANDIDATE_STALE"
  | "CONTACT_BRAND_MISMATCH"
  | "REVIEW_CONFLICT"
  | "REVIEW_ALREADY_SAVED"
  | "PERSISTENCE_SCHEMA_NOT_READY"
  | "DATABASE_ERROR";

export class LeadIntelligenceReviewError extends Error {
  constructor(
    public readonly code: LeadIntelligenceReviewErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LeadIntelligenceReviewError";
  }
}

const uuidSchema = z.string().uuid();
const identitySchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText);
const correlationIdSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id);
const idempotencySeedSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id);

export const LeadIntelligenceCandidatePreviewSchema = z
  .object({
    contactId: uuidSchema,
    name: z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.personName).nullable(),
    maskedPhone: z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.phone).nullable(),
    maskedEmail: z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.email).nullable(),
    matchType: LeadContactCandidateMatchTypeSchema,
    confidence: z.number().min(0).max(1),
    reasons: z.array(z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText)).max(
      LEAD_INTELLIGENCE_LIMITS.matchReasons,
    ),
    matchValueHash: z.string().trim().min(16).max(128),
  })
  .strict();

export type LeadContactCandidatePublicPreview = Omit<
  LeadContactCandidatePreview,
  "matchValueHash"
>;

export function redactLeadContactCandidatePreviews(
  candidates: LeadContactCandidatePreview[],
): LeadContactCandidatePublicPreview[] {
  return candidates.map(({ matchValueHash: _matchValueHash, ...candidate }) => candidate);
}

export const LeadIntelligenceContactCandidatesRequestSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    contact: ExtractedLeadSchema.shape.contact,
  })
  .strict();

export const LeadIntelligenceCriterionReviewSchema = z
  .object({
    criterionType: z.enum([
      "hard_requirement",
      "preference",
      "exclusion",
      "missing_information",
    ]),
    fingerprint: z.string().trim().min(12).max(LEAD_INTELLIGENCE_LIMITS.mediumText),
    approvalStatus: z.enum(["approved", "rejected"]),
    customerConfirmed: z.boolean().default(false),
  })
  .strict();

export const LeadIntelligenceReviewSaveRequestSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    source: LeadIntakeSourcePersistenceSchema,
    rawText: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.bodyText),
    language: LanguageCodeSchema.optional().nullable(),
    correlationId: correlationIdSchema,
    idempotencySeed: idempotencySeedSchema.optional(),
    analysis: ExtractedLeadSchema,
    analysisMeta: z
      .object({
        model: identitySchema,
        promptVersion: identitySchema,
        durationMs: z.number().int().nonnegative().nullable(),
        repaired: z.boolean(),
      })
      .strict(),
    contactDecision: ContactLinkDecisionSchema,
    reviewedCriteria: z
      .array(LeadIntelligenceCriterionReviewSchema)
      .max(LEAD_INTELLIGENCE_LIMITS.criteria * 4),
  })
  .strict();

export type LeadIntelligenceContactCandidatesRequest = z.infer<
  typeof LeadIntelligenceContactCandidatesRequestSchema
>;
export type LeadIntelligenceReviewSaveRequest = z.infer<
  typeof LeadIntelligenceReviewSaveRequestSchema
>;
export type LeadIntelligenceCriterionReview = z.infer<
  typeof LeadIntelligenceCriterionReviewSchema
>;
type ExtractedRequirement = z.infer<typeof ExtractedRequirementSchema>;
type ExtractedPreference = z.infer<typeof ExtractedPreferenceSchema>;
type ExtractedExclusion = z.infer<typeof ExtractedExclusionSchema>;
type MissingInformation = z.infer<typeof MissingInformationSchema>;

export interface LeadIntelligenceReviewRepository {
  createIntake(input: {
    brand: string;
    source: z.infer<typeof LeadIntakeSourcePersistenceSchema>;
    rawTextRestricted: string | null;
    rawTextRetentionUntil?: string | null;
    language: string | null | undefined;
    status: "approved";
    createdBy: string;
    correlationId: string;
    idempotencyKey: string;
  }): Promise<{ id: string; duplicate?: boolean }>;
  recordAnalysisRun(input: RecordLeadAnalysisRunInput): Promise<{
    id: string;
    duplicate?: boolean;
    payloadHashMatches?: boolean;
  }>;
  recordContactCandidates(candidates: LeadContactCandidateInput[]): Promise<string[]>;
  createBuyerProfile(input: CreateBuyerProfileInput): Promise<{
    id: string;
    criterionCount: number;
    duplicate?: boolean;
  }>;
}

type CriterionKind =
  | "hard_requirement"
  | "preference"
  | "exclusion"
  | "missing_information";

interface FlattenedCriterion {
  criterionType: CriterionKind;
  index: number;
  item: ExtractedRequirement | ExtractedPreference | ExtractedExclusion | MissingInformation;
}

export function stableLeadIntelligenceIdempotencyKey(prefix: string, value: unknown) {
  const canonical = stableReviewJson(value);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `${prefix}:${hash}`;
}

export function stableLeadIntelligenceReviewPayloadHash(value: unknown) {
  const canonical = stableReviewJson(value);
  return `sha256:v1:${createHash("sha256").update(canonical).digest("hex")}`;
}

function flattenCriteria(analysis: ExtractedLead): FlattenedCriterion[] {
  return [
    ...analysis.hardRequirements.map((item, index) => ({
      criterionType: "hard_requirement" as const,
      index,
      item,
    })),
    ...analysis.preferences.map((item, index) => ({
      criterionType: "preference" as const,
      index,
      item,
    })),
    ...analysis.exclusions.map((item, index) => ({
      criterionType: "exclusion" as const,
      index,
      item,
    })),
    ...analysis.missingInformation.map((item, index) => ({
      criterionType: "missing_information" as const,
      index,
      item,
    })),
  ];
}

export function leadIntelligenceCriterionFingerprint(criterion: FlattenedCriterion) {
  return criterionReviewFingerprint({
    criterionType: criterion.criterionType,
    index: criterion.index,
    item: criterion.item,
  });
}

function buildCriteria(input: {
  analysis: ExtractedLead;
  reviewedCriteria: LeadIntelligenceCriterionReview[];
  approvedBy: string;
  approvedAt: string;
}): CreateBuyerProfileInput["criteria"] {
  const reviews = new Map<string, LeadIntelligenceCriterionReview>();
  for (const review of input.reviewedCriteria) {
    const key = review.fingerprint;
    if (reviews.has(key)) {
      throw new LeadIntelligenceReviewError("INVALID_REQUEST", "Duplicate criterion review", 400, {
        criterion: key,
      });
    }
    reviews.set(key, review);
  }

  return flattenCriteria(input.analysis).map((criterion) => {
    const fingerprint = leadIntelligenceCriterionFingerprint(criterion);
    const review = reviews.get(fingerprint);
    if (!review) {
      throw new LeadIntelligenceReviewError("INVALID_REQUEST", "All criteria require item-level review", 400, {
        criterionType: criterion.criterionType,
        fingerprint,
      });
    }

    if (review.criterionType !== criterion.criterionType) {
      throw new LeadIntelligenceReviewError("INVALID_REQUEST", "Criterion review fingerprint/type mismatch", 400, {
        criterionType: criterion.criterionType,
        fingerprint,
      });
    }

    const approved = review.approvalStatus === "approved";
    const source = review.customerConfirmed ? "customer_confirmed" : "ai_suggestion";
    const item = criterion.item;

    if (criterion.criterionType === "missing_information") {
      const missing = item as MissingInformation;
      return {
        criterionType: "missing_information" as const,
        key: missing.key,
        otherKey: missing.otherKey || null,
        operator: "unknown" as const,
        value: {
          question: missing.question,
          priority: missing.priority,
        },
        weight: null,
        severity: null,
        appliesToPropertyTypes: [],
        source,
        sourceText: null,
        confidence: null,
        customerConfirmed: review.customerConfirmed,
        approvalStatus: review.approvalStatus,
        approvedBy: approved ? input.approvedBy : null,
        approvedAt: approved ? input.approvedAt : null,
        active: approved,
      };
    }

    const evidence = item as ExtractedRequirement | ExtractedPreference | ExtractedExclusion;
    return {
      criterionType: criterion.criterionType,
      key: evidence.key,
      otherKey: evidence.otherKey || null,
      operator: evidence.operator,
      value: evidence.value,
      weight: criterion.criterionType === "preference" ? (evidence as ExtractedPreference).weight : null,
      severity: criterion.criterionType === "exclusion" ? (evidence as ExtractedExclusion).severity : null,
      appliesToPropertyTypes: evidence.appliesToPropertyTypes || [],
      source,
      sourceText: evidence.sourceText,
      confidence: evidence.confidence ?? null,
      customerConfirmed: review.customerConfirmed,
      approvalStatus: review.approvalStatus,
      approvedBy: approved ? input.approvedBy : null,
      approvedAt: approved ? input.approvedAt : null,
      active: approved,
    };
  });
}

function assertContactDecision(
  request: LeadIntelligenceReviewSaveRequest,
  serverCandidates: LeadContactCandidatePreview[],
  connectExistingEnabled: boolean,
) {
  const decision = request.contactDecision;
  if (decision.action !== "connect_existing") return decision;

  if (!connectExistingEnabled) {
    throw new LeadIntelligenceReviewError(
      "CONTACT_LINKING_DISABLED",
      "Connecting an existing contact is disabled until the dedicated contact-linking gate is approved",
      403,
    );
  }

  const selected = serverCandidates.find(
    (candidate) => candidate.contactId === decision.contactId,
  );
  if (!selected) {
    throw new LeadIntelligenceReviewError(
      "CONTACT_CANDIDATE_STALE",
      "Selected contact candidate is stale or no longer matches the reviewed contact details",
      409,
    );
  }

  return decision;
}

export async function saveLeadIntelligenceReview(input: {
  request: unknown;
  repository: LeadIntelligenceReviewRepository;
  serverContactCandidates: LeadContactCandidatePreview[];
  approvedBy: string;
  connectExistingEnabled?: boolean;
  now?: Date;
}) {
  const request = LeadIntelligenceReviewSaveRequestSchema.parse(input.request);
  const approvedBy = input.approvedBy.trim().toLowerCase();
  const approvedAt = (input.now || new Date()).toISOString();
  const decision = assertContactDecision(
    request,
    input.serverContactCandidates,
    input.connectExistingEnabled === true,
  );
  const idempotencySeed = request.idempotencySeed || request.correlationId;
  const contactId = decision.action === "connect_existing" ? decision.contactId : null;
  const reviewPayloadHash = stableLeadIntelligenceReviewPayloadHash({
    brand: request.brand,
    source: request.source,
    analysis: request.analysis,
    reviewedCriteria: request.reviewedCriteria,
    contactDecision: {
      action: decision.action,
      contactId,
    },
    promptVersion: request.analysisMeta.promptVersion,
  });
  const intakeKey = stableLeadIntelligenceIdempotencyKey("lead-intake-v1", {
    brand: request.brand,
    idempotencySeed,
  });
  const analysisKey = stableLeadIntelligenceIdempotencyKey("lead-analysis-v1", {
    brand: request.brand,
    promptVersion: request.analysisMeta.promptVersion,
    idempotencySeed,
  });

  const intake = await input.repository.createIntake({
    brand: request.brand,
    source: request.source,
    rawTextRestricted: null,
    rawTextRetentionUntil: null,
    language: request.language,
    status: "approved",
    createdBy: approvedBy,
    correlationId: request.correlationId,
    idempotencyKey: intakeKey,
  });

  const analysisRun = await input.repository.recordAnalysisRun({
    intakeId: intake.id,
    idempotencyKey: analysisKey,
    promptVersion: request.analysisMeta.promptVersion,
    model: request.analysisMeta.model,
    resultJson: {
      schemaVersion: "lead-intelligence-review-save-v1",
      reviewPayloadHash,
      analysis: request.analysis,
    },
    reviewPayloadHash,
    validationStatus: "valid",
    repaired: request.analysisMeta.repaired,
    durationMs: request.analysisMeta.durationMs,
    approved: true,
    approvedBy,
    approvedAt,
  });

  if (analysisRun.duplicate && analysisRun.payloadHashMatches !== true) {
    throw new LeadIntelligenceReviewError(
      "REVIEW_CONFLICT",
      "This review idempotency seed was already used for a different reviewed payload",
      409,
      { conflict: true },
    );
  }

  const profile = await input.repository.createBuyerProfile({
    brand: request.brand,
    contactId,
    intakeId: intake.id,
    version: 1,
    status: "approved",
    purchaseReadiness: request.analysis.purchaseReadiness.level,
    budgetAmount: request.analysis.budget.amount,
    budgetCurrency: request.analysis.budget.currency,
    budgetIncludesCosts: request.analysis.budget.includesCosts,
    budgetApproximate: request.analysis.budget.approximate,
    locationFlexible: request.analysis.locations.flexible,
    summary: request.analysis.summary,
    createdBy: approvedBy,
    approvedBy,
    approvedAt,
    criteria: buildCriteria({
      analysis: request.analysis,
      reviewedCriteria: request.reviewedCriteria,
      approvedBy,
      approvedAt,
    }),
  });
  const profileDuplicate = Boolean(profile.duplicate);

  const shouldRecordContactCandidates = decision.action === "connect_existing";
  const candidateInputs = input.serverContactCandidates.map((candidate) => ({
    brand: request.brand,
    intakeId: intake.id,
    contactId: candidate.contactId,
    matchType: candidate.matchType,
    matchValueHash: candidate.matchValueHash,
    score: candidate.confidence,
    reasons: candidate.reasons,
    status:
      decision.action === "connect_existing" && candidate.contactId === decision.contactId
        ? ("selected" as z.infer<typeof LeadContactCandidateStatusSchema>)
        : ("suggested" as z.infer<typeof LeadContactCandidateStatusSchema>),
  }));
  const candidateIds = profileDuplicate || !shouldRecordContactCandidates
    ? []
    : await input.repository.recordContactCandidates(candidateInputs);

  return {
    status: {
      newlySaved: !profileDuplicate,
      duplicate: profileDuplicate,
      conflict: false,
    },
    intake: {
      id: intake.id,
      duplicate: Boolean(intake.duplicate),
    },
    analysisRun: {
      id: analysisRun.id,
      duplicate: Boolean(analysisRun.duplicate),
    },
    buyerProfile: {
      ...profile,
      duplicate: profileDuplicate,
    },
    contactCandidates: {
      recorded: candidateIds.length,
      selectedContactId: contactId,
      decision: decision.action,
      createdContact: false,
      linkedContact: decision.action === "connect_existing",
      duplicate: profileDuplicate,
    },
  };
}

export function contactCandidatePreviewsToInputs(input: {
  brand: string;
  intakeId: string;
  candidates: LeadContactCandidatePreview[];
  selectedContactId?: string | null;
}): LeadContactCandidateInput[] {
  return input.candidates.map((candidate) => ({
    brand: input.brand,
    intakeId: input.intakeId,
    contactId: candidate.contactId,
    matchType: candidate.matchType,
    matchValueHash: candidate.matchValueHash,
    score: candidate.confidence,
    reasons: candidate.reasons,
    status:
      input.selectedContactId && candidate.contactId === input.selectedContactId
        ? "selected"
        : "suggested",
  }));
}
