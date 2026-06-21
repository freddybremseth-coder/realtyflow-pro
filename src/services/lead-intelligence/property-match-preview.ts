import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { propertyMatchesBrand } from "@/lib/realty/brand-rules";
import {
  BoundedJsonSchema,
  CanonicalCriterionKeySchema,
  CanonicalPropertyTypeSchema,
  CriterionOperatorSchema,
  CurrencyCodeSchema,
  LEAD_INTELLIGENCE_LIMITS,
  type ExtractedLead,
  type PropertyMatch,
} from "./contracts";
import { LeadIntelligenceRealEstateBrandSchema } from "./brand-allowlist";
import { LeadIntelligenceError } from "./extraction";
import type { QueryClient } from "./persistence";
import {
  matchPropertyToLeadProfile,
  normalizePropertyForLeadMatching,
  rankPropertyMatches,
  type LeadMatchProfile,
} from "./property-matching";

const UUIDSchema = z.string().uuid();
const MAX_PROPERTY_MATCH_PREVIEW_ITEMS = 20;

export const LeadPropertyMatchPreviewRequestSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    buyerProfileId: UUIDSchema,
    propertyIds: z
      .array(UUIDSchema)
      .min(1)
      .max(MAX_PROPERTY_MATCH_PREVIEW_ITEMS)
      .superRefine((ids, ctx) => {
        if (new Set(ids).size !== ids.length) {
          ctx.addIssue({
            code: "custom",
            message: "propertyIds must be unique",
          });
        }
      }),
    maxResults: z.number().int().min(1).max(MAX_PROPERTY_MATCH_PREVIEW_ITEMS).optional(),
  })
  .strict();

export type LeadPropertyMatchPreviewRequest = z.infer<typeof LeadPropertyMatchPreviewRequestSchema>;

const persistedCriterionSchema = z
  .object({
    criterionType: z.enum(["hard_requirement", "preference", "exclusion", "missing_information"]),
    key: CanonicalCriterionKeySchema,
    otherKey: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable(),
    operator: CriterionOperatorSchema,
    value: BoundedJsonSchema,
    weight: z.number().min(0).max(1).nullable(),
    severity: z.enum(["reject", "major_penalty", "minor_penalty"]).nullable(),
    appliesToPropertyTypes: z.array(CanonicalPropertyTypeSchema).max(LEAD_INTELLIGENCE_LIMITS.propertyTypes),
    sourceText: z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.sourceText).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

const persistedProfileSchema = z
  .object({
    id: UUIDSchema,
    budgetAmount: z.number().nonnegative().nullable(),
    budgetCurrency: CurrencyCodeSchema,
    budgetIncludesCosts: z.boolean().nullable(),
    budgetApproximate: z.boolean(),
    locationFlexible: z.boolean(),
  })
  .strict();

type PersistedCriterion = z.infer<typeof persistedCriterionSchema>;
type PersistedProfile = z.infer<typeof persistedProfileSchema>;
type RawProperty = Record<string, unknown>;

export interface PropertyMatchPreviewRepository {
  loadApprovedBuyerProfile(brand: string, buyerProfileId: string): Promise<LeadMatchProfile | null>;
  loadProperties(brand: string, propertyIds: string[]): Promise<RawProperty[]>;
}

export interface PropertyMatchPreviewResult {
  buyerProfileId: string;
  analyzed: number;
  matched: number;
  missingPropertyIds: string[];
  skippedProperties: Array<{
    propertyId: string;
    reason: "PROPERTY_BRAND_MISMATCH" | "PROPERTY_NORMALIZATION_FAILED";
  }>;
  matches: PropertyMatch[];
  sideEffects: {
    leadsCreated: false;
    contactsCreated: false;
    emailsSent: false;
    matchesPersisted: false;
    shortlistCreated: false;
  };
}

export async function loadApprovedLeadMatchProfileWithDb(
  db: QueryClient,
  input: { brand: string; buyerProfileId: string },
): Promise<LeadMatchProfile | null> {
  const profileResult = await db.query<{
    id: string;
    budgetAmount: number | string | null;
    budgetCurrency: string | null;
    budgetIncludesCosts: boolean | null;
    budgetApproximate: boolean | null;
    locationFlexible: boolean | null;
  }>(
    `
      select
        id::text,
        budget_amount::float8 as "budgetAmount",
        budget_currency as "budgetCurrency",
        budget_includes_costs as "budgetIncludesCosts",
        budget_approximate as "budgetApproximate",
        location_flexible as "locationFlexible"
      from public.buyer_profiles
      where id = $1::uuid
        and brand = $2
        and status = 'approved'
      limit 1
    `,
    [input.buyerProfileId, input.brand],
  );

  const profileRow = profileResult.rows[0];
  if (!profileRow) return null;

  const criteriaResult = await db.query<{
    criterionType: string;
    key: string;
    otherKey: string | null;
    operator: string;
    value: unknown;
    weight: number | string | null;
    severity: string | null;
    appliesToPropertyTypes: string[] | null;
    sourceText: string | null;
    confidence: number | string | null;
  }>(
    `
      select
        criterion_type as "criterionType",
        key,
        other_key as "otherKey",
        operator,
        value,
        weight::float8 as weight,
        severity,
        applies_to_property_types as "appliesToPropertyTypes",
        source_text as "sourceText",
        confidence::float8 as confidence
      from public.buyer_profile_criteria
      where buyer_profile_id = $1::uuid
        and active is true
        and approval_status = 'approved'
      order by created_at asc, id asc
    `,
    [input.buyerProfileId],
  );

  const profile = persistedProfileSchema.parse({
    ...profileRow,
    budgetAmount: toNumberOrNull(profileRow.budgetAmount),
    budgetApproximate: profileRow.budgetApproximate ?? false,
    locationFlexible: profileRow.locationFlexible ?? true,
  });

  const criteria = criteriaResult.rows.map((row) =>
    persistedCriterionSchema.parse({
      ...row,
      weight: toNumberOrNull(row.weight),
      confidence: toNumberOrNull(row.confidence),
      appliesToPropertyTypes: Array.isArray(row.appliesToPropertyTypes)
        ? row.appliesToPropertyTypes
        : [],
    }),
  );

  return buildLeadMatchProfile(profile, criteria);
}

export async function loadPropertiesByIdsFromSupabase(
  _brand: string,
  propertyIds: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<RawProperty[]> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new LeadIntelligenceError(
      "PROPERTY_MATCHING_UNAVAILABLE",
      "Property matching inventory lookup is not configured",
      503,
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .in("id", propertyIds)
    .limit(MAX_PROPERTY_MATCH_PREVIEW_ITEMS);

  if (error) {
    throw new LeadIntelligenceError(
      "PROPERTY_MATCHING_UNAVAILABLE",
      "Property matching inventory lookup failed",
      503,
    );
  }

  return (data || []) as RawProperty[];
}

export async function previewLeadPropertyMatches(
  request: LeadPropertyMatchPreviewRequest,
  repository: PropertyMatchPreviewRepository,
): Promise<PropertyMatchPreviewResult> {
  const profile = await repository.loadApprovedBuyerProfile(request.brand, request.buyerProfileId);
  if (!profile) {
    throw new LeadIntelligenceError(
      "BUYER_PROFILE_NOT_FOUND",
      "Approved buyer profile was not found",
      404,
    );
  }

  return previewLeadPropertyMatchesForProfile(request, profile, (brand, propertyIds) =>
    repository.loadProperties(brand, propertyIds),
  );
}

export async function previewLeadPropertyMatchesForProfile(
  request: LeadPropertyMatchPreviewRequest,
  profile: LeadMatchProfile,
  loadProperties: (brand: string, propertyIds: string[]) => Promise<RawProperty[]>,
): Promise<PropertyMatchPreviewResult> {
  const properties = await loadProperties(request.brand, request.propertyIds);
  const foundIds = new Set(properties.map((property) => String(property.id || "")));
  const missingPropertyIds = request.propertyIds.filter((id) => !foundIds.has(id));
  const matches: PropertyMatch[] = [];
  const skippedProperties: PropertyMatchPreviewResult["skippedProperties"] = [];

  for (const property of properties) {
    const propertyId = String(property.id || "");
    if (!propertyMatchesBrand(property, request.brand)) {
      skippedProperties.push({ propertyId, reason: "PROPERTY_BRAND_MISMATCH" });
      continue;
    }

    try {
      matches.push(matchPropertyToLeadProfile(profile, normalizePropertyForLeadMatching(property)));
    } catch {
      skippedProperties.push({ propertyId, reason: "PROPERTY_NORMALIZATION_FAILED" });
    }
  }

  const maxResults = request.maxResults ?? request.propertyIds.length;
  const ranked = rankPropertyMatches(matches).slice(0, maxResults);

  return {
    buyerProfileId: profile.buyerProfileId,
    analyzed: properties.length,
    matched: ranked.length,
    missingPropertyIds,
    skippedProperties,
    matches: ranked,
    sideEffects: {
      leadsCreated: false,
      contactsCreated: false,
      emailsSent: false,
      matchesPersisted: false,
      shortlistCreated: false,
    },
  };
}

function buildLeadMatchProfile(profile: PersistedProfile, criteria: PersistedCriterion[]): LeadMatchProfile {
  return {
    buyerProfileId: profile.id,
    budget: {
      amount: profile.budgetAmount,
      currency: profile.budgetCurrency,
      includesCosts: profile.budgetIncludesCosts,
      approximate: profile.budgetApproximate,
      hardLimit: null,
    },
    propertyTypes: derivePropertyTypes(criteria),
    locations: {
      preferred: [],
      excluded: [],
      flexible: profile.locationFlexible,
    },
    hardRequirements: criteria
      .filter((criterion) => criterion.criterionType === "hard_requirement")
      .map((criterion) => criterionToRequirement(criterion)),
    preferences: criteria
      .filter((criterion) => criterion.criterionType === "preference")
      .map((criterion) => ({
        ...criterionToRequirement(criterion),
        weight: criterion.weight ?? 0.5,
      })),
    exclusions: criteria
      .filter((criterion) => criterion.criterionType === "exclusion")
      .map((criterion) => ({
        ...criterionToRequirement(criterion),
        severity: criterion.severity || "major_penalty",
      })),
  };
}

function criterionToRequirement(criterion: PersistedCriterion): ExtractedLead["hardRequirements"][number] {
  return {
    key: criterion.key,
    otherKey: criterion.otherKey || undefined,
    operator: criterion.operator,
    value: criterion.value,
    sourceText: criterion.sourceText || "Approved buyer profile criterion",
    ...(criterion.confidence === null ? {} : { confidence: criterion.confidence }),
    ...(criterion.appliesToPropertyTypes.length > 0
      ? { appliesToPropertyTypes: criterion.appliesToPropertyTypes }
      : {}),
  } as ExtractedLead["hardRequirements"][number];
}

function derivePropertyTypes(criteria: PersistedCriterion[]): ExtractedLead["propertyTypes"] {
  const values = new Set<ExtractedLead["propertyTypes"][number]>();
  for (const criterion of criteria) {
    if (criterion.key !== "property_type") continue;
    const raw = Array.isArray(criterion.value) ? criterion.value : [criterion.value];
    for (const value of raw) {
      const parsed = CanonicalPropertyTypeSchema.safeParse(value);
      if (parsed.success) values.add(parsed.data);
    }
  }
  return Array.from(values).slice(0, LEAD_INTELLIGENCE_LIMITS.propertyTypes);
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
