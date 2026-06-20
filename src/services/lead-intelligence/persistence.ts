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

  private assertCanWrite() {
    return assertLeadIntelligencePersistenceAccess(this.options.auth, this.options.env);
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
}
