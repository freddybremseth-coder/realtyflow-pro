import { z } from "zod";

export const LEAD_INTELLIGENCE_FEATURE_FLAGS = {
  leadIntelligence: "REALTYFLOW_LEAD_INTELLIGENCE_ENABLED",
  propertyMatching: "REALTYFLOW_PROPERTY_MATCHING_ENABLED",
  autoSend: "REALTYFLOW_AUTO_SEND_ENABLED",
} as const;

export const LEAD_INTELLIGENCE_LIMITS = {
  id: 128,
  brand: 80,
  personName: 160,
  phone: 80,
  email: 254,
  shortText: 160,
  mediumText: 512,
  longText: 2000,
  sourceText: 1500,
  summary: 2000,
  bodyText: 12000,
  bodyHtml: 24000,
  propertyTypes: 8,
  locations: 20,
  criteria: 32,
  missingInformation: 20,
  matchReasons: 32,
  shortlistItems: 20,
  draftProperties: 10,
  facts: 80,
  jsonArray: 24,
  jsonObjectKeys: 40,
  jsonString: 1200,
} as const;

const idString = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id);
const brandString = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.brand);
const shortText = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText);
const mediumText = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText);
const longText = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.longText);
const sourceText = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.sourceText);
const nullableShortText = shortText.nullable();
const nullableMediumText = mediumText.nullable();
const dateTimeNullable = z.string().datetime().nullable();

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

export const CANONICAL_CRITERION_KEYS = [
  "bedrooms",
  "bathrooms",
  "property_type",
  "location",
  "total_budget",
  "purchase_price",
  "estimated_total_cost",
  "floor_position",
  "has_lift",
  "terrace_area_m2",
  "terrace_access",
  "view_quality",
  "orientation",
  "parking",
  "pool",
  "new_build_or_resale",
  "availability_status",
  "availability_verified_at",
  "adjacent_plot_status",
  "future_building_risk",
  "view_privacy_loss_risk",
  "view_obstruction_risk",
  "legal_notes",
  "living_area_m2",
  "plot_area_m2",
  "distance_to_beach",
  "stairs",
  "other",
  "unknown",
] as const;

export const CANONICAL_PROPERTY_TYPES = [
  "end_townhouse",
  "townhouse",
  "apartment",
  "penthouse",
  "villa",
  "duplex",
  "bungalow",
  "finca",
  "country_house",
  "plot",
  "commercial",
  "other",
  "unknown",
] as const;

export const CanonicalCriterionKeySchema = z.enum(CANONICAL_CRITERION_KEYS);
export const CanonicalPropertyTypeSchema = z.enum(CANONICAL_PROPERTY_TYPES);

type CanonicalCriterionKey = (typeof CANONICAL_CRITERION_KEYS)[number];
type CanonicalPropertyType = (typeof CANONICAL_PROPERTY_TYPES)[number];

const canonicalCriterionKeySet = new Set<string>(CANONICAL_CRITERION_KEYS);
const canonicalPropertyTypeSet = new Set<string>(CANONICAL_PROPERTY_TYPES);

const criterionKeyAliases: Record<string, CanonicalCriterionKey> = {
  bedroom: "bedrooms",
  bedroom_count: "bedrooms",
  bedrooms_count: "bedrooms",
  number_of_bedrooms: "bedrooms",
  min_bedrooms: "bedrooms",
  bathroom: "bathrooms",
  bathroom_count: "bathrooms",
  type: "property_type",
  boligtype: "property_type",
  max_budget: "total_budget",
  budget_total: "total_budget",
  total_cost_budget: "total_budget",
  total_price: "estimated_total_cost",
  floor: "floor_position",
  top_floor: "floor_position",
  is_top_floor: "floor_position",
  lift: "has_lift",
  elevator: "has_lift",
  terrace: "terrace_area_m2",
  terrace_size: "terrace_area_m2",
  terrace_m2: "terrace_area_m2",
  view: "view_quality",
  utsikt: "view_quality",
  garage: "parking",
  resale_or_new_build: "new_build_or_resale",
  nabotomt: "adjacent_plot_status",
  adjacent_plot: "adjacent_plot_status",
  building_risk: "future_building_risk",
  future_construction_risk: "future_building_risk",
  privacy_risk: "view_privacy_loss_risk",
};

const propertyTypeAliases: Record<string, CanonicalPropertyType> = {
  "end terrace": "end_townhouse",
  end_terrace: "end_townhouse",
  end_rekkehus: "end_townhouse",
  enderekkehus: "end_townhouse",
  rekkehus: "townhouse",
  townhouse: "townhouse",
  leilighet: "apartment",
  apartment: "apartment",
  flat: "apartment",
  penthouse: "penthouse",
  toppleilighet: "penthouse",
  villa: "villa",
  duplex: "duplex",
  bungalow: "bungalow",
  finca: "finca",
  country_home: "country_house",
  country_house: "country_house",
  plot: "plot",
  tomt: "plot",
};

type BoundedJson =
  | string
  | number
  | boolean
  | null
  | BoundedJson[]
  | { [key: string]: BoundedJson };

export const BoundedJsonSchema: z.ZodType<BoundedJson> = z.lazy(() =>
  z.union([
    z.string().max(LEAD_INTELLIGENCE_LIMITS.jsonString),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(BoundedJsonSchema).max(LEAD_INTELLIGENCE_LIMITS.jsonArray),
    z
      .record(z.string().max(LEAD_INTELLIGENCE_LIMITS.shortText), BoundedJsonSchema)
      .superRefine((value, ctx) => {
        if (Object.keys(value).length > LEAD_INTELLIGENCE_LIMITS.jsonObjectKeys) {
          ctx.addIssue({
            code: "custom",
            message: `JSON object cannot exceed ${LEAD_INTELLIGENCE_LIMITS.jsonObjectKeys} keys`,
          });
        }
      }),
  ]),
);

export const ConfidenceSchema = z.number().min(0).max(1);

export function normalizeCriterionKey(value: unknown): CanonicalCriterionKey {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) return "unknown";
  if (criterionKeyAliases[normalized]) return criterionKeyAliases[normalized];
  if (canonicalCriterionKeySet.has(normalized)) return normalized as CanonicalCriterionKey;
  return "other";
}

export function normalizePropertyType(value: unknown): CanonicalPropertyType {
  const raw = String(value || "").trim().toLowerCase();
  const normalized = raw
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) return "unknown";
  if (propertyTypeAliases[raw]) return propertyTypeAliases[raw];
  if (propertyTypeAliases[normalized]) return propertyTypeAliases[normalized];
  if (canonicalPropertyTypeSet.has(normalized)) return normalized as CanonicalPropertyType;
  return "other";
}

export function normalizeCurrencyCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const lower = raw.toLowerCase().trim();
  const aliases: Record<string, string> = {
    "€": "EUR",
    euro: "EUR",
    euros: "EUR",
    nok: "NOK",
    kroner: "NOK",
    kr: "NOK",
    usd: "USD",
  };

  return aliases[lower] || compact;
}

export function normalizeLanguageCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const compact = raw.replace("_", "-").toLowerCase();
  const aliases: Record<string, string> = {
    norsk: "no",
    norwegian: "no",
    nb: "no",
    "nb-no": "no",
    english: "en",
    engelsk: "en",
    spanish: "es",
    spansk: "es",
    espanol: "es",
    "español": "es",
  };

  return aliases[compact] || compact;
}

export function normalizeCountryCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const lower = raw.toLowerCase().trim();
  const aliases: Record<string, string> = {
    norge: "NO",
    norway: "NO",
    noruega: "NO",
    spania: "ES",
    spain: "ES",
    espana: "ES",
    "españa": "ES",
  };

  return aliases[lower] || compact;
}

export const CurrencyCodeSchema = z.preprocess(
  normalizeCurrencyCode,
  z.string().regex(/^[A-Z]{3}$/).nullable(),
);

export const LanguageCodeSchema = z.preprocess(
  normalizeLanguageCode,
  z.string().regex(/^[a-z]{2}(-[a-z]{2})?$/).nullable(),
);

export const CountryCodeSchema = z.preprocess(
  normalizeCountryCode,
  z.string().regex(/^[A-Z]{2}$/).nullable(),
);

export const SourceEvidenceSchema = z
  .object({
    sourceText,
    sourceMessageId: idString.nullable().optional(),
    confidence: ConfidenceSchema.optional(),
  })
  .strict();

export const ExtractedLeadContactSchema = z
  .object({
    name: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.personName).nullable(),
    phone: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.phone).nullable(),
    email: z.string().trim().email().max(LEAD_INTELLIGENCE_LIMITS.email).nullable(),
    language: LanguageCodeSchema,
    country: CountryCodeSchema,
  })
  .strict();

export const ExtractedBudgetSchema = z
  .object({
    amount: z.number().positive().nullable(),
    currency: CurrencyCodeSchema,
    includesCosts: z.boolean().nullable(),
    approximate: z.boolean(),
    hardLimit: z.boolean().nullable(),
  })
  .strict();

export const ExtractedLocationSchema = z
  .object({
    preferred: z.array(shortText).max(LEAD_INTELLIGENCE_LIMITS.locations),
    excluded: z.array(shortText).max(LEAD_INTELLIGENCE_LIMITS.locations),
    flexible: z.boolean(),
  })
  .strict();

const canonicalCriterionFields = {
  key: CanonicalCriterionKeySchema,
  otherKey: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable().optional(),
  operator: CriterionOperatorSchema,
  value: BoundedJsonSchema,
  appliesToPropertyTypes: z
    .array(CanonicalPropertyTypeSchema)
    .max(LEAD_INTELLIGENCE_LIMITS.propertyTypes)
    .optional(),
};

function enforceOtherKey(
  value: { key: CanonicalCriterionKey; otherKey?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.key === "other" && !value.otherKey) {
    ctx.addIssue({
      code: "custom",
      path: ["otherKey"],
      message: "otherKey is required when key is other",
    });
  }

  if (value.key !== "other" && value.otherKey) {
    ctx.addIssue({
      code: "custom",
      path: ["otherKey"],
      message: "otherKey is only allowed when key is other",
    });
  }
}

export const ExtractedRequirementSchema = SourceEvidenceSchema.extend(canonicalCriterionFields)
  .strict()
  .superRefine(enforceOtherKey);

export const ExtractedPreferenceSchema = SourceEvidenceSchema.extend({
  ...canonicalCriterionFields,
  weight: z.number().min(0).max(1),
})
  .strict()
  .superRefine(enforceOtherKey);

export const ExtractedExclusionSchema = SourceEvidenceSchema.extend({
  ...canonicalCriterionFields,
  severity: z.enum(["reject", "major_penalty", "minor_penalty"]),
})
  .strict()
  .superRefine(enforceOtherKey);

export const MissingInformationSchema = z
  .object({
    key: CanonicalCriterionKeySchema,
    otherKey: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable().optional(),
    question: mediumText,
    priority: z.enum(["high", "medium", "low"]),
  })
  .strict()
  .superRefine(enforceOtherKey);

export const ExtractedLeadSchema = z
  .object({
    contact: ExtractedLeadContactSchema,
    purchaseReadiness: z
      .object({
        level: PurchaseReadinessLevelSchema,
        confidence: ConfidenceSchema,
        reasoning: longText,
      })
      .strict(),
    budget: ExtractedBudgetSchema,
    propertyTypes: z.array(CanonicalPropertyTypeSchema).max(LEAD_INTELLIGENCE_LIMITS.propertyTypes),
    locations: ExtractedLocationSchema,
    hardRequirements: z.array(ExtractedRequirementSchema).max(LEAD_INTELLIGENCE_LIMITS.criteria),
    preferences: z.array(ExtractedPreferenceSchema).max(LEAD_INTELLIGENCE_LIMITS.criteria),
    exclusions: z.array(ExtractedExclusionSchema).max(LEAD_INTELLIGENCE_LIMITS.criteria),
    missingInformation: z.array(MissingInformationSchema).max(LEAD_INTELLIGENCE_LIMITS.missingInformation),
    summary: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.summary),
    suggestedNextAction: longText,
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

type ApprovalCarrier = {
  approvalStatus?: z.infer<typeof ApprovalStatusSchema>;
  approvedBy?: string | null;
  approvedAt?: string | null;
};

function enforceApprovalInvariant(value: ApprovalCarrier, ctx: z.RefinementCtx) {
  if (value.approvalStatus === "approved") {
    if (!value.approvedBy) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedBy"],
        message: "approvedBy is required when approvalStatus is approved",
      });
    }
    if (!value.approvedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedAt"],
        message: "approvedAt is required when approvalStatus is approved",
      });
    }
  }

  if (value.approvalStatus && value.approvalStatus !== "approved" && value.approvedAt) {
    ctx.addIssue({
      code: "custom",
      path: ["approvedAt"],
      message: "approvedAt is only allowed for approved items",
    });
  }
}

export const BuyerProfileCriterionSchema = z
  .object({
    id: idString.optional(),
    key: CanonicalCriterionKeySchema,
    otherKey: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable().optional(),
    operator: CriterionOperatorSchema,
    value: BoundedJsonSchema,
    source: CriterionSourceSchema,
    sourceText: sourceText.nullable(),
    confidence: ConfidenceSchema.nullable(),
    customerConfirmed: z.boolean(),
    active: z.boolean(),
    approvalStatus: ApprovalStatusSchema,
    createdBy: nullableShortText,
    approvedBy: nullableShortText,
    approvedAt: dateTimeNullable,
  })
  .strict()
  .superRefine((value, ctx) => {
    enforceOtherKey(value, ctx);
    enforceApprovalInvariant(value, ctx);
  });

export const BuyerProfilePreferenceSchema = BuyerProfileCriterionSchema.extend({
  weight: z.number().min(0).max(1),
}).strict();

export const BuyerProfileExclusionSchema = BuyerProfileCriterionSchema.extend({
  severity: z.enum(["reject", "major_penalty", "minor_penalty"]),
}).strict();

export const BuyerProfileSchema = z
  .object({
    id: idString.optional(),
    leadId: idString.nullable(),
    contactId: idString.nullable(),
    brand: brandString,
    profileVersion: z.number().int().positive(),
    status: ApprovalStatusSchema,
    requirements: z.array(BuyerProfileCriterionSchema).max(LEAD_INTELLIGENCE_LIMITS.criteria),
    preferences: z.array(BuyerProfilePreferenceSchema).max(LEAD_INTELLIGENCE_LIMITS.criteria),
    exclusions: z.array(BuyerProfileExclusionSchema).max(LEAD_INTELLIGENCE_LIMITS.criteria),
    createdBy: nullableShortText,
    updatedBy: nullableShortText,
    approvedBy: nullableShortText,
    approvedAt: dateTimeNullable,
    createdAt: dateTimeNullable,
    updatedAt: dateTimeNullable,
  })
  .strict()
  .superRefine((profile, ctx) => {
    enforceApprovalInvariant(profile, ctx);
    if (profile.status !== "approved") return;

    const allCriteria = [
      ...profile.requirements.map((row) => ["requirements", row] as const),
      ...profile.preferences.map((row) => ["preferences", row] as const),
      ...profile.exclusions.map((row) => ["exclusions", row] as const),
    ];

    allCriteria.forEach(([collection, criterion], index) => {
      if (criterion.active && criterion.approvalStatus !== "approved") {
        ctx.addIssue({
          code: "custom",
          path: [collection, index, "approvalStatus"],
          message: "active criteria must be individually approved before parent profile approval",
        });
      }
    });
  });

export const FactVerificationStatusSchema = z.enum([
  "unknown",
  "inferred",
  "unverified",
  "verified",
]);

export const NormalizedPropertyFactSchema = z
  .object({
    value: BoundedJsonSchema,
    verificationStatus: FactVerificationStatusSchema,
    sourceField: nullableShortText,
    source: nullableShortText,
    verifiedAt: dateTimeNullable,
  })
  .strict()
  .superRefine((fact, ctx) => {
    if (fact.verificationStatus === "verified") {
      if (!fact.source) {
        ctx.addIssue({
          code: "custom",
          path: ["source"],
          message: "verified facts require source",
        });
      }
      if (!fact.sourceField) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceField"],
          message: "verified facts require sourceField",
        });
      }
      if (!fact.verifiedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["verifiedAt"],
          message: "verified facts require verifiedAt",
        });
      }
    }

    if (fact.verificationStatus !== "verified" && fact.verifiedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["verifiedAt"],
        message: "only verified facts may have verifiedAt",
      });
    }
  });

export const NormalizedPropertyFactsSchema = z
  .record(z.string().max(LEAD_INTELLIGENCE_LIMITS.shortText), NormalizedPropertyFactSchema)
  .superRefine((facts, ctx) => {
    const count = Object.keys(facts).length;
    if (count > LEAD_INTELLIGENCE_LIMITS.facts) {
      ctx.addIssue({
        code: "custom",
        message: `property facts cannot exceed ${LEAD_INTELLIGENCE_LIMITS.facts} entries`,
      });
    }

    Object.keys(facts).forEach((key) => {
      if (!canonicalCriterionKeySet.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "property fact keys must use the canonical criterion registry",
        });
      }
    });
  });

export const NormalizedPropertyForMatchingSchema = z
  .object({
    propertyId: idString,
    brandId: brandString.nullable(),
    facts: NormalizedPropertyFactsSchema,
    dataQualityScore: z.number().min(0).max(100),
    updatedAt: dateTimeNullable,
  })
  .strict();

export const MatchCriterionResultSchema = z
  .object({
    key: CanonicalCriterionKeySchema,
    otherKey: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable().optional(),
    outcome: z.enum(["pass", "fail", "unknown", "penalty", "not_applicable"]),
    expected: BoundedJsonSchema,
    actual: BoundedJsonSchema,
    sourceField: nullableShortText,
    reason: mediumText,
  })
  .strict()
  .superRefine(enforceOtherKey);

export const PropertyMatchSchema = z
  .object({
    propertyId: idString,
    buyerProfileId: idString,
    score: z.number().min(0).max(100),
    eligibility: z.enum(["eligible", "conditional", "rejected"]),
    hardRequirementResults: z
      .array(MatchCriterionResultSchema)
      .max(LEAD_INTELLIGENCE_LIMITS.criteria),
    preferenceResults: z.array(MatchCriterionResultSchema).max(LEAD_INTELLIGENCE_LIMITS.criteria),
    exclusionResults: z.array(MatchCriterionResultSchema).max(LEAD_INTELLIGENCE_LIMITS.criteria),
    budgetResult: MatchCriterionResultSchema.nullable(),
    dataQualityScore: z.number().min(0).max(100),
    verifiedFacts: z.array(shortText).max(LEAD_INTELLIGENCE_LIMITS.matchReasons),
    unverifiedFacts: z.array(shortText).max(LEAD_INTELLIGENCE_LIMITS.matchReasons),
    reasonsForMatch: z.array(mediumText).max(LEAD_INTELLIGENCE_LIMITS.matchReasons),
    concerns: z.array(mediumText).max(LEAD_INTELLIGENCE_LIMITS.matchReasons),
    questionsToVerify: z.array(mediumText).max(LEAD_INTELLIGENCE_LIMITS.matchReasons),
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
    propertyId: idString,
    matchId: idString.nullable(),
    decision: ShortlistItemDecisionSchema,
    sortOrder: z.number().int().nonnegative(),
    approvedForPresentation: z.boolean(),
    notes: nullableMediumText,
  })
  .strict();

export const CustomerMessageDraftStatusSchema = z.enum(["draft", "approved", "sent", "cancelled"]);

export const CustomerMessageDraftSchema = z
  .object({
    id: idString.optional(),
    leadId: idString.nullable(),
    contactId: idString.nullable(),
    brand: brandString,
    channel: z.enum(["email", "whatsapp", "sms", "internal_preview"]),
    subject: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText).nullable(),
    bodyText: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.bodyText),
    bodyHtml: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.bodyHtml).nullable(),
    propertyIds: z.array(idString).max(LEAD_INTELLIGENCE_LIMITS.draftProperties),
    profileVersion: z.number().int().positive(),
    status: CustomerMessageDraftStatusSchema,
    approvedBy: nullableShortText,
    approvedAt: dateTimeNullable,
    sentAt: dateTimeNullable,
  })
  .strict()
  .superRefine((draft, ctx) => {
    if (draft.status === "approved" || draft.status === "sent") {
      if (!draft.approvedBy) {
        ctx.addIssue({
          code: "custom",
          path: ["approvedBy"],
          message: "approvedBy is required for approved or sent drafts",
        });
      }
      if (!draft.approvedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["approvedAt"],
          message: "approvedAt is required for approved or sent drafts",
        });
      }
    }

    if (draft.status === "sent" && !draft.sentAt) {
      ctx.addIssue({
        code: "custom",
        path: ["sentAt"],
        message: "sentAt is required for sent drafts",
      });
    }

    if ((draft.status === "draft" || draft.status === "cancelled") && draft.sentAt) {
      ctx.addIssue({
        code: "custom",
        path: ["sentAt"],
        message: "draft or cancelled messages cannot have sentAt",
      });
    }
  });

export const LeadFollowupActionSchema = z
  .object({
    leadId: idString.nullable(),
    contactId: idString.nullable(),
    brand: brandString,
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
    dueAt: dateTimeNullable,
    approvalStatus: ApprovalStatusSchema,
    safeSummary: mediumText,
  })
  .strict();

export const CustomerFeedbackEventSchema = z
  .object({
    leadId: idString.nullable(),
    contactId: idString.nullable(),
    propertyId: idString.nullable(),
    response: z.enum(["interested", "maybe", "not_relevant", "wants_viewing", "comment"]),
    comment: nullableMediumText,
    proposedProfileUpdates: z
      .array(BuyerProfileCriterionSchema)
      .max(LEAD_INTELLIGENCE_LIMITS.criteria),
    approvalStatus: ApprovalStatusSchema,
  })
  .strict();

export const PhoneLookupStatusSchema = z.enum([
  "empty",
  "invalid",
  "national",
  "verified_e164",
]);

export type PhoneLookupStatus = z.infer<typeof PhoneLookupStatusSchema>;

export interface PhoneLookupNormalization {
  raw: string;
  normalizedLookup: string | null;
  e164: string | null;
  verifiedE164: boolean;
  status: PhoneLookupStatus;
  reason: string | null;
}

export function inspectPhoneForLeadLookup(value: string | null | undefined): PhoneLookupNormalization {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      raw,
      normalizedLookup: null,
      e164: null,
      verifiedE164: false,
      status: "empty",
      reason: "empty",
    };
  }

  if (/\b(ext|extension|x)\b/i.test(raw)) {
    return {
      raw,
      normalizedLookup: null,
      e164: null,
      verifiedE164: false,
      status: "invalid",
      reason: "extensions_not_supported_for_lookup",
    };
  }

  const converted = raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
  const hasPlus = converted.startsWith("+");
  const digits = converted.replace(/[^\d]/g, "");
  const normalizedLookup = hasPlus ? `+${digits}` : digits;

  if (digits.length < 7 || digits.length > 15) {
    return {
      raw,
      normalizedLookup: digits || null,
      e164: null,
      verifiedE164: false,
      status: "invalid",
      reason: "phone_length_out_of_bounds",
    };
  }

  const isE164 = hasPlus && /^\+[1-9]\d{6,14}$/.test(normalizedLookup);

  return {
    raw,
    normalizedLookup,
    e164: isE164 ? normalizedLookup : null,
    verifiedE164: isE164,
    status: isE164 ? "verified_e164" : "national",
    reason: isE164 ? null : "missing_country_code",
  };
}

export function normalizePhoneForLeadLookup(value: string | null | undefined): string | null {
  return inspectPhoneForLeadLookup(value).normalizedLookup;
}

export type ExtractedLead = z.infer<typeof ExtractedLeadSchema>;
export type BuyerProfile = z.infer<typeof BuyerProfileSchema>;
export type NormalizedPropertyForMatching = z.infer<typeof NormalizedPropertyForMatchingSchema>;
export type PropertyMatch = z.infer<typeof PropertyMatchSchema>;
export type CustomerMessageDraft = z.infer<typeof CustomerMessageDraftSchema>;
