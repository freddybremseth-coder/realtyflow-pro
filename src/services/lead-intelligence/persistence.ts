import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  BoundedJsonSchema,
  CANONICAL_CRITERION_KEYS,
  CANONICAL_PROPERTY_TYPES,
  ConfidenceSchema,
  CriterionOperatorSchema,
  LEAD_INTELLIGENCE_LIMITS,
  LanguageCodeSchema,
  PurchaseReadinessLevelSchema,
  normalizeCurrencyCode,
  inspectPhoneForLeadLookup,
} from "./contracts";
import { isLeadIntelligencePersistenceEnabled } from "./feature-flags";
import { LeadIntelligenceRealEstateBrandSchema } from "./brand-allowlist";

export type LeadIntelligencePersistenceErrorCode =
  | "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED"
  | "AUTH_REQUIRED"
  | "ADMIN_FORBIDDEN"
  | "INVALID_REQUEST"
  | "LOOKUP_HASH_SECRET_MISSING"
  | "CONTACT_DECISION_REQUIRES_EXPLICIT_ACTION"
  | "DATABASE_ERROR";

export class LeadIntelligencePersistenceError extends Error {
  constructor(
    public readonly code: LeadIntelligencePersistenceErrorCode,
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "LeadIntelligencePersistenceError";
  }
}

export interface PersistenceAuthContext {
  email?: string | null;
  isAdmin?: boolean;
}

export interface QueryClient {
  query<T = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

const UUIDSchema = z.string().uuid();
const IdentityTextSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText);
const BrandSchema = LeadIntelligenceRealEstateBrandSchema;
const OptionalTextSchema = z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.longText).nullable();
const CorrelationIdSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id);
const IdempotencyKeySchema = z.string().trim().min(12).max(LEAD_INTELLIGENCE_LIMITS.id);
const ReviewPayloadHashSchema = z.string().regex(/^sha256:v1:[0-9a-f]{64}$/);
const UrlTextSchema = z.string().trim().url().max(LEAD_INTELLIGENCE_LIMITS.longText).nullable();

function normalizeDateString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

export const LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV = "REALTYFLOW_LEAD_CONTACT_LOOKUP_HMAC_SECRET";
export const LEAD_CONTACT_LOOKUP_HASH_PREFIX = "hmac-sha256:v1:";

export const LeadIntakeStatusSchema = z.enum([
  "draft",
  "analyzed",
  "reviewed",
  "approved",
  "rejected",
  "archived",
]);

export const LeadAnalysisValidationStatusSchema = z.enum([
  "pending",
  "valid",
  "invalid",
  "failed",
]);

export const BuyerProfilePersistenceStatusSchema = z.enum([
  "draft",
  "approved",
  "superseded",
  "archived",
]);

export const BuyerProfileCriterionTypeSchema = z.enum([
  "hard_requirement",
  "preference",
  "exclusion",
  "missing_information",
]);

export const BuyerProfileCriterionApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "edited",
]);

export const LeadIntakeSourcePersistenceSchema = z.enum([
  "phone_call",
  "whatsapp",
  "email",
  "sms",
  "meeting_note",
  "other",
]);

export const LeadContactCandidateMatchTypeSchema = z.enum([
  "exact_phone",
  "exact_email",
  "name_similarity",
  "manual",
  "other",
]);

export const LeadContactCandidateStatusSchema = z.enum([
  "suggested",
  "selected",
  "rejected",
  "ignored",
]);

export const LeadPropertyShortlistStatusSchema = z.enum(["draft", "approved", "archived"]);
export const LeadPropertyShortlistDecisionSchema = z.enum(["current", "maybe", "needs_research"]);
export const LeadPropertyShortlistEligibilitySchema = z.enum(["eligible", "conditional", "rejected"]);
export const LeadCustomerPresentationStatusSchema = z.enum(["draft", "approved", "archived"]);
export const LeadCustomerMessageDraftStatusSchema = z.enum(["draft", "approved", "cancelled"]);
export const LeadCustomerMessageChannelSchema = z.enum(["email"]);

export const LeadIntelligenceWorklistQuerySchema = z
  .object({
    brand: BrandSchema,
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export interface LeadIntelligenceWorklistItem {
  buyerProfileId: string;
  intakeId: string;
  analysisRunId: string | null;
  source: z.infer<typeof LeadIntakeSourcePersistenceSchema> | null;
  intakeStatus: z.infer<typeof LeadIntakeStatusSchema> | null;
  profileStatus: z.infer<typeof BuyerProfilePersistenceStatusSchema>;
  purchaseReadiness: z.infer<typeof PurchaseReadinessLevelSchema> | null;
  summary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  locationFlexible: boolean;
  contactLinked: boolean;
  criterionCount: number;
  shortlistCount: number;
  latestShortlistId: string | null;
  latestShortlistStatus: z.infer<typeof LeadPropertyShortlistStatusSchema> | null;
  latestShortlistItemCount: number;
  presentationCount: number;
  latestPresentationId: string | null;
  latestPresentationStatus: z.infer<typeof LeadCustomerPresentationStatusSchema> | null;
  latestMessageDraftId: string | null;
  latestMessageDraftStatus: z.infer<typeof LeadCustomerMessageDraftStatusSchema> | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export const CreateLeadIntakeInputSchema = z
  .object({
    brand: BrandSchema,
    source: LeadIntakeSourcePersistenceSchema,
    rawTextRestricted: z
      .string()
      .trim()
      .min(1)
      .max(LEAD_INTELLIGENCE_LIMITS.bodyText)
      .nullable(),
    rawTextRetentionUntil: z.string().datetime().nullable().optional(),
    language: LanguageCodeSchema.optional().nullable(),
    status: LeadIntakeStatusSchema.default("draft"),
    createdBy: IdentityTextSchema,
    correlationId: CorrelationIdSchema,
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const RecordLeadAnalysisRunInputSchema = z
  .object({
    intakeId: UUIDSchema,
    idempotencyKey: IdempotencyKeySchema,
    promptVersion: IdentityTextSchema,
    model: IdentityTextSchema,
    resultJson: BoundedJsonSchema,
    reviewPayloadHash: ReviewPayloadHashSchema.optional(),
    validationStatus: LeadAnalysisValidationStatusSchema.default("valid"),
    repaired: z.boolean().default(false),
    durationMs: z.number().int().nonnegative().nullable(),
    approved: z.boolean().default(false),
    approvedBy: IdentityTextSchema.nullable(),
    approvedAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.approved && (!input.approvedBy || !input.approvedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedBy"],
        message: "approved analysis requires approvedBy and approvedAt",
      });
    }

    if (!input.approved && (input.approvedBy || input.approvedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedBy"],
        message: "unapproved analysis cannot have approvedBy or approvedAt",
      });
    }
  });

export const BuyerProfileCriterionPersistenceSchema = z
  .object({
    criterionType: BuyerProfileCriterionTypeSchema,
    key: z.enum(CANONICAL_CRITERION_KEYS),
    otherKey: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable(),
    operator: CriterionOperatorSchema,
    value: BoundedJsonSchema,
    weight: z.number().min(0).max(1).nullable(),
    severity: z.enum(["reject", "major_penalty", "minor_penalty"]).nullable(),
    appliesToPropertyTypes: z.array(z.enum(CANONICAL_PROPERTY_TYPES)).max(
      LEAD_INTELLIGENCE_LIMITS.propertyTypes,
    ),
    source: z.enum(["ai_suggestion", "manual", "customer_confirmed"]),
    sourceText: OptionalTextSchema,
    confidence: ConfidenceSchema.nullable(),
    customerConfirmed: z.boolean(),
    approvalStatus: BuyerProfileCriterionApprovalStatusSchema,
    approvedBy: IdentityTextSchema.nullable(),
    approvedAt: z.string().datetime().nullable(),
    active: z.boolean(),
  })
  .strict()
  .superRefine((criterion, ctx) => {
    if (criterion.key === "other" && !criterion.otherKey) {
      ctx.addIssue({
        code: "custom",
        path: ["otherKey"],
        message: "otherKey is required for other criteria",
      });
    }

    if (criterion.key !== "other" && criterion.otherKey) {
      ctx.addIssue({
        code: "custom",
        path: ["otherKey"],
        message: "otherKey is only allowed for other criteria",
      });
    }

    if (criterion.criterionType === "preference" && criterion.weight === null) {
      ctx.addIssue({
        code: "custom",
        path: ["weight"],
        message: "preference criteria require weight",
      });
    }

    if (criterion.criterionType !== "preference" && criterion.weight !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["weight"],
        message: "weight is only allowed for preferences",
      });
    }

    if (criterion.criterionType === "exclusion" && !criterion.severity) {
      ctx.addIssue({
        code: "custom",
        path: ["severity"],
        message: "exclusion criteria require severity",
      });
    }

    if (criterion.criterionType !== "exclusion" && criterion.severity) {
      ctx.addIssue({
        code: "custom",
        path: ["severity"],
        message: "severity is only allowed for exclusions",
      });
    }

    if (criterion.approvalStatus === "rejected" && criterion.active) {
      ctx.addIssue({
        code: "custom",
        path: ["active"],
        message: "rejected criteria cannot remain active",
      });
    }

    if (criterion.approvalStatus === "approved" && (!criterion.approvedBy || !criterion.approvedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedBy"],
        message: "approved criteria require approvedBy and approvedAt",
      });
    }

    if (criterion.approvalStatus !== "approved" && (criterion.approvedBy || criterion.approvedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedBy"],
        message: "only approved criteria may have approvedBy and approvedAt",
      });
    }
  });

export const CreateBuyerProfileInputSchema = z
  .object({
    brand: BrandSchema,
    contactId: UUIDSchema.nullable(),
    intakeId: UUIDSchema,
    version: z.number().int().positive(),
    status: BuyerProfilePersistenceStatusSchema,
    purchaseReadiness: PurchaseReadinessLevelSchema,
    budgetAmount: z.number().nonnegative().nullable(),
    budgetCurrency: z.preprocess(normalizeCurrencyCode, z.string().regex(/^[A-Z]{3}$/).nullable()),
    budgetIncludesCosts: z.boolean().nullable(),
    budgetApproximate: z.boolean(),
    locationFlexible: z.boolean(),
    summary: OptionalTextSchema,
    createdBy: IdentityTextSchema,
    approvedBy: IdentityTextSchema.nullable(),
    approvedAt: z.string().datetime().nullable(),
    criteria: z
      .array(BuyerProfileCriterionPersistenceSchema)
      .max(LEAD_INTELLIGENCE_LIMITS.criteria * 4),
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (profile.status === "approved" && (!profile.approvedBy || !profile.approvedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedBy"],
        message: "approved profile requires approvedBy and approvedAt",
      });
    }

    if (profile.status !== "approved" && (profile.approvedBy || profile.approvedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedBy"],
        message: "only approved profiles may have approvedBy and approvedAt",
      });
    }

    if (profile.status === "approved") {
      profile.criteria.forEach((criterion, index) => {
        if (criterion.active && criterion.approvalStatus !== "approved") {
          ctx.addIssue({
            code: "custom",
            path: ["criteria", index, "approvalStatus"],
            message: "active criteria must be individually approved before profile approval",
          });
        }
      });
    }
  });

export const LeadContactCandidateInputSchema = z
  .object({
    brand: BrandSchema,
    intakeId: UUIDSchema,
    contactId: UUIDSchema,
    matchType: LeadContactCandidateMatchTypeSchema,
    matchValueHash: z.string().trim().min(16).max(128),
    score: z.number().min(0).max(1),
    reasons: z.array(z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText)).max(
      LEAD_INTELLIGENCE_LIMITS.matchReasons,
    ),
    status: LeadContactCandidateStatusSchema.default("suggested"),
  })
  .strict();

export const LeadPropertyShortlistItemInputSchema = z
  .object({
    brand: BrandSchema,
    propertyId: UUIDSchema,
    propertyReference: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable(),
    propertyTitle: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText).nullable(),
    propertyLocation: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable(),
    propertyPrice: z.number().nonnegative().nullable(),
    propertyBedrooms: z.number().nonnegative().nullable(),
    propertyBathrooms: z.number().nonnegative().nullable(),
    propertyPrimaryImageUrl: UrlTextSchema,
    propertyPublicUrl: UrlTextSchema,
    rank: z.number().int().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortlistItems),
    decision: LeadPropertyShortlistDecisionSchema,
    systemEligibility: LeadPropertyShortlistEligibilitySchema,
    score: z.number().int().min(0).max(100),
    dataQualityScore: z.number().int().min(0).max(100),
    reasons: z.array(z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText)).max(
      LEAD_INTELLIGENCE_LIMITS.matchReasons,
    ),
    concerns: z.array(z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText)).max(
      LEAD_INTELLIGENCE_LIMITS.matchReasons,
    ),
    questionsToVerify: z.array(z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText)).max(
      LEAD_INTELLIGENCE_LIMITS.matchReasons,
    ),
    selectedBy: IdentityTextSchema,
  })
  .strict();

export const CreateLeadPropertyShortlistInputSchema = z
  .object({
    brand: BrandSchema,
    buyerProfileId: UUIDSchema,
    status: LeadPropertyShortlistStatusSchema.default("draft"),
    title: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText).nullable(),
    idempotencyKey: IdempotencyKeySchema,
    payloadHash: ReviewPayloadHashSchema,
    correlationId: CorrelationIdSchema,
    createdBy: IdentityTextSchema,
    approvedBy: IdentityTextSchema.nullable(),
    approvedAt: z.string().datetime().nullable(),
    archivedAt: z.string().datetime().nullable(),
    items: z.array(LeadPropertyShortlistItemInputSchema).min(1).max(LEAD_INTELLIGENCE_LIMITS.shortlistItems),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.items.some((item) => item.brand !== input.brand)) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "shortlist items must use the shortlist brand",
      });
    }

    const propertyIds = input.items.map((item) => item.propertyId);
    if (new Set(propertyIds).size !== propertyIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "shortlist items must be unique by property",
      });
    }

    const ranks = input.items.map((item) => item.rank);
    if (new Set(ranks).size !== ranks.length) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "shortlist item ranks must be unique",
      });
    }

    if (input.status === "draft" && (input.approvedBy || input.approvedAt || input.archivedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "draft shortlist cannot have approval or archive timestamps",
      });
    }

    if (input.status !== "draft") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "only draft shortlists can be created in this phase",
      });
    }
  });

export const LeadCustomerMessageDraftInputSchema = z
  .object({
    brand: BrandSchema,
    buyerProfileId: UUIDSchema,
    shortlistId: UUIDSchema,
    channel: LeadCustomerMessageChannelSchema.default("email"),
    status: LeadCustomerMessageDraftStatusSchema.default("draft"),
    subject: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText),
    bodyText: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.bodyText),
    bodyHtml: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.bodyHtml).nullable(),
    language: LanguageCodeSchema.optional().nullable(),
    idempotencyKey: IdempotencyKeySchema,
    payloadHash: ReviewPayloadHashSchema,
    correlationId: CorrelationIdSchema,
    createdBy: IdentityTextSchema,
    approvedBy: IdentityTextSchema.nullable(),
    approvedAt: z.string().datetime().nullable(),
    sentAt: z.string().datetime().nullable(),
    cancelledAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((draft, ctx) => {
    if (draft.status !== "draft") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "only draft message drafts can be created in this phase",
      });
    }

    if (draft.approvedBy || draft.approvedAt || draft.sentAt || draft.cancelledAt) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "draft message cannot have approval, sent, or cancellation timestamps",
      });
    }
  });

export const CreateLeadCustomerPresentationDraftInputSchema = z
  .object({
    brand: BrandSchema,
    buyerProfileId: UUIDSchema,
    shortlistId: UUIDSchema,
    status: LeadCustomerPresentationStatusSchema.default("draft"),
    title: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText),
    presentationJson: BoundedJsonSchema,
    idempotencyKey: IdempotencyKeySchema,
    payloadHash: ReviewPayloadHashSchema,
    correlationId: CorrelationIdSchema,
    createdBy: IdentityTextSchema,
    approvedBy: IdentityTextSchema.nullable(),
    approvedAt: z.string().datetime().nullable(),
    archivedAt: z.string().datetime().nullable(),
    messageDraft: LeadCustomerMessageDraftInputSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.status !== "draft") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "only draft presentations can be created in this phase",
      });
    }

    if (input.approvedBy || input.approvedAt || input.archivedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "draft presentation cannot have approval or archive timestamps",
      });
    }

    if (
      input.messageDraft.brand !== input.brand ||
      input.messageDraft.buyerProfileId !== input.buyerProfileId ||
      input.messageDraft.shortlistId !== input.shortlistId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["messageDraft"],
        message: "message draft must use the same brand, buyer profile, and shortlist",
      });
    }
  });

export type CreateLeadIntakeInput = z.infer<typeof CreateLeadIntakeInputSchema>;
export type RecordLeadAnalysisRunInput = z.infer<typeof RecordLeadAnalysisRunInputSchema>;
export type CreateBuyerProfileInput = z.infer<typeof CreateBuyerProfileInputSchema>;
export type LeadContactCandidateInput = z.infer<typeof LeadContactCandidateInputSchema>;
export type CreateLeadPropertyShortlistInput = z.infer<typeof CreateLeadPropertyShortlistInputSchema>;
export type CreateLeadCustomerPresentationDraftInput = z.infer<typeof CreateLeadCustomerPresentationDraftInputSchema>;

export interface LeadCustomerPresentationShortlistItemRow {
  propertyId: string;
  propertyReference: string | null;
  propertyTitle: string | null;
  propertyLocation: string | null;
  propertyPrice: number | null;
  propertyBedrooms: number | null;
  propertyBathrooms: number | null;
  propertyPrimaryImageUrl: string | null;
  propertyPublicUrl: string | null;
  rank: number;
  decision: z.infer<typeof LeadPropertyShortlistDecisionSchema>;
  systemEligibility: z.infer<typeof LeadPropertyShortlistEligibilitySchema>;
  score: number;
  dataQualityScore: number;
  reasons: string[];
  concerns: string[];
  questionsToVerify: string[];
}

export interface LeadCustomerPresentationShortlistSnapshot {
  brand: string;
  buyerProfileId: string;
  shortlistId: string;
  shortlistTitle: string | null;
  buyerSummary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  budgetIncludesCosts: boolean | null;
  budgetApproximate: boolean;
  locationFlexible: boolean;
  items: LeadCustomerPresentationShortlistItemRow[];
}

export interface ContactLookupRow {
  contactId: string;
  brand?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface LeadContactSuggestion {
  brand: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
}

export interface LeadContactCandidatePreview {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
  matchType: z.infer<typeof LeadContactCandidateMatchTypeSchema>;
  confidence: number;
  reasons: string[];
  matchValueHash: string;
}

export function assertLeadIntelligencePersistenceEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  if (!isLeadIntelligencePersistenceEnabled(env)) {
    throw new LeadIntelligencePersistenceError(
      "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED",
      "Lead Intelligence persistence is disabled",
      403,
    );
  }
}

export function assertLeadIntelligencePersistenceAccess(
  auth: PersistenceAuthContext | null | undefined,
  env: Record<string, string | undefined> = process.env,
) {
  if (!auth?.email) {
    throw new LeadIntelligencePersistenceError("AUTH_REQUIRED", "Authentication required", 401);
  }

  if (!auth.isAdmin) {
    throw new LeadIntelligencePersistenceError("ADMIN_FORBIDDEN", "Admin access required", 403);
  }

  assertLeadIntelligencePersistenceEnabled(env);

  return auth.email.trim().toLowerCase();
}

export function getLeadContactLookupHmacSecret(
  env: Record<string, string | undefined> = process.env,
) {
  const secret = String(env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV] || "").trim();
  if (secret.length < 32) {
    throw new LeadIntelligencePersistenceError(
      "LOOKUP_HASH_SECRET_MISSING",
      "Lead contact lookup HMAC secret is not configured",
      500,
    );
  }
  return secret;
}

export function hashLeadContactLookup(input: {
  brand: string;
  kind: string;
  value: string;
  secret: string;
}) {
  const brand = BrandSchema.parse(input.brand);
  if (!input.secret || input.secret.length < 32) {
    throw new LeadIntelligencePersistenceError(
      "LOOKUP_HASH_SECRET_MISSING",
      "Lead contact lookup HMAC secret is not configured",
      500,
    );
  }

  const payload = `${brand}|${input.kind}|${input.value}`;
  return `${LEAD_CONTACT_LOOKUP_HASH_PREFIX}${createHmac("sha256", input.secret)
    .update(payload)
    .digest("hex")}`;
}

export function normalizeEmailForLeadLookup(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  return raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
}

export function maskEmail(value: string | null | undefined) {
  const normalized = normalizeEmailForLeadLookup(value);
  if (!normalized) return null;
  const [local, domain] = normalized.split("@");
  const localMasked = local.length <= 2 ? `${local[0] || ""}*` : `${local[0]}***${local.at(-1)}`;
  return `${localMasked}@${domain}`;
}

export function maskPhone(value: string | null | undefined) {
  const inspected = inspectPhoneForLeadLookup(value);
  const normalized = inspected.normalizedLookup;
  if (!normalized) return null;
  const visible = normalized.replace(/[^\d+]/g, "");
  if (visible.length <= 5) return "***";
  return `${visible.slice(0, 3)}***${visible.slice(-2)}`;
}

function normalizeNameForLeadLookup(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeCandidate(
  candidates: Map<string, LeadContactCandidatePreview>,
  row: ContactLookupRow,
  candidate: Omit<LeadContactCandidatePreview, "name" | "maskedPhone" | "maskedEmail">,
) {
  const current = candidates.get(row.contactId);
  if (!current || candidate.confidence > current.confidence) {
    candidates.set(row.contactId, {
      ...candidate,
      name: row.name || null,
      maskedPhone: maskPhone(row.phone),
      maskedEmail: maskEmail(row.email),
    });
    return;
  }

  current.reasons = Array.from(new Set([...current.reasons, ...candidate.reasons]));
}

export function findLeadContactCandidatePreviews(
  suggestion: LeadContactSuggestion,
  contacts: ContactLookupRow[],
  options: { hmacSecret: string },
) {
  const brand = BrandSchema.parse(suggestion.brand);
  const hmacSecret = getLeadContactLookupHmacSecret({
    [LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV]: options.hmacSecret,
  });
  const phone = inspectPhoneForLeadLookup(suggestion.phone);
  const email = normalizeEmailForLeadLookup(suggestion.email);
  const name = normalizeNameForLeadLookup(suggestion.name);
  const candidates = new Map<string, LeadContactCandidatePreview>();

  for (const row of contacts) {
    if (row.brand && row.brand !== brand) continue;

    const rowPhone = inspectPhoneForLeadLookup(row.phone);
    if (phone.normalizedLookup && rowPhone.normalizedLookup === phone.normalizedLookup) {
      mergeCandidate(candidates, row, {
        contactId: row.contactId,
        matchType: "exact_phone",
        confidence: phone.verifiedE164 && rowPhone.verifiedE164 ? 0.98 : 0.86,
        reasons: [
          phone.verifiedE164 && rowPhone.verifiedE164
            ? "Eksakt verifisert E.164-telefon"
            : "Eksakt telefonoppslag i normalisert lookup-format",
        ],
        matchValueHash: hashLeadContactLookup({
          brand,
          kind: "phone",
          value: phone.normalizedLookup,
          secret: hmacSecret,
        }),
      });
    }

    const rowEmail = normalizeEmailForLeadLookup(row.email);
    if (email && rowEmail === email) {
      mergeCandidate(candidates, row, {
        contactId: row.contactId,
        matchType: "exact_email",
        confidence: 0.95,
        reasons: ["Eksakt normalisert e-post"],
        matchValueHash: hashLeadContactLookup({
          brand,
          kind: "email",
          value: email,
          secret: hmacSecret,
        }),
      });
    }

    const rowName = normalizeNameForLeadLookup(row.name);
    if (name && rowName && rowName === name) {
      mergeCandidate(candidates, row, {
        contactId: row.contactId,
        matchType: "name_similarity",
        confidence: 0.35,
        reasons: ["Navn matcher, men navn alene krever manuell kontroll"],
        matchValueHash: hashLeadContactLookup({
          brand,
          kind: "name",
          value: name,
          secret: hmacSecret,
        }),
      });
    }
  }

  return Array.from(candidates.values()).sort((a, b) => b.confidence - a.confidence);
}

export function requiresManualContactSelection(candidates: LeadContactCandidatePreview[]) {
  return candidates.length !== 1 || candidates[0].matchType === "name_similarity";
}

export const ContactLinkDecisionSchema = z
  .object({
    action: z.enum(["connect_existing", "create_new", "continue_without_contact"]),
    contactId: UUIDSchema.nullable(),
    explicitApproval: z.boolean(),
  })
  .strict()
  .superRefine((decision, ctx) => {
    if (!decision.explicitApproval) {
      ctx.addIssue({
        code: "custom",
        path: ["explicitApproval"],
        message: "contact decisions require explicit Freddy approval",
      });
    }

    if (decision.action === "connect_existing" && !decision.contactId) {
      ctx.addIssue({
        code: "custom",
        path: ["contactId"],
        message: "connect_existing requires contactId",
      });
    }

    if (decision.action !== "connect_existing" && decision.contactId) {
      ctx.addIssue({
        code: "custom",
        path: ["contactId"],
        message: "contactId is only allowed when connecting an existing contact",
      });
    }
  });

export function assertExplicitContactDecision(value: unknown) {
  const parsed = ContactLinkDecisionSchema.safeParse(value);
  if (!parsed.success) {
    throw new LeadIntelligencePersistenceError(
      "CONTACT_DECISION_REQUIRES_EXPLICIT_ACTION",
      "Contact creation or linking requires explicit approval",
      400,
    );
  }

  return parsed.data;
}

export interface LeadIntelligencePersistenceRepositoryOptions {
  auth: PersistenceAuthContext | null | undefined;
  env?: Record<string, string | undefined>;
}

export class LeadIntelligencePersistenceRepository {
  constructor(
    private readonly db: QueryClient,
    private readonly options: LeadIntelligencePersistenceRepositoryOptions,
  ) {}

  private assertCanRead() {
    return assertLeadIntelligencePersistenceAccess(this.options.auth, this.options.env);
  }

  private assertCanWrite() {
    return assertLeadIntelligencePersistenceAccess(this.options.auth, this.options.env);
  }

  async listWorklist(input: z.input<typeof LeadIntelligenceWorklistQuerySchema>) {
    this.assertCanRead();
    const data = LeadIntelligenceWorklistQuerySchema.parse(input);
    const { rows } = await this.db.query<{
      buyer_profile_id: string;
      intake_id: string;
      analysis_run_id: string | null;
      source: string | null;
      intake_status: string | null;
      profile_status: string;
      purchase_readiness: string | null;
      summary: string | null;
      budget_amount: string | number | null;
      budget_currency: string | null;
      location_flexible: boolean;
      contact_linked: boolean;
      criterion_count: string | number | null;
      shortlist_count: string | number | null;
      latest_shortlist_id: string | null;
      latest_shortlist_status: string | null;
      latest_shortlist_item_count: string | number | null;
      presentation_count: string | number | null;
      latest_presentation_id: string | null;
      latest_presentation_status: string | null;
      latest_message_draft_id: string | null;
      latest_message_draft_status: string | null;
      created_at: string | Date;
      updated_at: string | Date;
      approved_at: string | Date | null;
    }>(
      `
        with selected_profiles as (
          select
            profile.id,
            profile.brand,
            profile.intake_id,
            profile.contact_id,
            profile.status,
            profile.purchase_readiness,
            profile.summary,
            profile.budget_amount,
            profile.budget_currency,
            profile.location_flexible,
            profile.created_at,
            profile.updated_at,
            profile.approved_at
          from public.buyer_profiles profile
          where profile.brand = $1
          order by profile.updated_at desc, profile.created_at desc, profile.id desc
          limit $2
        )
        select
          profile.id::text as buyer_profile_id,
          profile.intake_id::text as intake_id,
          analysis.id::text as analysis_run_id,
          intake.source,
          intake.status as intake_status,
          profile.status as profile_status,
          profile.purchase_readiness,
          profile.summary,
          profile.budget_amount,
          profile.budget_currency,
          profile.location_flexible,
          profile.contact_id is not null as contact_linked,
          coalesce(criteria.criterion_count, 0)::int as criterion_count,
          coalesce(shortlist_totals.shortlist_count, 0)::int as shortlist_count,
          latest_shortlist.id::text as latest_shortlist_id,
          latest_shortlist.status as latest_shortlist_status,
          coalesce(latest_shortlist_items.item_count, 0)::int as latest_shortlist_item_count,
          coalesce(presentation_totals.presentation_count, 0)::int as presentation_count,
          latest_presentation.id::text as latest_presentation_id,
          latest_presentation.status as latest_presentation_status,
          latest_message.id::text as latest_message_draft_id,
          latest_message.status as latest_message_draft_status,
          profile.created_at,
          profile.updated_at,
          profile.approved_at
        from selected_profiles profile
        left join public.lead_intake_messages intake
          on intake.id = profile.intake_id
         and intake.brand = profile.brand
        left join lateral (
          select id
          from public.lead_analysis_runs analysis
          where analysis.intake_id = profile.intake_id
          order by analysis.created_at desc, analysis.id desc
          limit 1
        ) analysis on true
        left join lateral (
          select count(*)::int as criterion_count
          from public.buyer_profile_criteria criterion
          where criterion.buyer_profile_id = profile.id
            and criterion.active = true
        ) criteria on true
        left join lateral (
          select count(*)::int as shortlist_count
          from public.lead_property_shortlists shortlist
          where shortlist.brand = profile.brand
            and shortlist.buyer_profile_id = profile.id
        ) shortlist_totals on true
        left join lateral (
          select id, status
          from public.lead_property_shortlists shortlist
          where shortlist.brand = profile.brand
            and shortlist.buyer_profile_id = profile.id
          order by shortlist.created_at desc, shortlist.id desc
          limit 1
        ) latest_shortlist on true
        left join lateral (
          select count(*)::int as item_count
          from public.lead_property_shortlist_items item
          where latest_shortlist.id is not null
            and item.shortlist_id = latest_shortlist.id
        ) latest_shortlist_items on true
        left join lateral (
          select count(*)::int as presentation_count
          from public.lead_customer_presentations presentation
          where presentation.brand = profile.brand
            and presentation.buyer_profile_id = profile.id
        ) presentation_totals on true
        left join lateral (
          select id, status
          from public.lead_customer_presentations presentation
          where presentation.brand = profile.brand
            and presentation.buyer_profile_id = profile.id
          order by presentation.created_at desc, presentation.id desc
          limit 1
        ) latest_presentation on true
        left join lateral (
          select id, status
          from public.lead_customer_message_drafts draft
          where draft.brand = profile.brand
            and draft.buyer_profile_id = profile.id
          order by draft.created_at desc, draft.id desc
          limit 1
        ) latest_message on true
        order by profile.updated_at desc, profile.created_at desc, profile.id desc
      `,
      [data.brand, data.limit],
    );

    return rows.map((row): LeadIntelligenceWorklistItem => ({
      buyerProfileId: UUIDSchema.parse(row.buyer_profile_id),
      intakeId: UUIDSchema.parse(row.intake_id),
      analysisRunId: row.analysis_run_id ? UUIDSchema.parse(row.analysis_run_id) : null,
      source: row.source ? LeadIntakeSourcePersistenceSchema.parse(row.source) : null,
      intakeStatus: row.intake_status ? LeadIntakeStatusSchema.parse(row.intake_status) : null,
      profileStatus: BuyerProfilePersistenceStatusSchema.parse(row.profile_status),
      purchaseReadiness: row.purchase_readiness ? PurchaseReadinessLevelSchema.parse(row.purchase_readiness) : null,
      summary: row.summary,
      budgetAmount: row.budget_amount === null ? null : Number(row.budget_amount),
      budgetCurrency: row.budget_currency,
      locationFlexible: Boolean(row.location_flexible),
      contactLinked: Boolean(row.contact_linked),
      criterionCount: Number(row.criterion_count || 0),
      shortlistCount: Number(row.shortlist_count || 0),
      latestShortlistId: row.latest_shortlist_id ? UUIDSchema.parse(row.latest_shortlist_id) : null,
      latestShortlistStatus: row.latest_shortlist_status
        ? LeadPropertyShortlistStatusSchema.parse(row.latest_shortlist_status)
        : null,
      latestShortlistItemCount: Number(row.latest_shortlist_item_count || 0),
      presentationCount: Number(row.presentation_count || 0),
      latestPresentationId: row.latest_presentation_id ? UUIDSchema.parse(row.latest_presentation_id) : null,
      latestPresentationStatus: row.latest_presentation_status
        ? LeadCustomerPresentationStatusSchema.parse(row.latest_presentation_status)
        : null,
      latestMessageDraftId: row.latest_message_draft_id ? UUIDSchema.parse(row.latest_message_draft_id) : null,
      latestMessageDraftStatus: row.latest_message_draft_status
        ? LeadCustomerMessageDraftStatusSchema.parse(row.latest_message_draft_status)
        : null,
      createdAt: normalizeDateString(row.created_at),
      updatedAt: normalizeDateString(row.updated_at),
      approvedAt: row.approved_at ? normalizeDateString(row.approved_at) : null,
    }));
  }

  async createIntake(input: CreateLeadIntakeInput) {
    this.assertCanWrite();
    const data = CreateLeadIntakeInputSchema.parse(input);
    const { rows } = await this.db.query<{ id: string; duplicate: boolean }>(
      `
        with inserted as (
          insert into public.lead_intake_messages (
            brand,
            source,
            raw_text_restricted,
            raw_text_retention_until,
            language,
            status,
            created_by,
            correlation_id,
            idempotency_key
          )
          values ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8, $9)
          on conflict (brand, idempotency_key) do nothing
          returning id, false as duplicate
        )
        select id, duplicate from inserted
        union all
        select id, true as duplicate
        from public.lead_intake_messages
        where brand = $1
          and idempotency_key = $9
          and not exists (select 1 from inserted)
        limit 1
      `,
      [
        data.brand,
        data.source,
        data.rawTextRestricted,
        data.rawTextRetentionUntil || null,
        data.language,
        data.status,
        data.createdBy,
        data.correlationId,
        data.idempotencyKey,
      ],
    );
    return rows[0];
  }

  async recordAnalysisRun(input: RecordLeadAnalysisRunInput) {
    this.assertCanWrite();
    const data = RecordLeadAnalysisRunInputSchema.parse(input);
    const reviewPayloadHash =
      data.reviewPayloadHash ||
      (data.resultJson &&
      typeof data.resultJson === "object" &&
      !Array.isArray(data.resultJson) &&
      typeof (data.resultJson as { reviewPayloadHash?: unknown }).reviewPayloadHash === "string"
        ? (data.resultJson as { reviewPayloadHash: string }).reviewPayloadHash
        : null);
    const { rows } = await this.db.query<{
      id: string;
      duplicate: boolean;
      payload_hash_matches: boolean;
    }>(
      `
        with inserted as (
          insert into public.lead_analysis_runs (
            intake_id,
            idempotency_key,
            prompt_version,
            model,
            result_json,
            validation_status,
            repaired,
            duration_ms,
            approved,
            approved_by,
            approved_at
          )
          values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::timestamptz)
          on conflict (intake_id, idempotency_key) do nothing
          returning id, false as duplicate, true as payload_hash_matches
        )
        select id, duplicate, payload_hash_matches from inserted
        union all
        select
          id,
          true as duplicate,
          coalesce(result_json ->> 'reviewPayloadHash' = $12, false) as payload_hash_matches
        from public.lead_analysis_runs
        where intake_id = $1
          and idempotency_key = $2
          and not exists (select 1 from inserted)
        limit 1
      `,
      [
        data.intakeId,
        data.idempotencyKey,
        data.promptVersion,
        data.model,
        JSON.stringify(data.resultJson),
        data.validationStatus,
        data.repaired,
        data.durationMs,
        data.approved,
        data.approvedBy,
        data.approvedAt,
        reviewPayloadHash,
      ],
    );
    return {
      id: rows[0].id,
      duplicate: Boolean(rows[0].duplicate),
      payloadHashMatches: Boolean(rows[0].payload_hash_matches),
    };
  }

  async createBuyerProfile(input: CreateBuyerProfileInput) {
    this.assertCanWrite();
    const data = CreateBuyerProfileInputSchema.parse(input);
    const criteriaPayload = JSON.stringify(
      data.criteria.map((criterion) => ({
        criterion_type: criterion.criterionType,
        key: criterion.key,
        other_key: criterion.otherKey,
        operator: criterion.operator,
        value: criterion.value,
        weight: criterion.weight,
        severity: criterion.severity,
        applies_to_property_types: criterion.appliesToPropertyTypes,
        source: criterion.source,
        source_text: criterion.sourceText,
        confidence: criterion.confidence,
        customer_confirmed: criterion.customerConfirmed,
        approval_status: criterion.approvalStatus,
        approved_by: criterion.approvedBy,
        approved_at: criterion.approvedAt,
        active: criterion.active,
      })),
    );
    const profileResult = await this.db.query<{
      id: string;
      duplicate: boolean;
    }>(
      `
        with existing_profile as (
          select id
          from public.buyer_profiles
          where intake_id = $3::uuid
            and version = $4
        ),
        profile as (
          insert into public.buyer_profiles (
            brand,
            contact_id,
            intake_id,
            version,
            status,
            purchase_readiness,
            budget_amount,
            budget_currency,
            budget_includes_costs,
            budget_approximate,
            location_flexible,
            summary,
            created_by,
            approved_by,
            approved_at
          )
          select $1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz
          where not exists (select 1 from existing_profile)
          on conflict (intake_id, version) do nothing
          returning id, false as duplicate
        ),
        selected_profile as (
          select id, duplicate from profile
          union all
          select id, true as duplicate
          from existing_profile
          where not exists (select 1 from profile)
          limit 1
        )
        select
          selected_profile.id,
          selected_profile.duplicate
        from selected_profile
      `,
      [
        data.brand,
        data.contactId,
        data.intakeId,
        data.version,
        data.status,
        data.purchaseReadiness,
        data.budgetAmount,
        data.budgetCurrency,
        data.budgetIncludesCosts,
        data.budgetApproximate,
        data.locationFlexible,
        data.summary,
        data.createdBy,
        data.approvedBy,
        data.approvedAt,
      ],
    );

    const profileId = profileResult.rows[0].id;
    const duplicate = Boolean(profileResult.rows[0].duplicate);
    let criterionCount = 0;

    if (duplicate) {
      const existingCriteria = await this.db.query<{ count: number }>(
        `
          select count(*)::int as count
          from public.buyer_profile_criteria
          where buyer_profile_id = $1::uuid
        `,
        [profileId],
      );
      criterionCount = Number(existingCriteria.rows[0]?.count || 0);
    } else {
      const criteriaResult = await this.db.query<{ criterion_count: number }>(
        `
          with criteria_input as (
            select
              criterion_type,
              key,
              other_key,
              operator,
              value,
              weight,
              severity,
              coalesce(
                array(
                  select jsonb_array_elements_text(coalesce(applies_to_property_types, '[]'::jsonb))
                ),
                '{}'::text[]
              ) as applies_to_property_types,
              source,
              source_text,
              confidence,
              customer_confirmed,
              approval_status,
              approved_by,
              approved_at,
              active
            from jsonb_to_recordset($2::jsonb) as criterion (
              criterion_type text,
              key text,
              other_key text,
              operator text,
              value jsonb,
              weight numeric,
              severity text,
              applies_to_property_types jsonb,
              source text,
              source_text text,
              confidence numeric,
              customer_confirmed boolean,
              approval_status text,
              approved_by text,
              approved_at timestamptz,
              active boolean
            )
          ),
          inserted_criteria as (
            insert into public.buyer_profile_criteria (
              buyer_profile_id,
              criterion_type,
              key,
              other_key,
              operator,
              value,
              weight,
              severity,
              applies_to_property_types,
              source,
              source_text,
              confidence,
              customer_confirmed,
              approval_status,
              approved_by,
              approved_at,
              active
            )
            select
              $1::uuid,
              criterion.criterion_type,
              criterion.key,
              criterion.other_key,
              criterion.operator,
              criterion.value,
              criterion.weight,
              criterion.severity,
              criterion.applies_to_property_types,
              criterion.source,
              criterion.source_text,
              criterion.confidence,
              criterion.customer_confirmed,
              criterion.approval_status,
              criterion.approved_by,
              criterion.approved_at,
              criterion.active
            from criteria_input criterion
            returning id
          )
          select count(*)::int as criterion_count from inserted_criteria
        `,
        [profileId, criteriaPayload],
      );
      criterionCount = Number(criteriaResult.rows[0]?.criterion_count || 0);
    }

    return {
      id: profileId,
      criterionCount,
      duplicate,
    };
  }

  async recordContactCandidates(candidates: LeadContactCandidateInput[]) {
    this.assertCanWrite();
    const data = z.array(LeadContactCandidateInputSchema).parse(candidates);
    if (data.length === 0) return [];

    const brand = data[0].brand;
    if (data.some((candidate) => candidate.brand !== brand)) {
      throw new LeadIntelligencePersistenceError(
        "INVALID_REQUEST",
        "Contact candidates in one batch must use the same brand",
        400,
      );
    }

    const { rows } = await this.db.query<{ id: string }>(
      `
        with candidate_input as (
          select *
          from jsonb_to_recordset($1::jsonb) as candidate (
            brand text,
            intake_id uuid,
            contact_id uuid,
            match_type text,
            match_value_hash text,
            score numeric,
            reasons jsonb,
            status text
          )
        ),
        upserted as (
          insert into public.lead_contact_candidates (
            brand,
            intake_id,
            contact_id,
            match_type,
            match_value_hash,
            score,
            reasons,
            status
          )
          select
            brand,
            intake_id,
            contact_id,
            match_type,
            match_value_hash,
            score,
            reasons,
            status
          from candidate_input
          on conflict (intake_id, match_type, match_value_hash)
          do update set
            score = excluded.score,
            reasons = excluded.reasons,
            status = excluded.status
          returning id
        )
        select id from upserted
      `,
      [
        JSON.stringify(
          data.map((candidate) => ({
            brand: candidate.brand,
            intake_id: candidate.intakeId,
            contact_id: candidate.contactId,
            match_type: candidate.matchType,
            match_value_hash: candidate.matchValueHash,
            score: candidate.score,
            reasons: candidate.reasons,
            status: candidate.status,
          })),
        ),
      ],
    );

    return rows.map((row) => row.id);
  }

  async createPropertyShortlistDraft(input: CreateLeadPropertyShortlistInput) {
    this.assertCanWrite();
    const data = CreateLeadPropertyShortlistInputSchema.parse(input);
    const itemsPayload = JSON.stringify(
      data.items.map((item) => ({
        brand: item.brand,
        property_id: item.propertyId,
        property_reference: item.propertyReference,
        property_title: item.propertyTitle,
        property_location: item.propertyLocation,
        property_price: item.propertyPrice,
        property_bedrooms: item.propertyBedrooms,
        property_bathrooms: item.propertyBathrooms,
        property_primary_image_url: item.propertyPrimaryImageUrl,
        property_public_url: item.propertyPublicUrl,
        rank: item.rank,
        decision: item.decision,
        system_eligibility: item.systemEligibility,
        score: item.score,
        data_quality_score: item.dataQualityScore,
        reasons: item.reasons,
        concerns: item.concerns,
        questions_to_verify: item.questionsToVerify,
        selected_by: item.selectedBy,
      })),
    );

    const shortlistResult = await this.db.query<{
      id: string;
      duplicate: boolean;
      payload_hash_matches: boolean;
    }>(
      `
        with inserted as (
          insert into public.lead_property_shortlists (
            brand,
            buyer_profile_id,
            status,
            title,
            idempotency_key,
            payload_hash,
            correlation_id,
            created_by,
            approved_by,
            approved_at,
            archived_at
          )
          values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz)
          on conflict (brand, idempotency_key) do nothing
          returning id, false as duplicate, true as payload_hash_matches
        )
        select id, duplicate, payload_hash_matches from inserted
        union all
        select
          id,
          true as duplicate,
          payload_hash = $6 as payload_hash_matches
        from public.lead_property_shortlists
        where brand = $1
          and idempotency_key = $5
          and not exists (select 1 from inserted)
        limit 1
      `,
      [
        data.brand,
        data.buyerProfileId,
        data.status,
        data.title,
        data.idempotencyKey,
        data.payloadHash,
        data.correlationId,
        data.createdBy,
        data.approvedBy,
        data.approvedAt,
        data.archivedAt,
      ],
    );

    const shortlist = shortlistResult.rows[0];
    if (!shortlist) {
      throw new LeadIntelligencePersistenceError(
        "DATABASE_ERROR",
        "Lead property shortlist could not be created",
        500,
      );
    }

    if (!shortlist.payload_hash_matches) {
      return {
        id: shortlist.id,
        duplicate: true,
        payloadHashMatches: false,
        itemCount: 0,
      };
    }

    let itemCount = 0;
    if (shortlist.duplicate) {
      const existingItems = await this.db.query<{ count: number }>(
        `
          select count(*)::int as count
          from public.lead_property_shortlist_items
          where shortlist_id = $1::uuid
        `,
        [shortlist.id],
      );
      itemCount = Number(existingItems.rows[0]?.count || 0);
    } else {
      const insertedItems = await this.db.query<{ count: number }>(
        `
          with item_input as (
            select *
            from jsonb_to_recordset($2::jsonb) as item (
              brand text,
              property_id uuid,
              property_reference text,
              property_title text,
              property_location text,
              property_price numeric,
              property_bedrooms numeric,
              property_bathrooms numeric,
              property_primary_image_url text,
              property_public_url text,
              rank integer,
              decision text,
              system_eligibility text,
              score integer,
              data_quality_score integer,
              reasons jsonb,
              concerns jsonb,
              questions_to_verify jsonb,
              selected_by text
            )
          ),
          inserted_items as (
            insert into public.lead_property_shortlist_items (
              shortlist_id,
              brand,
              property_id,
              property_reference,
              property_title,
              property_location,
              property_price,
              property_bedrooms,
              property_bathrooms,
              property_primary_image_url,
              property_public_url,
              rank,
              decision,
              system_eligibility,
              score,
              data_quality_score,
              reasons,
              concerns,
              questions_to_verify,
              selected_by
            )
            select
              $1::uuid,
              brand,
              property_id,
              property_reference,
              property_title,
              property_location,
              property_price,
              property_bedrooms,
              property_bathrooms,
              property_primary_image_url,
              property_public_url,
              rank,
              decision,
              system_eligibility,
              score,
              data_quality_score,
              reasons,
              concerns,
              questions_to_verify,
              selected_by
            from item_input
            returning id
          )
          select count(*)::int as count from inserted_items
        `,
        [shortlist.id, itemsPayload],
      );
      itemCount = Number(insertedItems.rows[0]?.count || 0);
    }

    return {
      id: shortlist.id,
      duplicate: Boolean(shortlist.duplicate),
      payloadHashMatches: true,
      itemCount,
    };
  }

  async loadShortlistSnapshotForPresentation(input: {
    brand: string;
    buyerProfileId: string;
    shortlistId: string;
  }): Promise<LeadCustomerPresentationShortlistSnapshot | null> {
    this.assertCanWrite();
    const brand = BrandSchema.parse(input.brand);
    const buyerProfileId = UUIDSchema.parse(input.buyerProfileId);
    const shortlistId = UUIDSchema.parse(input.shortlistId);

    const shortlistResult = await this.db.query<{
      brand: string;
      buyer_profile_id: string;
      shortlist_id: string;
      shortlist_title: string | null;
      buyer_summary: string | null;
      budget_amount: string | number | null;
      budget_currency: string | null;
      budget_includes_costs: boolean | null;
      budget_approximate: boolean;
      location_flexible: boolean;
    }>(
      `
        select
          shortlist.brand,
          shortlist.buyer_profile_id::text,
          shortlist.id::text as shortlist_id,
          shortlist.title as shortlist_title,
          profile.summary as buyer_summary,
          profile.budget_amount,
          profile.budget_currency,
          profile.budget_includes_costs,
          profile.budget_approximate,
          profile.location_flexible
        from public.lead_property_shortlists shortlist
        join public.buyer_profiles profile
          on profile.id = shortlist.buyer_profile_id
         and profile.brand = shortlist.brand
        where shortlist.brand = $1
          and shortlist.buyer_profile_id = $2::uuid
          and shortlist.id = $3::uuid
          and shortlist.status = 'draft'
          and profile.status = 'approved'
        limit 1
      `,
      [brand, buyerProfileId, shortlistId],
    );
    const shortlist = shortlistResult.rows[0];
    if (!shortlist) return null;

    const itemResult = await this.db.query<{
      property_id: string;
      property_reference: string | null;
      property_title: string | null;
      property_location: string | null;
      property_price: string | number | null;
      property_bedrooms: string | number | null;
      property_bathrooms: string | number | null;
      property_primary_image_url: string | null;
      property_public_url: string | null;
      rank: number;
      decision: z.infer<typeof LeadPropertyShortlistDecisionSchema>;
      system_eligibility: z.infer<typeof LeadPropertyShortlistEligibilitySchema>;
      score: number;
      data_quality_score: number;
      reasons: unknown;
      concerns: unknown;
      questions_to_verify: unknown;
    }>(
      `
        select
          property_id::text,
          property_reference,
          property_title,
          property_location,
          property_price,
          property_bedrooms,
          property_bathrooms,
          property_primary_image_url,
          property_public_url,
          rank,
          decision,
          system_eligibility,
          score,
          data_quality_score,
          reasons,
          concerns,
          questions_to_verify
        from public.lead_property_shortlist_items
        where brand = $1
          and shortlist_id = $2::uuid
        order by rank asc
      `,
      [brand, shortlistId],
    );

    const stringArraySchema = z.array(z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText)).max(
      LEAD_INTELLIGENCE_LIMITS.matchReasons,
    );

    return {
      brand,
      buyerProfileId,
      shortlistId,
      shortlistTitle: shortlist.shortlist_title,
      buyerSummary: shortlist.buyer_summary,
      budgetAmount: shortlist.budget_amount === null ? null : Number(shortlist.budget_amount),
      budgetCurrency: shortlist.budget_currency,
      budgetIncludesCosts: shortlist.budget_includes_costs,
      budgetApproximate: Boolean(shortlist.budget_approximate),
      locationFlexible: Boolean(shortlist.location_flexible),
      items: itemResult.rows.map((row) => ({
        propertyId: row.property_id,
        propertyReference: row.property_reference,
        propertyTitle: row.property_title,
        propertyLocation: row.property_location,
        propertyPrice: row.property_price === null ? null : Number(row.property_price),
        propertyBedrooms: row.property_bedrooms === null ? null : Number(row.property_bedrooms),
        propertyBathrooms: row.property_bathrooms === null ? null : Number(row.property_bathrooms),
        propertyPrimaryImageUrl: row.property_primary_image_url,
        propertyPublicUrl: row.property_public_url,
        rank: Number(row.rank),
        decision: LeadPropertyShortlistDecisionSchema.parse(row.decision),
        systemEligibility: LeadPropertyShortlistEligibilitySchema.parse(row.system_eligibility),
        score: Number(row.score),
        dataQualityScore: Number(row.data_quality_score),
        reasons: stringArraySchema.parse(row.reasons),
        concerns: stringArraySchema.parse(row.concerns),
        questionsToVerify: stringArraySchema.parse(row.questions_to_verify),
      })),
    };
  }

  async getCustomerPresentationDraft(input: {
    brand: string;
    presentationId: string;
  }) {
    this.assertCanRead();
    const data = z
      .object({
        brand: BrandSchema,
        presentationId: UUIDSchema,
      })
      .strict()
      .parse(input);
    const { rows } = await this.db.query<{
      presentation_id: string;
      buyer_profile_id: string;
      shortlist_id: string;
      presentation_status: string;
      title: string;
      presentation_json: unknown;
      message_draft_id: string | null;
      message_status: string | null;
      subject: string | null;
      body_text: string | null;
      body_html: string | null;
    }>(
      `
        select
          presentation.id::text as presentation_id,
          presentation.buyer_profile_id::text as buyer_profile_id,
          presentation.shortlist_id::text as shortlist_id,
          presentation.status as presentation_status,
          presentation.title,
          presentation.presentation_json,
          draft.id::text as message_draft_id,
          draft.status as message_status,
          draft.subject,
          draft.body_text,
          draft.body_html
        from public.lead_customer_presentations presentation
        left join lateral (
          select id, status, subject, body_text, body_html
          from public.lead_customer_message_drafts draft
          where draft.brand = presentation.brand
            and draft.presentation_id = presentation.id
          order by draft.created_at desc, draft.id desc
          limit 1
        ) draft on true
        where presentation.brand = $1
          and presentation.id = $2::uuid
        limit 1
      `,
      [data.brand, data.presentationId],
    );

    const row = rows[0];
    if (!row || !row.message_draft_id || !row.message_status || !row.subject || !row.body_text) {
      return null;
    }

    const presentationJson = BoundedJsonSchema.parse(row.presentation_json);
    const itemCount =
      presentationJson &&
      typeof presentationJson === "object" &&
      !Array.isArray(presentationJson) &&
      Array.isArray((presentationJson as { properties?: unknown }).properties)
        ? (presentationJson as { properties: unknown[] }).properties.length
        : 0;

    return {
      presentationId: UUIDSchema.parse(row.presentation_id),
      buyerProfileId: UUIDSchema.parse(row.buyer_profile_id),
      shortlistId: UUIDSchema.parse(row.shortlist_id),
      messageDraftId: UUIDSchema.parse(row.message_draft_id),
      duplicate: true,
      conflict: false,
      loadedFromHistory: true,
      status: LeadCustomerPresentationStatusSchema.parse(row.presentation_status),
      messageStatus: LeadCustomerMessageDraftStatusSchema.parse(row.message_status),
      itemCount,
      title: row.title,
      subject: row.subject,
      messageDraft: {
        subject: row.subject,
        bodyText: row.body_text,
        bodyHtml: row.body_html,
      },
      sideEffects: {
        emailSent: false,
        leadsCreated: false,
        contactsCreated: false,
        propertyMatchingStarted: false,
        presentationPublished: false,
      } as const,
    };
  }

  async createCustomerPresentationDraft(input: CreateLeadCustomerPresentationDraftInput) {
    this.assertCanWrite();
    const data = CreateLeadCustomerPresentationDraftInputSchema.parse(input);
    const presentationResult = await this.db.query<{
      id: string;
      duplicate: boolean;
      payload_hash_matches: boolean;
    }>(
      `
        with inserted as (
          insert into public.lead_customer_presentations (
            brand,
            buyer_profile_id,
            shortlist_id,
            status,
            title,
            presentation_json,
            idempotency_key,
            payload_hash,
            correlation_id,
            created_by,
            approved_by,
            approved_at,
            archived_at
          )
          values ($1, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz)
          on conflict (brand, idempotency_key) do nothing
          returning id, false as duplicate, true as payload_hash_matches
        )
        select id, duplicate, payload_hash_matches from inserted
        union all
        select
          id,
          true as duplicate,
          payload_hash = $8 as payload_hash_matches
        from public.lead_customer_presentations
        where brand = $1
          and idempotency_key = $7
          and not exists (select 1 from inserted)
        limit 1
      `,
      [
        data.brand,
        data.buyerProfileId,
        data.shortlistId,
        data.status,
        data.title,
        JSON.stringify(data.presentationJson),
        data.idempotencyKey,
        data.payloadHash,
        data.correlationId,
        data.createdBy,
        data.approvedBy,
        data.approvedAt,
        data.archivedAt,
      ],
    );
    const presentation = presentationResult.rows[0];
    if (!presentation) {
      throw new LeadIntelligencePersistenceError(
        "DATABASE_ERROR",
        "Lead customer presentation draft could not be created",
        500,
      );
    }

    if (!presentation.payload_hash_matches) {
      return {
        presentationId: presentation.id,
        messageDraftId: null,
        duplicate: true,
        payloadHashMatches: false,
      };
    }

    const draft = data.messageDraft;
    const messageResult = await this.db.query<{
      id: string;
      duplicate: boolean;
      payload_hash_matches: boolean;
    }>(
      `
        with inserted as (
          insert into public.lead_customer_message_drafts (
            brand,
            presentation_id,
            buyer_profile_id,
            shortlist_id,
            channel,
            status,
            subject,
            body_text,
            body_html,
            language,
            idempotency_key,
            payload_hash,
            correlation_id,
            created_by,
            approved_by,
            approved_at,
            sent_at,
            cancelled_at
          )
          values ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz, $17::timestamptz, $18::timestamptz)
          on conflict (brand, idempotency_key) do nothing
          returning id, false as duplicate, true as payload_hash_matches
        )
        select id, duplicate, payload_hash_matches from inserted
        union all
        select
          id,
          true as duplicate,
          payload_hash = $12 as payload_hash_matches
        from public.lead_customer_message_drafts
        where brand = $1
          and idempotency_key = $11
          and not exists (select 1 from inserted)
        limit 1
      `,
      [
        draft.brand,
        presentation.id,
        draft.buyerProfileId,
        draft.shortlistId,
        draft.channel,
        draft.status,
        draft.subject,
        draft.bodyText,
        draft.bodyHtml,
        draft.language || null,
        draft.idempotencyKey,
        draft.payloadHash,
        draft.correlationId,
        draft.createdBy,
        draft.approvedBy,
        draft.approvedAt,
        draft.sentAt,
        draft.cancelledAt,
      ],
    );
    const message = messageResult.rows[0];
    if (!message) {
      throw new LeadIntelligencePersistenceError(
        "DATABASE_ERROR",
        "Lead customer message draft could not be created",
        500,
      );
    }

    return {
      presentationId: presentation.id,
      messageDraftId: message.id,
      duplicate: Boolean(presentation.duplicate && message.duplicate),
      payloadHashMatches: Boolean(message.payload_hash_matches),
    };
  }
}
