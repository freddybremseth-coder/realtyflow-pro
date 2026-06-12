import { z } from "zod";

export const LEAD_INTELLIGENCE_FEATURE_FLAGS = {
  leadIntelligence: "REALTYFLOW_LEAD_INTELLIGENCE_ENABLED",
  propertyMatching: "REALTYFLOW_PROPERTY_MATCHING_ENABLED",
  autoSend: "REALTYFLOW_AUTO_SEND_ENABLED",
} as const;

export const PurchaseReadinessLevelSchema = z.enum([
  "cold",
  "warm",
  "hot",
  "ready_to_buy",
  "unknown",
]);

export const CriterionOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "contains",
  "exists",
  "unknown",
]);

export const ConfidenceSchema = z.number().min(0).max(1);

export const SourceEvidenceSchema = z
  .object({
    sourceText: z.string().trim().min(1),
    sourceMessageId: z.string().trim().min(1).nullable().optional(),
    confidence: ConfidenceSchema.optional(),
  })
  .strict();

export const ExtractedLeadContactSchema = z
  .object({
    name: z.string().trim().min(1).nullable(),
    phone: z.string().trim().min(1).nullable(),
    email: z.string().trim().email().nullable(),
    language: z.string().trim().min(2).nullable(),
    country: z.string().trim().min(2).nullable(),
  })
  .strict();

export const ExtractedBudgetSchema = z
  .object({
    amount: z.number().positive().nullable(),
    currency: z.string().trim().min(1).nullable(),
    includesCosts: z.boolean().nullable(),
    approximate: z.boolean(),
    hardLimit: z.boolean().nullable(),
  })
  .strict();

export const ExtractedLocationSchema = z
  .object({
    preferred: z.array(z.string().trim().min(1)),
    excluded: z.array(z.string().trim().min(1)),
    flexible: z.boolean(),
  })
  .strict();

export const ExtractedRequirementSchema = SourceEvidenceSchema.extend({
  key: z.string().trim().min(1),
  operator: CriterionOperatorSchema,
  value: z.unknown(),
  appliesToPropertyTypes: z.array(z.string().trim().min(1)).optional(),
}).strict();

export const ExtractedPreferenceSchema = SourceEvidenceSchema.extend({
  key: z.string().trim().min(1),
  weight: z.number().min(0).max(1),
  value: z.unknown(),
  appliesToPropertyTypes: z.array(z.string().trim().min(1)).optional(),
}).strict();

export const ExtractedExclusionSchema = SourceEvidenceSchema.extend({
  key: z.string().trim().min(1),
  severity: z.enum(["reject", "major_penalty", "minor_penalty"]),
  value: z.unknown(),
  appliesToPropertyTypes: z.array(z.string().trim().min(1)).optional(),
}).strict();

export const MissingInformationSchema = z
  .object({
    key: z.string().trim().min(1),
    question: z.string().trim().min(1),
    priority: z.enum(["high", "medium", "low"]),
  })
  .strict();

export const ExtractedLeadSchema = z
  .object({
    contact: ExtractedLeadContactSchema,
    purchaseReadiness: z
      .object({
        level: PurchaseReadinessLevelSchema,
        confidence: ConfidenceSchema,
        reasoning: z.string().trim().min(1),
      })
      .strict(),
    budget: ExtractedBudgetSchema,
    propertyTypes: z.array(z.string().trim().min(1)),
    locations: ExtractedLocationSchema,
    hardRequirements: z.array(ExtractedRequirementSchema),
    preferences: z.array(ExtractedPreferenceSchema),
    exclusions: z.array(ExtractedExclusionSchema),
    missingInformation: z.array(MissingInformationSchema),
    summary: z.string().trim().min(1),
    suggestedNextAction: z.string().trim().min(1),
  })
  .strict();

export const ApprovalStatusSchema = z.enum([
  "ai_draft",
  "needs_review",
  "approved",
  "rejected",
  "superseded",
]);

export const CriterionSourceSchema = z.enum(["ai_suggestion", "manual", "customer_confirmed"]);

export const BuyerProfileCriterionSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    key: z.string().trim().min(1),
    operator: CriterionOperatorSchema,
    value: z.unknown(),
    source: CriterionSourceSchema,
    sourceText: z.string().trim().min(1).nullable(),
    confidence: ConfidenceSchema.nullable(),
    customerConfirmed: z.boolean(),
    active: z.boolean(),
    createdBy: z.string().trim().min(1).nullable(),
    approvedBy: z.string().trim().min(1).nullable(),
    approvedAt: z.string().datetime().nullable(),
  })
  .strict();

export const BuyerProfilePreferenceSchema = BuyerProfileCriterionSchema.extend({
  weight: z.number().min(0).max(1),
}).strict();

export const BuyerProfileExclusionSchema = BuyerProfileCriterionSchema.extend({
  severity: z.enum(["reject", "major_penalty", "minor_penalty"]),
}).strict();

export const BuyerProfileSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    leadId: z.string().trim().min(1).nullable(),
    contactId: z.string().trim().min(1).nullable(),
    brand: z.string().trim().min(1),
    profileVersion: z.number().int().positive(),
    status: ApprovalStatusSchema,
    requirements: z.array(BuyerProfileCriterionSchema),
    preferences: z.array(BuyerProfilePreferenceSchema),
    exclusions: z.array(BuyerProfileExclusionSchema),
    createdBy: z.string().trim().min(1).nullable(),
    updatedBy: z.string().trim().min(1).nullable(),
    createdAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();

export const FactVerificationStatusSchema = z.enum([
  "unknown",
  "inferred",
  "unverified",
  "verified",
]);

export const NormalizedPropertyFactSchema = z
  .object({
    value: z.unknown(),
    verificationStatus: FactVerificationStatusSchema,
    sourceField: z.string().trim().min(1).nullable(),
    source: z.string().trim().min(1).nullable(),
    verifiedAt: z.string().datetime().nullable(),
  })
  .strict();

export const NormalizedPropertyForMatchingSchema = z
  .object({
    propertyId: z.string().trim().min(1),
    brandId: z.string().trim().min(1).nullable(),
    facts: z.record(z.string(), NormalizedPropertyFactSchema),
    dataQualityScore: z.number().min(0).max(100),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();

export const MatchCriterionResultSchema = z
  .object({
    key: z.string().trim().min(1),
    outcome: z.enum(["pass", "fail", "unknown", "penalty", "not_applicable"]),
    expected: z.unknown(),
    actual: z.unknown(),
    sourceField: z.string().trim().min(1).nullable(),
    reason: z.string().trim().min(1),
  })
  .strict();

export const PropertyMatchSchema = z
  .object({
    propertyId: z.string().trim().min(1),
    buyerProfileId: z.string().trim().min(1),
    score: z.number().min(0).max(100),
    eligibility: z.enum(["eligible", "conditional", "rejected"]),
    hardRequirementResults: z.array(MatchCriterionResultSchema),
    preferenceResults: z.array(MatchCriterionResultSchema),
    exclusionResults: z.array(MatchCriterionResultSchema),
    budgetResult: MatchCriterionResultSchema.nullable(),
    dataQualityScore: z.number().min(0).max(100),
    verifiedFacts: z.array(z.string().trim().min(1)),
    unverifiedFacts: z.array(z.string().trim().min(1)),
    reasonsForMatch: z.array(z.string().trim().min(1)),
    concerns: z.array(z.string().trim().min(1)),
    questionsToVerify: z.array(z.string().trim().min(1)),
  })
  .strict();

export const ShortlistItemDecisionSchema = z.enum([
  "current",
  "maybe",
  "reject",
  "needs_research",
]);

export const PropertyShortlistItemSchema = z
  .object({
    propertyId: z.string().trim().min(1),
    matchId: z.string().trim().min(1).nullable(),
    decision: ShortlistItemDecisionSchema,
    sortOrder: z.number().int().nonnegative(),
    approvedForPresentation: z.boolean(),
    notes: z.string().trim().nullable(),
  })
  .strict();

export const CustomerMessageDraftSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    leadId: z.string().trim().min(1).nullable(),
    contactId: z.string().trim().min(1).nullable(),
    brand: z.string().trim().min(1),
    channel: z.enum(["email", "whatsapp", "sms", "internal_preview"]),
    subject: z.string().trim().min(1).nullable(),
    bodyText: z.string().trim().min(1),
    bodyHtml: z.string().trim().min(1).nullable(),
    propertyIds: z.array(z.string().trim().min(1)),
    profileVersion: z.number().int().positive(),
    status: z.enum(["draft", "approved", "sent", "cancelled"]),
    approvedBy: z.string().trim().min(1).nullable(),
    approvedAt: z.string().datetime().nullable(),
    sentAt: z.string().datetime().nullable(),
  })
  .strict();

export const LeadFollowupActionSchema = z
  .object({
    leadId: z.string().trim().min(1).nullable(),
    contactId: z.string().trim().min(1).nullable(),
    brand: z.string().trim().min(1),
    actionType: z.enum([
      "call_customer",
      "send_clarifying_questions",
      "verify_adjacent_plot",
      "verify_availability",
      "request_floorplan",
      "verify_costs",
      "propose_viewing",
      "follow_up",
    ]),
    priority: z.enum(["critical", "high", "medium", "low"]),
    dueAt: z.string().datetime().nullable(),
    approvalStatus: ApprovalStatusSchema,
    safeSummary: z.string().trim().min(1),
  })
  .strict();

export const CustomerFeedbackEventSchema = z
  .object({
    leadId: z.string().trim().min(1).nullable(),
    contactId: z.string().trim().min(1).nullable(),
    propertyId: z.string().trim().min(1).nullable(),
    response: z.enum(["interested", "maybe", "not_relevant", "wants_viewing", "comment"]),
    comment: z.string().trim().nullable(),
    proposedProfileUpdates: z.array(BuyerProfileCriterionSchema),
    approvalStatus: ApprovalStatusSchema,
  })
  .strict();

export type ExtractedLead = z.infer<typeof ExtractedLeadSchema>;
export type BuyerProfile = z.infer<typeof BuyerProfileSchema>;
export type NormalizedPropertyForMatching = z.infer<typeof NormalizedPropertyForMatchingSchema>;
export type PropertyMatch = z.infer<typeof PropertyMatchSchema>;
export type CustomerMessageDraft = z.infer<typeof CustomerMessageDraftSchema>;

export function normalizePhoneForLeadLookup(value: string | null | undefined): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const withInternationalPrefix = trimmed.startsWith("00")
    ? `+${trimmed.slice(2)}`
    : trimmed;
  const hasPlus = withInternationalPrefix.startsWith("+");
  const digits = withInternationalPrefix.replace(/[^\d]/g, "");

  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}
