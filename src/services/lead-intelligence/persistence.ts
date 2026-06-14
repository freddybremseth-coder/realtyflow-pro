import { createHash } from "node:crypto";
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

export type LeadIntelligencePersistenceErrorCode =
  | "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED"
  | "AUTH_REQUIRED"
  | "ADMIN_FORBIDDEN"
  | "INVALID_REQUEST"
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
const BrandSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.brand);
const OptionalTextSchema = z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.longText).nullable();
const CorrelationIdSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id);

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

export const CreateLeadIntakeInputSchema = z
  .object({
    brand: BrandSchema,
    source: LeadIntakeSourcePersistenceSchema,
    rawTextEncryptedOrRestricted: z
      .string()
      .trim()
      .min(1)
      .max(LEAD_INTELLIGENCE_LIMITS.bodyText)
      .nullable(),
    language: LanguageCodeSchema.optional().nullable(),
    status: LeadIntakeStatusSchema.default("draft"),
    createdBy: IdentityTextSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();

export const RecordLeadAnalysisRunInputSchema = z
  .object({
    intakeId: UUIDSchema,
    promptVersion: IdentityTextSchema,
    model: IdentityTextSchema,
    resultJson: BoundedJsonSchema,
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

    if (!input.approved && input.approvedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedAt"],
        message: "unapproved analysis cannot have approvedAt",
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

    if (criterion.approvalStatus !== "approved" && criterion.approvedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedAt"],
        message: "only approved criteria may have approvedAt",
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

    if (profile.status !== "approved" && profile.approvedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedAt"],
        message: "only approved profiles may have approvedAt",
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

export type CreateLeadIntakeInput = z.infer<typeof CreateLeadIntakeInputSchema>;
export type RecordLeadAnalysisRunInput = z.infer<typeof RecordLeadAnalysisRunInputSchema>;
export type CreateBuyerProfileInput = z.infer<typeof CreateBuyerProfileInputSchema>;
export type LeadContactCandidateInput = z.infer<typeof LeadContactCandidateInputSchema>;

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
  assertLeadIntelligencePersistenceEnabled(env);

  if (!auth?.email) {
    throw new LeadIntelligencePersistenceError("AUTH_REQUIRED", "Authentication required", 401);
  }

  if (!auth.isAdmin) {
    throw new LeadIntelligencePersistenceError("ADMIN_FORBIDDEN", "Admin access required", 403);
  }

  return auth.email.trim().toLowerCase();
}

export function hashLeadContactLookup(kind: string, value: string) {
  return `sha256:${createHash("sha256").update(`${kind}:${value}`).digest("hex")}`;
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
) {
  const phone = inspectPhoneForLeadLookup(suggestion.phone);
  const email = normalizeEmailForLeadLookup(suggestion.email);
  const name = normalizeNameForLeadLookup(suggestion.name);
  const candidates = new Map<string, LeadContactCandidatePreview>();

  for (const row of contacts) {
    if (row.brand && row.brand !== suggestion.brand) continue;

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
        matchValueHash: hashLeadContactLookup("phone", phone.normalizedLookup),
      });
    }

    const rowEmail = normalizeEmailForLeadLookup(row.email);
    if (email && rowEmail === email) {
      mergeCandidate(candidates, row, {
        contactId: row.contactId,
        matchType: "exact_email",
        confidence: 0.95,
        reasons: ["Eksakt normalisert e-post"],
        matchValueHash: hashLeadContactLookup("email", email),
      });
    }

    const rowName = normalizeNameForLeadLookup(row.name);
    if (name && rowName && rowName === name) {
      mergeCandidate(candidates, row, {
        contactId: row.contactId,
        matchType: "name_similarity",
        confidence: 0.35,
        reasons: ["Navn matcher, men navn alene krever manuell kontroll"],
        matchValueHash: hashLeadContactLookup("name", name),
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

export class LeadIntelligencePersistenceRepository {
  constructor(private readonly db: QueryClient) {}

  async createIntake(input: CreateLeadIntakeInput) {
    const data = CreateLeadIntakeInputSchema.parse(input);
    const { rows } = await this.db.query<{ id: string }>(
      `
        insert into public.lead_intake_messages (
          brand,
          source,
          raw_text_encrypted_or_restricted,
          language,
          status,
          created_by,
          correlation_id
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id
      `,
      [
        data.brand,
        data.source,
        data.rawTextEncryptedOrRestricted,
        data.language,
        data.status,
        data.createdBy,
        data.correlationId,
      ],
    );
    return rows[0];
  }

  async recordAnalysisRun(input: RecordLeadAnalysisRunInput) {
    const data = RecordLeadAnalysisRunInputSchema.parse(input);
    const { rows } = await this.db.query<{ id: string }>(
      `
        insert into public.lead_analysis_runs (
          intake_id,
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
        values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::timestamptz)
        returning id
      `,
      [
        data.intakeId,
        data.promptVersion,
        data.model,
        JSON.stringify(data.resultJson),
        data.validationStatus,
        data.repaired,
        data.durationMs,
        data.approved,
        data.approvedBy,
        data.approvedAt,
      ],
    );
    return rows[0];
  }

  async createBuyerProfile(input: CreateBuyerProfileInput) {
    const data = CreateBuyerProfileInputSchema.parse(input);
    const profileResult = await this.db.query<{ id: string }>(
      `
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
        values ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz)
        returning id
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
    for (const criterion of data.criteria) {
      await this.db.query(
        `
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
          values (
            $1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::text[],
            $10, $11, $12, $13, $14, $15, $16::timestamptz, $17
          )
        `,
        [
          profileId,
          criterion.criterionType,
          criterion.key,
          criterion.otherKey,
          criterion.operator,
          JSON.stringify(criterion.value),
          criterion.weight,
          criterion.severity,
          criterion.appliesToPropertyTypes,
          criterion.source,
          criterion.sourceText,
          criterion.confidence,
          criterion.customerConfirmed,
          criterion.approvalStatus,
          criterion.approvedBy,
          criterion.approvedAt,
          criterion.active,
        ],
      );
    }

    return { id: profileId };
  }

  async recordContactCandidates(candidates: LeadContactCandidateInput[]) {
    const ids: string[] = [];
    for (const candidate of candidates) {
      const data = LeadContactCandidateInputSchema.parse(candidate);
      const { rows } = await this.db.query<{ id: string }>(
        `
          insert into public.lead_contact_candidates (
            intake_id,
            contact_id,
            match_type,
            match_value_hash,
            score,
            reasons,
            status
          )
          values ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7)
          returning id
        `,
        [
          data.intakeId,
          data.contactId,
          data.matchType,
          data.matchValueHash,
          data.score,
          JSON.stringify(data.reasons),
          data.status,
        ],
      );
      ids.push(rows[0].id);
    }

    return ids;
  }
}
