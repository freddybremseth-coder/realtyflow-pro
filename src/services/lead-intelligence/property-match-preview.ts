import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { propertyMatchesBrand } from "@/lib/realty/brand-rules";
import {
  BoundedJsonSchema,
  CanonicalCriterionKeySchema,
  CanonicalPropertyTypeSchema,
  CriterionOperatorSchema,
  CurrencyCodeSchema,
  ExtractedLeadSchema,
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
const DEFAULT_AUTO_PROPERTY_CANDIDATE_LIMIT = 120;
const MAX_AUTO_PROPERTY_CANDIDATE_LIMIT = 200;
const AUTO_PROPERTY_SCAN_MULTIPLIER = 4;
const LOCATION_DISCOVERY_COLUMNS = [
  "location",
  "town",
  "municipality",
  "area",
  "title",
  "title_no",
  "title_en",
] as const;
const PropertyReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "property reference must be a UUID or listing reference");

export const LeadPropertyMatchPreviewRequestSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    buyerProfileId: UUIDSchema,
    propertyReferences: z.array(PropertyReferenceSchema).min(1).max(MAX_PROPERTY_MATCH_PREVIEW_ITEMS).optional(),
    propertyIds: z.array(UUIDSchema).min(1).max(MAX_PROPERTY_MATCH_PREVIEW_ITEMS).optional(),
    autoDiscover: z.boolean().optional(),
    candidateLimit: z.number().int().min(1).max(MAX_AUTO_PROPERTY_CANDIDATE_LIMIT).optional(),
    maxResults: z.number().int().min(1).max(MAX_PROPERTY_MATCH_PREVIEW_ITEMS).optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    const references = request.propertyReferences || request.propertyIds || [];
    if (request.autoDiscover && references.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["autoDiscover"],
        message: "Use either autoDiscover or explicit propertyReferences, not both",
      });
      return;
    }
    if (!request.autoDiscover && references.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["propertyReferences"],
        message: "propertyReferences are required unless autoDiscover is true",
      });
      return;
    }
    const normalized = references.map((reference) => normalizePropertyReference(reference));
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({
        code: "custom",
        path: [request.propertyReferences ? "propertyReferences" : "propertyIds"],
        message: "property references must be unique",
      });
    }
  })
  .transform((request) => ({
    brand: request.brand,
    buyerProfileId: request.buyerProfileId,
    propertyReferences: request.propertyReferences || request.propertyIds || [],
    autoDiscover: request.autoDiscover === true,
    candidateLimit: request.candidateLimit,
    maxResults: request.maxResults,
  }));

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
    intakeId: UUIDSchema,
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
type SafePropertyValue = string | number | boolean | null;
type SupabasePropertyLookupError = { code?: string | null; message?: string | null };
type SupabaseInventoryClient = {
  from(table: string): ReturnType<ReturnType<typeof createClient>["from"]>;
};

export interface PropertyMatchPreviewPropertySummary {
  id: string;
  reference: string | null;
  title: string | null;
  location: string | null;
  propertyType: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  primaryImageUrl: string | null;
  publicUrl: string | null;
}

export type PropertyMatchPreviewMatch = PropertyMatch & {
  property: PropertyMatchPreviewPropertySummary;
};

export interface PropertyMatchPreviewRepository {
  loadApprovedBuyerProfile(brand: string, buyerProfileId: string): Promise<LeadMatchProfile | null>;
  loadProperties(brand: string, propertyReferences: string[]): Promise<RawProperty[]>;
  loadCandidateProperties?(brand: string, profile: LeadMatchProfile, candidateLimit: number): Promise<RawProperty[]>;
}

export interface PropertyMatchPreviewResult {
  buyerProfileId: string;
  discoveryMode: "explicit" | "auto";
  bestEffort: boolean;
  analyzed: number;
  matched: number;
  candidateLimit: number | null;
  missingPropertyReferences: string[];
  skippedProperties: Array<{
    propertyId: string;
    reason: "PROPERTY_BRAND_MISMATCH" | "PROPERTY_NORMALIZATION_FAILED";
  }>;
  matches: PropertyMatchPreviewMatch[];
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
    intakeId: string;
    budgetAmount: number | string | null;
    budgetCurrency: string | null;
    budgetIncludesCosts: boolean | null;
    budgetApproximate: boolean | null;
    locationFlexible: boolean | null;
  }>(
    `
      select
        id::text,
        intake_id::text as "intakeId",
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

  const analysisResult = await db.query<{ resultJson: unknown }>(
    `
      select result_json as "resultJson"
      from public.lead_analysis_runs
      where intake_id = $1::uuid
        and approved is true
        and validation_status = 'valid'
      order by created_at desc, id desc
      limit 1
    `,
    [profile.intakeId],
  );
  const approvedAnalysis = parseApprovedAnalysis(analysisResult.rows[0]?.resultJson);

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

  return buildLeadMatchProfile(profile, criteria, approvedAnalysis);
}

export async function loadPropertiesByReferencesFromSupabase(
  _brand: string,
  propertyReferences: string[],
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
  const uuidReferences = propertyReferences.filter((reference) => UUIDSchema.safeParse(reference).success);
  const textReferences = propertyReferences.filter((reference) => !UUIDSchema.safeParse(reference).success);
  const textVariants = Array.from(
    new Set(textReferences.flatMap((reference) => [reference, reference.toUpperCase(), reference.toLowerCase()])),
  );

  const rows = new Map<string, RawProperty>();
  const addRows = (data: RawProperty[] | null) => {
    for (const property of data || []) {
      const id = typeof property.id === "string" ? property.id : "";
      if (id) rows.set(id, property);
    }
  };

  const queryPropertiesByColumn = async (column: string, values: string[], optionalColumn = false) => {
    if (values.length === 0) return;
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .in(column, values)
      .limit(MAX_PROPERTY_MATCH_PREVIEW_ITEMS);

    if (error) {
      if (optionalColumn && isMissingPropertyReferenceColumnError(error)) {
        logOptionalPropertyReferenceColumnUnavailable(column, error);
        return;
      }
      throw new LeadIntelligenceError(
        "PROPERTY_MATCHING_UNAVAILABLE",
        "Property matching inventory lookup failed",
        503,
      );
    }
    addRows((data || []) as RawProperty[]);
  };

  if (uuidReferences.length > 0) {
    await queryPropertiesByColumn("id", uuidReferences);
  }

  if (textVariants.length > 0) {
    await queryPropertiesByColumn("ref", textVariants, true);
    await queryPropertiesByColumn("external_id", textVariants, true);
    await queryPropertiesByColumn("reference", textVariants, true);
  }

  return Array.from(rows.values()).slice(0, MAX_PROPERTY_MATCH_PREVIEW_ITEMS);
}

export async function loadCandidatePropertiesFromSupabase(
  brand: string,
  profile: LeadMatchProfile,
  candidateLimit = DEFAULT_AUTO_PROPERTY_CANDIDATE_LIMIT,
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

  const safeCandidateLimit = Math.min(
    Math.max(Math.trunc(candidateLimit || DEFAULT_AUTO_PROPERTY_CANDIDATE_LIMIT), 1),
    MAX_AUTO_PROPERTY_CANDIDATE_LIMIT,
  );
  const scanLimit = Math.min(
    Math.max(safeCandidateLimit * AUTO_PROPERTY_SCAN_MULTIPLIER, safeCandidateLimit),
    500,
  );

  const supabase = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const runCandidateQuery = async (useBudgetFilter: boolean, useCreatedOrder: boolean) => {
    let query = supabase.from("properties").select("*");
    const budgetAmount = profile.budget.amount;
    if (useBudgetFilter && budgetAmount) {
      query = query.lte("price", Math.ceil(budgetAmount * 1.15));
    }
    if (useCreatedOrder) {
      query = query.order("created_at", { ascending: false });
    }
    return query.limit(scanLimit);
  };

  const preferredLocationRows = await loadPreferredLocationCandidates(
    supabase,
    profile,
    scanLimit,
  );

  let { data, error } = await runCandidateQuery(true, true);
  if (error && isMissingPropertyReferenceColumnError(error)) {
    logOptionalPropertyReferenceColumnUnavailable("auto_discovery_filter", error);
    ({ data, error } = await runCandidateQuery(false, false));
  }

  if (error) {
    throw new LeadIntelligenceError(
      "PROPERTY_MATCHING_UNAVAILABLE",
      "Property matching inventory lookup failed",
      503,
    );
  }

  const broadRows = (data || []) as RawProperty[];
  const candidateRows =
    preferredLocationRows.length > 0 && profile.locations.flexible === false
      ? preferredLocationRows
      : mergePropertyRows(preferredLocationRows, broadRows);
  const filtered = await filterAutoDiscoveredPropertiesForBrand(
    supabase,
    brand,
    candidateRows.filter(isWebsiteVisible),
  );
  return filtered.slice(0, safeCandidateLimit);
}

async function loadPreferredLocationCandidates(
  supabase: SupabaseInventoryClient,
  profile: LeadMatchProfile,
  scanLimit: number,
) {
  const preferredLocations = cleanLocationValues(profile.locations.preferred);
  if (preferredLocations.length === 0) return [];

  const rows = new Map<string, RawProperty>();
  const addRows = (data: RawProperty[] | null) => {
    for (const property of data || []) {
      const id = typeof property.id === "string" ? property.id : "";
      if (id) rows.set(id, property);
    }
  };

  for (const location of preferredLocations) {
    const term = location.replace(/[%_]/g, "");
    if (!term) continue;
    for (const column of LOCATION_DISCOVERY_COLUMNS) {
      let query = supabase
        .from("properties")
        .select("*")
        .ilike(column, `%${term}%`)
        .limit(scanLimit);
      if (profile.budget.amount) {
        query = query.lte("price", Math.ceil(profile.budget.amount * 1.15));
      }
      const { data, error } = await query;
      if (error) {
        if (isMissingPropertyReferenceColumnError(error)) {
          logOptionalPropertyReferenceColumnUnavailable(`auto_discovery_${column}`, error);
          continue;
        }
        throw new LeadIntelligenceError(
          "PROPERTY_MATCHING_UNAVAILABLE",
          "Property matching location lookup failed",
          503,
        );
      }
      addRows((data || []) as RawProperty[]);
      if (rows.size >= scanLimit) return Array.from(rows.values()).slice(0, scanLimit);
    }
  }

  return Array.from(rows.values()).slice(0, scanLimit);
}

function mergePropertyRows(primary: RawProperty[], secondary: RawProperty[]) {
  const rows = new Map<string, RawProperty>();
  for (const property of [...primary, ...secondary]) {
    const id = typeof property.id === "string" ? property.id : "";
    if (id && !rows.has(id)) rows.set(id, property);
  }
  return Array.from(rows.values());
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

  return previewLeadPropertyMatchesForProfile(request, profile, (brand, propertyReferences) =>
    request.autoDiscover && repository.loadCandidateProperties
      ? repository.loadCandidateProperties(
          brand,
          profile,
          request.candidateLimit ?? DEFAULT_AUTO_PROPERTY_CANDIDATE_LIMIT,
        )
      : repository.loadProperties(brand, propertyReferences),
  );
}

export async function previewLeadPropertyMatchesForProfile(
  request: LeadPropertyMatchPreviewRequest,
  profile: LeadMatchProfile,
  loadProperties: (
    brand: string,
    propertyReferences: string[],
    profile: LeadMatchProfile,
    request: LeadPropertyMatchPreviewRequest,
  ) => Promise<RawProperty[]>,
): Promise<PropertyMatchPreviewResult> {
  const properties = await loadProperties(request.brand, request.propertyReferences, profile, request);
  const foundReferences = new Set(properties.flatMap(propertyReferenceKeys));
  const missingPropertyReferences = request.autoDiscover
    ? []
    : request.propertyReferences.filter((reference) => !foundReferences.has(normalizePropertyReference(reference)));
  const matches: PropertyMatch[] = [];
  const propertySummaries = new Map<string, PropertyMatchPreviewPropertySummary>();
  const skippedProperties: PropertyMatchPreviewResult["skippedProperties"] = [];

  for (const property of properties) {
    const propertyId = String(property.id || "");
    if (!propertyMatchesBrand(property, request.brand)) {
      skippedProperties.push({ propertyId, reason: "PROPERTY_BRAND_MISMATCH" });
      continue;
    }

    try {
      const match = matchPropertyToLeadProfile(profile, normalizePropertyForLeadMatching(property));
      matches.push(match);
      propertySummaries.set(match.propertyId, summarizePropertyForPreview(property, match.propertyId));
    } catch {
      skippedProperties.push({ propertyId, reason: "PROPERTY_NORMALIZATION_FAILED" });
    }
  }

  const maxResults = request.maxResults ?? (request.autoDiscover ? 10 : request.propertyReferences.length);
  const rankedAll = rankPropertyMatches(matches);
  const nonRejectedMatches = rankedAll.filter((match) => match.eligibility !== "rejected");
  const bestEffort = Boolean(request.autoDiscover && rankedAll.length > 0 && nonRejectedMatches.length === 0);
  const rankedCandidates = request.autoDiscover
    ? (bestEffort ? rankedAll : nonRejectedMatches)
    : rankedAll;
  const ranked = rankedCandidates
    .slice(0, maxResults)
    .map((match) => ({
      ...match,
      property: propertySummaries.get(match.propertyId) ?? fallbackPropertySummary(match.propertyId),
    }));

  return {
    buyerProfileId: profile.buyerProfileId,
    discoveryMode: request.autoDiscover ? "auto" : "explicit",
    bestEffort,
    analyzed: properties.length,
    matched: ranked.filter((match) => match.eligibility !== "rejected").length,
    candidateLimit: request.autoDiscover
      ? request.candidateLimit ?? DEFAULT_AUTO_PROPERTY_CANDIDATE_LIMIT
      : null,
    missingPropertyReferences,
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

function isWebsiteVisible(property: RawProperty) {
  return property.show_on_website !== false && property.website_visible !== false;
}

async function filterAutoDiscoveredPropertiesForBrand(
  supabase: SupabaseInventoryClient,
  brand: string,
  properties: RawProperty[],
) {
  const propertyIds = properties
    .map((property) => property.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (propertyIds.length === 0) return [];

  const { data, error } = await supabase
    .from("property_brand_visibility")
    .select("property_id, visible")
    .in("property_id", propertyIds)
    .eq("brand_id", brand);

  if (error) {
    if (isMissingOptionalVisibilityTableError(error)) {
      logOptionalPropertyReferenceColumnUnavailable("property_brand_visibility", error);
      return properties.filter((property) => propertyMatchesBrand(property, brand));
    }
    throw new LeadIntelligenceError(
      "PROPERTY_MATCHING_UNAVAILABLE",
      "Property matching brand visibility lookup failed",
      503,
    );
  }

  const visibilityById = new Map(
    ((data || []) as Array<{ property_id: string; visible: boolean }>).map((row) => [
      row.property_id,
      row.visible === true,
    ]),
  );

  return properties.filter((property) => {
    const propertyId = typeof property.id === "string" ? property.id : "";
    if (propertyId && visibilityById.has(propertyId)) return visibilityById.get(propertyId);
    return propertyMatchesBrand(property, brand);
  });
}

function buildLeadMatchProfile(
  profile: PersistedProfile,
  criteria: PersistedCriterion[],
  approvedAnalysis: ExtractedLead | null = null,
): LeadMatchProfile {
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
    locations: deriveLocations(profile, criteria, approvedAnalysis),
    hardRequirements: criteria
      .filter((criterion) => criterion.criterionType === "hard_requirement")
      .filter((criterion) => !isDuplicateBudgetHardRequirement(profile, criterion))
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

function parseApprovedAnalysis(resultJson: unknown): ExtractedLead | null {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) return null;
  const record = resultJson as Record<string, unknown>;
  const candidate = record.analysis && typeof record.analysis === "object" && !Array.isArray(record.analysis)
    ? record.analysis
    : resultJson;
  const parsed = ExtractedLeadSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function criterionToRequirement(criterion: PersistedCriterion): ExtractedLead["hardRequirements"][number] {
  const operator =
    ["bedrooms", "bathrooms"].includes(criterion.key) &&
    criterion.operator === "eq" &&
    criterionNumericValue(criterion.value) !== null
      ? "gte"
      : criterion.operator;

  return {
    key: criterion.key,
    otherKey: criterion.otherKey || undefined,
    operator,
    value: criterion.value,
    sourceText: criterion.sourceText || "Approved buyer profile criterion",
    ...(criterion.confidence === null ? {} : { confidence: criterion.confidence }),
    ...(criterion.appliesToPropertyTypes.length > 0
      ? { appliesToPropertyTypes: criterion.appliesToPropertyTypes }
      : {}),
  } as ExtractedLead["hardRequirements"][number];
}

function isDuplicateBudgetHardRequirement(profile: PersistedProfile, criterion: PersistedCriterion) {
  if (!["purchase_price", "estimated_total_cost", "total_budget"].includes(criterion.key)) return false;
  if (criterion.operator !== "eq") return false;

  const budgetAmount = profile.budgetAmount;
  const criterionAmount = criterionNumericValue(criterion.value);
  if (budgetAmount === null || criterionAmount === null) return false;

  const tolerance = Math.max(1, budgetAmount * 0.005);
  return Math.abs(budgetAmount - criterionAmount) <= tolerance;
}

function criterionNumericValue(value: unknown): number | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return (
      toNumberOrNull(record.amount) ??
      toNumberOrNull(record.value) ??
      toNumberOrNull(record.max) ??
      toNumberOrNull(record.min)
    );
  }
  return toNumberOrNull(value);
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

function deriveLocations(
  profile: PersistedProfile,
  criteria: PersistedCriterion[],
  approvedAnalysis: ExtractedLead | null,
): ExtractedLead["locations"] {
  const preferred = new Set(approvedAnalysis?.locations.preferred ?? []);
  const excluded = new Set(approvedAnalysis?.locations.excluded ?? []);

  for (const criterion of criteria) {
    if (criterion.key !== "location") continue;
    const target = criterion.criterionType === "exclusion" || criterion.operator === "not_in"
      ? excluded
      : preferred;
    for (const value of locationValuesFromCriterion(criterion.value)) {
      target.add(value);
    }
  }

  return {
    preferred: cleanLocationValues(Array.from(preferred)),
    excluded: cleanLocationValues(Array.from(excluded)),
    flexible: profile.locationFlexible,
  };
}

function locationValuesFromCriterion(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(locationValuesFromCriterion);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      ...locationValuesFromCriterion(record.value),
      ...locationValuesFromCriterion(record.area),
      ...locationValuesFromCriterion(record.location),
    ];
  }
  return [];
}

function cleanLocationValues(values: string[]) {
  return Array.from(
    new Set(values.map((value) => normalizeKnownLocationAlias(cleanDisplayText(value))).filter((value): value is string => Boolean(value))),
  ).slice(0, LEAD_INTELLIGENCE_LIMITS.locations);
}

function normalizeKnownLocationAlias(value: string | null) {
  if (!value) return null;
  const folded = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (folded === "moreira") return "Moraira";
  if (folded === "moraira") return "Moraira";
  return value;
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePropertyReference(reference: string) {
  return reference.trim().toLowerCase();
}

function propertyReferenceKeys(property: RawProperty) {
  return [property.id, property.ref, property.external_id, property.reference]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizePropertyReference(value));
}

function summarizePropertyForPreview(
  property: RawProperty,
  propertyId: string,
): PropertyMatchPreviewPropertySummary {
  return {
    id: propertyId,
    reference: cleanDisplayText(firstPropertyText(property, ["ref", "reference", "external_id", "source_property_id"])),
    title: cleanDisplayText(firstPropertyText(property, ["title", "title_no", "title_en", "title_es", "name", "project_name"])),
    location: cleanDisplayText(firstPropertyText(property, ["location", "town", "municipality", "area"])),
    propertyType: cleanDisplayText(firstPropertyText(property, ["property_type", "type", "propertyType"])),
    price: propertyNumber(firstPropertyValue(property, ["price", "price_numeric", "purchase_price"])),
    bedrooms: propertyNumber(firstPropertyValue(property, ["bedrooms", "beds"])),
    bathrooms: propertyNumber(firstPropertyValue(property, ["bathrooms", "baths"])),
    primaryImageUrl: safeUrl(firstImageUrl(firstPropertyValue(property, [
      "primary_image",
      "primaryImage",
      "image",
      "image_url",
      "thumbnail_url",
      "images",
      "gallery",
    ]))),
    publicUrl: safeUrl(firstPropertyText(property, ["url", "listing_url", "public_url", "website_url", "external_url"])),
  };
}

function fallbackPropertySummary(propertyId: string): PropertyMatchPreviewPropertySummary {
  return {
    id: propertyId,
    reference: null,
    title: null,
    location: null,
    propertyType: null,
    price: null,
    bedrooms: null,
    bathrooms: null,
    primaryImageUrl: null,
    publicUrl: null,
  };
}

function firstPropertyValue(property: RawProperty, keys: string[]) {
  for (const key of keys) {
    const value = property[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function firstPropertyText(property: RawProperty, keys: string[]) {
  const value = firstPropertyValue(property, keys);
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : null;
}

function cleanDisplayText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > 0 ? text.slice(0, LEAD_INTELLIGENCE_LIMITS.mediumText) : null;
}

function propertyNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstImageUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImageUrl(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, SafePropertyValue | SafePropertyValue[]>;
    return firstImageUrl(record.url ?? record.src ?? record.publicUrl ?? record.thumbnailUrl ?? null);
  }
  return null;
}

function safeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isMissingPropertyReferenceColumnError(error: SupabasePropertyLookupError) {
  const code = error.code || "";
  return code === "42703" || code === "PGRST204";
}

function isMissingOptionalVisibilityTableError(error: SupabasePropertyLookupError) {
  const code = error.code || "";
  return code === "42P01" || code === "PGRST205";
}

function logOptionalPropertyReferenceColumnUnavailable(column: string, error: SupabasePropertyLookupError) {
  const code = error.code && /^[0-9A-Z]+$/.test(error.code) ? error.code : "unknown";
  console.warn("lead_intelligence_property_lookup_optional_column_unavailable", {
    column,
    code,
  });
}
