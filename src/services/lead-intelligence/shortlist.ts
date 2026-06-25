import { createHash } from "node:crypto";
import { z } from "zod";
import { LEAD_INTELLIGENCE_LIMITS } from "./contracts";
import { LeadIntelligenceError } from "./extraction";
import { LeadIntelligenceRealEstateBrandSchema } from "./brand-allowlist";
import {
  LeadPropertyQualityReviewStatusSchema,
  LeadPropertyShortlistDecisionSchema,
  type CreateLeadPropertyShortlistInput,
} from "./persistence";
import {
  type PropertyMatchPreviewMatch,
  type PropertyMatchPreviewResult,
} from "./property-match-preview";
import { stableReviewJson } from "./review-shared";
import { LeadIntelligenceReviewError } from "./review";

const UUIDSchema = z.string().uuid();
const CorrelationIdSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id);
const IdempotencySeedSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id).optional();
const ShortlistQualityReviewSchema = z
  .object({
    status: LeadPropertyQualityReviewStatusSchema,
    note: z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.mediumText).nullable().optional(),
    checkedAt: z.string().datetime(),
    checkedBy: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText),
  })
  .strict();

export const LeadPropertyShortlistSaveRequestSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    buyerProfileId: UUIDSchema,
    title: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText).optional().nullable(),
    idempotencySeed: IdempotencySeedSchema,
    items: z
      .array(
        z
          .object({
            propertyId: UUIDSchema,
            decision: LeadPropertyShortlistDecisionSchema,
            qualityReview: ShortlistQualityReviewSchema,
          })
          .strict(),
      )
      .min(1)
      .max(LEAD_INTELLIGENCE_LIMITS.shortlistItems),
  })
  .strict()
  .superRefine((request, ctx) => {
    const propertyIds = request.items.map((item) => item.propertyId);
    if (new Set(propertyIds).size !== propertyIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "shortlist items must be unique by propertyId",
      });
    }
  });

export type LeadPropertyShortlistSaveRequest = z.infer<typeof LeadPropertyShortlistSaveRequestSchema>;

export interface LeadPropertyShortlistRepository {
  createPropertyShortlistDraft(input: CreateLeadPropertyShortlistInput): Promise<{
    id: string;
    duplicate: boolean;
    payloadHashMatches: boolean;
    itemCount: number;
  }>;
}

export interface LeadPropertyShortlistSaveResult {
  shortlistId: string;
  duplicate: boolean;
  conflict: boolean;
  itemCount: number;
  items: Array<{
    propertyId: string;
    decision: z.infer<typeof LeadPropertyShortlistDecisionSchema>;
    qualityReviewStatus: z.infer<typeof LeadPropertyQualityReviewStatusSchema>;
    systemEligibility: PropertyMatchPreviewMatch["eligibility"];
    score: number;
    dataQualityScore: number;
    rank: number;
  }>;
  sideEffects: {
    leadsCreated: false;
    contactsCreated: false;
    emailsSent: false;
    propertyMatchingStarted: false;
    presentationCreated: false;
  };
}

export function stableLeadPropertyShortlistPayloadHash(value: unknown) {
  return `sha256:v1:${createHash("sha256").update(stableReviewJson(value)).digest("hex")}`;
}

export function stableLeadPropertyShortlistIdempotencyKey(value: unknown) {
  const hash = createHash("sha256").update(stableReviewJson(value)).digest("hex");
  return `shortlist:v1:${hash}`;
}

export async function saveLeadPropertyShortlistDraft(input: {
  request: LeadPropertyShortlistSaveRequest;
  correlationId: string;
  createdBy: string;
  repository: LeadPropertyShortlistRepository;
  matchResult: PropertyMatchPreviewResult;
}): Promise<LeadPropertyShortlistSaveResult> {
  const correlationId = CorrelationIdSchema.parse(input.correlationId);
  const request = LeadPropertyShortlistSaveRequestSchema.parse(input.request);
  if (input.matchResult.buyerProfileId !== request.buyerProfileId) {
    throw new LeadIntelligenceError(
      "INVALID_REQUEST",
      "Match result does not belong to the requested buyer profile",
      400,
    );
  }

  const matchById = new Map(input.matchResult.matches.map((match) => [match.propertyId, match]));
  const selectedMatches = request.items.map((item, index) => {
    const match = matchById.get(item.propertyId);
    if (!match) {
      throw new LeadIntelligenceError(
        "INVALID_REQUEST",
        "Selected property is not present in the recomputed match result",
        400,
        { propertyId: item.propertyId },
      );
    }
    return {
      ...item,
      match,
      rank: index + 1,
    };
  });

  const canonicalPayload = {
    brand: request.brand,
    buyerProfileId: request.buyerProfileId,
    title: request.title || null,
    items: selectedMatches.map((item) => ({
      propertyId: item.propertyId,
      decision: item.decision,
      qualityReviewStatus: item.qualityReview.status,
      qualityReviewNote: item.qualityReview.note?.trim() || null,
      qualityReviewCheckedAt: item.qualityReview.checkedAt,
      qualityReviewCheckedBy: item.qualityReview.checkedBy,
      systemEligibility: item.match.eligibility,
      rank: item.rank,
    })),
  };
  const payloadHash = stableLeadPropertyShortlistPayloadHash(canonicalPayload);
  const idempotencyKey = stableLeadPropertyShortlistIdempotencyKey({
    seed: request.idempotencySeed || "default",
    payloadHash,
  });

  const persisted = await input.repository.createPropertyShortlistDraft({
    brand: request.brand,
    buyerProfileId: request.buyerProfileId,
    status: "draft",
    title: request.title || null,
    idempotencyKey,
    payloadHash,
    correlationId,
    createdBy: input.createdBy,
    approvedBy: null,
    approvedAt: null,
    archivedAt: null,
    items: selectedMatches.map((item) => ({
      brand: request.brand,
      propertyId: item.propertyId,
      propertyReference: item.match.property.reference,
      propertyTitle: item.match.property.title,
      propertyLocation: item.match.property.location,
      propertyPrice: item.match.property.price,
      propertyBedrooms: item.match.property.bedrooms,
      propertyBathrooms: item.match.property.bathrooms,
      propertyPrimaryImageUrl: item.match.property.primaryImageUrl,
      propertyPublicUrl: item.match.property.publicUrl,
      rank: item.rank,
      decision: item.decision,
      systemEligibility: item.match.eligibility,
      score: item.match.score,
      dataQualityScore: item.match.dataQualityScore,
      reasons: item.match.reasonsForMatch,
      concerns: item.match.concerns,
      questionsToVerify: item.match.questionsToVerify,
      selectedBy: input.createdBy,
      qualityReviewStatus: item.qualityReview.status,
      qualityReviewNote: item.qualityReview.note?.trim() || null,
      qualityReviewCheckedAt: item.qualityReview.checkedAt,
      qualityReviewCheckedBy: item.qualityReview.checkedBy,
    })),
  });

  if (!persisted.payloadHashMatches) {
    throw new LeadIntelligenceReviewError(
      "REVIEW_CONFLICT",
      "This shortlist idempotency key was already used for a different payload",
      409,
      { conflict: true },
    );
  }

  return {
    shortlistId: persisted.id,
    duplicate: persisted.duplicate,
    conflict: false,
    itemCount: persisted.itemCount,
    items: selectedMatches.map((item) => ({
      propertyId: item.propertyId,
      decision: item.decision,
      qualityReviewStatus: item.qualityReview.status,
      systemEligibility: item.match.eligibility,
      score: item.match.score,
      dataQualityScore: item.match.dataQualityScore,
      rank: item.rank,
    })),
    sideEffects: {
      leadsCreated: false,
      contactsCreated: false,
      emailsSent: false,
      propertyMatchingStarted: false,
      presentationCreated: false,
    },
  };
}
