import {
  type ExtractedLead,
  type NormalizedPropertyForMatching,
  NormalizedPropertyForMatchingSchema,
  type PropertyMatch,
  PropertyMatchSchema,
  normalizePropertyType,
} from "./contracts";

type RawProperty = Record<string, unknown>;
type FactStatus = NormalizedPropertyForMatching["facts"][string]["verificationStatus"];
type FactValue = NormalizedPropertyForMatching["facts"][string]["value"];
type MatchCriterionResult = PropertyMatch["hardRequirementResults"][number];
type BudgetInput = ExtractedLead["budget"];
type RequirementInput = ExtractedLead["hardRequirements"][number];
type PreferenceInput = ExtractedLead["preferences"][number];
type ExclusionInput = ExtractedLead["exclusions"][number];
type LocationMatchResult = {
  result: MatchCriterionResult | null;
  rejected: boolean;
  penalty: number;
  bonus: number;
};

export interface CostProfile {
  resaleTaxRate: number;
  newBuildTaxRate: number;
  professionalFeesRate: number;
  safetyMarginRate: number;
}

export const DEFAULT_COST_PROFILE: CostProfile = {
  resaleTaxRate: 0.1,
  newBuildTaxRate: 0.1,
  professionalFeesRate: 0.03,
  safetyMarginRate: 0.02,
};

export interface LeadMatchProfile {
  buyerProfileId: string;
  budget: BudgetInput;
  propertyTypes: ExtractedLead["propertyTypes"];
  locations: ExtractedLead["locations"];
  hardRequirements: ExtractedLead["hardRequirements"];
  preferences: ExtractedLead["preferences"];
  exclusions: ExtractedLead["exclusions"];
}

export interface NormalizePropertyOptions {
  source?: string;
  verifiedAt?: string | null;
}

export interface MatchOptions {
  costProfile?: CostProfile;
}

export interface BudgetCalculationResult {
  purchasePrice: number | null;
  estimatedTotalCost: number | null;
  currency: string;
  includesCosts: boolean | null;
  approximate: boolean;
  assumption: "provided_total_cost" | "estimated_from_purchase_price" | "missing_price" | "no_budget";
  taxRate: number | null;
  professionalFeesRate: number | null;
  safetyMarginRate: number | null;
}

function firstValue(record: RawProperty, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return { key, value: record[key] };
    }
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    if (!/\d/.test(value)) return null;
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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "ja", "si", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "nei", "0"].includes(normalized)) return false;
  }
  return null;
}

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function addFact(
  facts: NormalizedPropertyForMatching["facts"],
  key: keyof NormalizedPropertyForMatching["facts"] | string,
  value: unknown,
  sourceField: string | null,
  source: string,
  verificationStatus: FactStatus = "unverified",
  verifiedAt: string | null = null,
) {
  const finalStatus = value === null || value === undefined ? "unknown" : verificationStatus;
  facts[key] = {
    value: (value ?? null) as FactValue,
    verificationStatus: finalStatus,
    sourceField,
    source,
    verifiedAt: finalStatus === "verified" ? verifiedAt : null,
  };
}

function collectSearchText(record: RawProperty): string {
  return [
    "title",
    "title_no",
    "title_en",
    "description",
    "description_no",
    "description_en",
    "features",
    "location",
    "town",
    "municipality",
    "status",
  ]
    .map((key) => record[key])
    .map((value) => (Array.isArray(value) ? value.join(" ") : String(value ?? "")))
    .join(" ");
}

function inferViewQuality(record: RawProperty): string | null {
  const explicit = firstValue(record, ["view_quality", "views", "view", "vista"]);
  if (explicit) return asText(explicit.value);

  const text = fold(collectSearchText(record));
  if (/\b(sea view|sea views|panoramic|panoramica|panoramic view|god utsikt|utsikt)\b/.test(text)) {
    return "good";
  }
  return null;
}

function inferFutureBuildingRisk(record: RawProperty): boolean | string | null {
  const explicit = firstValue(record, [
    "future_building_risk",
    "view_obstruction_risk",
    "adjacent_plot_status",
  ]);
  if (explicit) return explicit.value as boolean | string;

  const text = fold(collectSearchText(record));
  if (text.includes("undeveloped adjacent plot") || text.includes("municipal plot")) {
    return true;
  }
  return null;
}

function inferNewBuildOrResale(record: RawProperty): string | null {
  const explicit = firstValue(record, ["new_build_or_resale", "build_type", "sale_type"]);
  if (explicit) return asText(explicit.value);

  const isNewBuild = asBoolean(firstValue(record, ["is_new_build", "new_build"])?.value);
  if (isNewBuild === true) return "new_build";
  if (isNewBuild === false) return "resale";

  const text = fold(collectSearchText(record));
  if (text.includes("new build") || text.includes("obra nueva") || text.includes("nybygg")) {
    return "new_build";
  }
  return null;
}

function propertySource(record: RawProperty, options: NormalizePropertyOptions) {
  return options.source || asText(record.source) || "properties";
}

function factStatusFromOptions(options: NormalizePropertyOptions): FactStatus {
  return options.verifiedAt ? "verified" : "unverified";
}

export function normalizePropertyForLeadMatching(
  property: RawProperty,
  options: NormalizePropertyOptions = {},
): NormalizedPropertyForMatching {
  const source = propertySource(property, options);
  const verifiedAt = options.verifiedAt || null;
  const defaultStatus = factStatusFromOptions(options);
  const facts: NormalizedPropertyForMatching["facts"] = {};

  const propertyId = asText(firstValue(property, ["id", "property_id", "ref", "source_property_id"])?.value);
  if (!propertyId) {
    throw new Error("Property id is required for Lead Intelligence matching");
  }

  const typeField = firstValue(property, ["property_type", "type", "propertyType"]);
  const normalizedType = normalizePropertyType(typeField?.value);
  addFact(facts, "property_type", normalizedType, typeField?.key || null, source, defaultStatus, verifiedAt);

  const priceField = firstValue(property, ["price", "price_numeric", "purchase_price"]);
  addFact(facts, "purchase_price", asNumber(priceField?.value), priceField?.key || null, source, defaultStatus, verifiedAt);

  const totalCostField = firstValue(property, ["estimated_total_cost", "total_cost", "price_including_costs"]);
  addFact(
    facts,
    "estimated_total_cost",
    asNumber(totalCostField?.value),
    totalCostField?.key || null,
    source,
    defaultStatus,
    verifiedAt,
  );

  const bedroomsField = firstValue(property, ["bedrooms", "beds"]);
  addFact(facts, "bedrooms", asNumber(bedroomsField?.value), bedroomsField?.key || null, source, defaultStatus, verifiedAt);

  const bathroomsField = firstValue(property, ["bathrooms", "baths"]);
  addFact(facts, "bathrooms", asNumber(bathroomsField?.value), bathroomsField?.key || null, source, defaultStatus, verifiedAt);

  const locationField = firstValue(property, ["location", "town", "municipality", "area"]);
  addFact(facts, "location", asText(locationField?.value), locationField?.key || null, source, defaultStatus, verifiedAt);

  const terraceField = firstValue(property, ["terrace_area_m2", "terrace_size", "terrace_m2"]);
  addFact(
    facts,
    "terrace_area_m2",
    asNumber(terraceField?.value),
    terraceField?.key || null,
    source,
    defaultStatus,
    verifiedAt,
  );

  const liftField = firstValue(property, ["has_lift", "lift", "elevator"]);
  addFact(facts, "has_lift", asBoolean(liftField?.value), liftField?.key || null, source, defaultStatus, verifiedAt);

  const parkingField = firstValue(property, ["parking", "has_parking", "garage"]);
  addFact(facts, "parking", asBoolean(parkingField?.value) ?? asText(parkingField?.value), parkingField?.key || null, source, defaultStatus, verifiedAt);

  const poolField = firstValue(property, ["pool", "has_pool", "community_pool"]);
  addFact(facts, "pool", asBoolean(poolField?.value), poolField?.key || null, source, defaultStatus, verifiedAt);

  const builtAreaField = firstValue(property, ["living_area_m2", "built_area", "size_m2"]);
  addFact(
    facts,
    "living_area_m2",
    asNumber(builtAreaField?.value),
    builtAreaField?.key || null,
    source,
    defaultStatus,
    verifiedAt,
  );

  const plotField = firstValue(property, ["plot_area_m2", "plot_size", "plot_m2"]);
  addFact(facts, "plot_area_m2", asNumber(plotField?.value), plotField?.key || null, source, defaultStatus, verifiedAt);

  const floorField = firstValue(property, ["floor_position", "floor", "is_top_floor"]);
  const floorValue =
    typeof floorField?.value === "boolean"
      ? floorField.value
        ? "top_floor"
        : "not_top_floor"
      : asText(floorField?.value);
  addFact(facts, "floor_position", floorValue, floorField?.key || null, source, defaultStatus, verifiedAt);

  const newBuild = inferNewBuildOrResale(property);
  addFact(facts, "new_build_or_resale", newBuild, newBuild ? "inferred" : null, source, newBuild ? "inferred" : "unknown");

  const viewQuality = inferViewQuality(property);
  addFact(facts, "view_quality", viewQuality, viewQuality ? "inferred" : null, source, viewQuality ? "inferred" : "unknown");

  const buildingRisk = inferFutureBuildingRisk(property);
  addFact(
    facts,
    "future_building_risk",
    buildingRisk,
    buildingRisk === null ? null : "inferred",
    source,
    buildingRisk === null ? "unknown" : "inferred",
  );

  const qualityFacts = Object.values(facts).filter((fact) => fact.verificationStatus !== "unknown");
  const verifiedFacts = Object.values(facts).filter((fact) => fact.verificationStatus === "verified");
  const dataQualityScore = Math.min(
    100,
    Math.round((qualityFacts.length / Math.max(Object.keys(facts).length, 1)) * 75 + verifiedFacts.length * 3),
  );

  return NormalizedPropertyForMatchingSchema.parse({
    propertyId,
    brandId: asText(firstValue(property, ["brand_id", "brand"])?.value),
    facts,
    dataQualityScore,
    updatedAt: asText(firstValue(property, ["updated_at", "date_updated", "scraped_at"])?.value),
  });
}

export function leadMatchProfileFromExtractedLead(
  buyerProfileId: string,
  lead: ExtractedLead,
): LeadMatchProfile {
  return {
    buyerProfileId,
    budget: lead.budget,
    propertyTypes: lead.propertyTypes,
    locations: lead.locations,
    hardRequirements: lead.hardRequirements,
    preferences: lead.preferences,
    exclusions: lead.exclusions,
  };
}

function isNewBuild(property: NormalizedPropertyForMatching) {
  const value = String(property.facts.new_build_or_resale?.value ?? "").toLowerCase();
  return value.includes("new");
}

export function calculatePropertyBudget(
  profileBudget: BudgetInput,
  property: NormalizedPropertyForMatching,
  costProfile: CostProfile = DEFAULT_COST_PROFILE,
): BudgetCalculationResult {
  const purchasePrice = asNumber(property.facts.purchase_price?.value);
  const providedTotalCost = asNumber(property.facts.estimated_total_cost?.value);
  const currency = profileBudget.currency || "EUR";

  if (!profileBudget.amount) {
    return {
      purchasePrice,
      estimatedTotalCost: providedTotalCost ?? purchasePrice,
      currency,
      includesCosts: profileBudget.includesCosts,
      approximate: profileBudget.approximate,
      assumption: "no_budget",
      taxRate: null,
      professionalFeesRate: null,
      safetyMarginRate: null,
    };
  }

  if (providedTotalCost !== null) {
    return {
      purchasePrice,
      estimatedTotalCost: providedTotalCost,
      currency,
      includesCosts: profileBudget.includesCosts,
      approximate: profileBudget.approximate,
      assumption: "provided_total_cost",
      taxRate: null,
      professionalFeesRate: null,
      safetyMarginRate: null,
    };
  }

  if (purchasePrice === null) {
    return {
      purchasePrice,
      estimatedTotalCost: null,
      currency,
      includesCosts: profileBudget.includesCosts,
      approximate: profileBudget.approximate,
      assumption: "missing_price",
      taxRate: null,
      professionalFeesRate: null,
      safetyMarginRate: null,
    };
  }

  const taxRate = isNewBuild(property) ? costProfile.newBuildTaxRate : costProfile.resaleTaxRate;
  const totalRate = profileBudget.includesCosts
    ? taxRate + costProfile.professionalFeesRate + costProfile.safetyMarginRate
    : 0;

  return {
    purchasePrice,
    estimatedTotalCost: Math.round(purchasePrice * (1 + totalRate)),
    currency,
    includesCosts: profileBudget.includesCosts,
    approximate: profileBudget.approximate,
    assumption: profileBudget.includesCosts ? "estimated_from_purchase_price" : "provided_total_cost",
    taxRate: profileBudget.includesCosts ? taxRate : null,
    professionalFeesRate: profileBudget.includesCosts ? costProfile.professionalFeesRate : null,
    safetyMarginRate: profileBudget.includesCosts ? costProfile.safetyMarginRate : null,
  };
}

function isCriterionApplicable(
  criterion: RequirementInput | PreferenceInput | ExclusionInput,
  property: NormalizedPropertyForMatching,
) {
  if (!criterion.appliesToPropertyTypes || criterion.appliesToPropertyTypes.length === 0) return true;
  const propertyType = property.facts.property_type?.value;
  if (typeof propertyType !== "string") return false;
  return criterion.appliesToPropertyTypes.includes(propertyType as never);
}

function criterionExpectedValue(criterion: RequirementInput | PreferenceInput | ExclusionInput): FactValue {
  if (
    criterion.operator === "gte" &&
    criterion.value &&
    typeof criterion.value === "object" &&
    !Array.isArray(criterion.value) &&
    "min" in criterion.value
  ) {
    return ((criterion.value as { min?: FactValue }).min ?? null) as FactValue;
  }
  return criterion.value as FactValue;
}

function compareCriterion(
  actual: unknown,
  operator: RequirementInput["operator"],
  expected: unknown,
): "pass" | "fail" | "unknown" {
  if (operator === "unknown") return "unknown";
  if (operator === "exists") {
    return actual === null || actual === undefined || actual === "" ? "unknown" : "pass";
  }
  if (actual === null || actual === undefined || actual === "") return "unknown";

  const actualNumber = asNumber(actual);
  const expectedNumber = asNumber(expected);

  if (["gt", "gte", "lt", "lte"].includes(operator)) {
    if (actualNumber === null || expectedNumber === null) return "unknown";
    if (operator === "gt") return actualNumber > expectedNumber ? "pass" : "fail";
    if (operator === "gte") return actualNumber >= expectedNumber ? "pass" : "fail";
    if (operator === "lt") return actualNumber < expectedNumber ? "pass" : "fail";
    return actualNumber <= expectedNumber ? "pass" : "fail";
  }

  if (operator === "in" || operator === "not_in") {
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    const found = expectedValues.some((value) => valuesEqual(actual, value));
    return operator === "in" ? (found ? "pass" : "fail") : found ? "fail" : "pass";
  }

  if (operator === "contains") {
    const actualText = fold(actual);
    const expectedText = fold(expected);
    if (!actualText || !expectedText) return "unknown";
    return actualText.includes(expectedText) ? "pass" : "fail";
  }

  const equal = valuesEqual(actual, expected);
  if (operator === "neq") return equal ? "fail" : "pass";
  return equal ? "pass" : "fail";
}

function valuesEqual(left: unknown, right: unknown) {
  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber === rightNumber;
  if (typeof left === "boolean" || typeof right === "boolean") return asBoolean(left) === asBoolean(right);
  return fold(left) === fold(right);
}

function resultForCriterion(
  criterion: RequirementInput | PreferenceInput | ExclusionInput,
  property: NormalizedPropertyForMatching,
  mode: "hard_requirement" | "preference" | "exclusion",
): MatchCriterionResult {
  if (!isCriterionApplicable(criterion, property)) {
    return {
      key: criterion.key,
      otherKey: criterion.otherKey ?? null,
      outcome: "not_applicable",
      expected: criterionExpectedValue(criterion),
      actual: null,
      sourceField: null,
      reason: "Criterion does not apply to this property type.",
    };
  }

  const fact = property.facts[criterion.key];
  const expected = criterionExpectedValue(criterion);
  const comparison = compareCriterion(fact?.value, criterion.operator, expected);
  const outcome =
    mode === "exclusion"
      ? comparison === "pass"
        ? "fail"
        : comparison === "fail"
          ? "pass"
          : comparison
      : comparison;

  return {
    key: criterion.key,
    otherKey: criterion.otherKey ?? null,
    outcome,
    expected,
    actual: fact?.value ?? null,
    sourceField: fact?.sourceField ?? null,
    reason: buildCriterionReason(mode, criterion.key, outcome, fact?.verificationStatus ?? "unknown"),
  };
}

function buildCriterionReason(
  mode: "hard_requirement" | "preference" | "exclusion",
  key: string,
  outcome: MatchCriterionResult["outcome"],
  verificationStatus: FactStatus,
) {
  if (outcome === "not_applicable") return "Criterion is not applicable.";
  if (outcome === "unknown") return `${key} is unknown and must be verified.`;
  if (mode === "exclusion" && outcome === "fail") return `${key} triggers an exclusion.`;
  if (outcome === "pass") return `${key} matches (${verificationStatus}).`;
  if (outcome === "penalty") return `${key} adds a match penalty.`;
  return `${key} does not match.`;
}

function budgetMatchResult(
  profile: LeadMatchProfile,
  property: NormalizedPropertyForMatching,
  options: MatchOptions,
): { result: MatchCriterionResult | null; rejected: boolean; penalty: number } {
  const budget = calculatePropertyBudget(profile.budget, property, options.costProfile);
  if (!profile.budget.amount) return { result: null, rejected: false, penalty: 0 };

  if (budget.estimatedTotalCost === null) {
    return {
      result: {
        key: profile.budget.includesCosts ? "estimated_total_cost" : "purchase_price",
        outcome: "unknown",
        expected: profile.budget.amount,
        actual: null,
        sourceField: null,
        reason: "Property price or total cost is missing and cannot be treated as within budget.",
      },
      rejected: false,
      penalty: 12,
    };
  }

  const overRatio = budget.estimatedTotalCost / profile.budget.amount;
  const isOver = overRatio > 1;
  const hardLimit = profile.budget.hardLimit === true;
  const clearlyOver = overRatio > 1.05;
  const outcome: MatchCriterionResult["outcome"] = isOver ? "fail" : "pass";

  return {
    result: {
      key: profile.budget.includesCosts ? "estimated_total_cost" : "purchase_price",
      outcome,
      expected: profile.budget.amount,
      actual: budget.estimatedTotalCost,
      sourceField: property.facts.estimated_total_cost?.sourceField || property.facts.purchase_price?.sourceField || null,
      reason: isOver
        ? `Estimated total cost ${budget.estimatedTotalCost} ${budget.currency} is above the buyer budget ${profile.budget.amount} ${budget.currency}.`
        : `Estimated total cost ${budget.estimatedTotalCost} ${budget.currency} is within the buyer budget.`,
    },
    rejected: isOver && (hardLimit || clearlyOver),
    penalty: isOver ? (hardLimit || clearlyOver ? 35 : 18) : 0,
  };
}

function cleanLocationValues(values: string[]) {
  return uniqueLimited(
    values
      .map((value) => value.trim())
      .map(normalizeKnownLocationAlias)
      .filter((value) => value.length > 0),
    20,
  );
}

function normalizeKnownLocationAlias(value: string) {
  const folded = fold(value);
  if (folded === "moreira") return "Moraira";
  if (folded === "moraira") return "Moraira";
  return value;
}

function locationTextMatches(actual: string, expected: string) {
  const actualFolded = fold(actual);
  const expectedFolded = fold(normalizeKnownLocationAlias(expected));
  return (
    actualFolded === expectedFolded ||
    actualFolded.includes(expectedFolded) ||
    expectedFolded.includes(actualFolded)
  );
}

function locationMatchResult(
  profile: LeadMatchProfile,
  property: NormalizedPropertyForMatching,
): LocationMatchResult {
  const preferred = cleanLocationValues(profile.locations.preferred);
  const excluded = cleanLocationValues(profile.locations.excluded);
  if (preferred.length === 0 && excluded.length === 0) {
    return { result: null, rejected: false, penalty: 0, bonus: 0 };
  }

  const fact = property.facts.location;
  const actual = typeof fact?.value === "string" ? fact.value.trim() : "";
  const sourceField = fact?.sourceField ?? null;
  const verificationStatus = fact?.verificationStatus ?? "unknown";

  if (!actual) {
    return {
      result: {
        key: "location",
        outcome: "unknown",
        expected: { preferred, excluded },
        actual: null,
        sourceField,
        reason: "Property location is unknown and must be verified against the buyer area preference.",
      },
      rejected: false,
      penalty: preferred.length > 0 && profile.locations.flexible === false ? 12 : 6,
      bonus: 0,
    };
  }

  const excludedMatch = excluded.find((location) => locationTextMatches(actual, location));
  if (excludedMatch) {
    return {
      result: {
        key: "location",
        outcome: "fail",
        expected: excluded,
        actual,
        sourceField,
        reason: `Property location ${actual} is in an excluded area (${excludedMatch}).`,
      },
      rejected: true,
      penalty: 35,
      bonus: 0,
    };
  }

  if (preferred.length === 0) {
    return { result: null, rejected: false, penalty: 0, bonus: 0 };
  }

  const preferredMatch = preferred.find((location) => locationTextMatches(actual, location));
  if (preferredMatch) {
    return {
      result: {
        key: "location",
        outcome: "pass",
        expected: preferred,
        actual,
        sourceField,
        reason: `Property location ${actual} matches preferred area ${preferredMatch} (${verificationStatus}).`,
      },
      rejected: false,
      penalty: 0,
      bonus: profile.locations.flexible ? 8 : 14,
    };
  }

  const hardAreaPreference = profile.locations.flexible === false;
  return {
    result: {
      key: "location",
      outcome: "fail",
      expected: preferred,
      actual,
      sourceField,
      reason: hardAreaPreference
        ? `Property location ${actual} does not match the required preferred area.`
        : `Property location ${actual} is outside the preferred area.`,
    },
    rejected: hardAreaPreference,
    penalty: hardAreaPreference ? 28 : 10,
    bonus: 0,
  };
}

function factLabels(
  property: NormalizedPropertyForMatching,
  status: "verified" | "unverified" | "inferred" | "unknown",
) {
  return Object.entries(property.facts)
    .filter(([, fact]) => fact.verificationStatus === status)
    .map(([key]) => key)
    .slice(0, 32);
}

function uniqueLimited(values: string[], limit = 32) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

export function matchPropertyToLeadProfile(
  profile: LeadMatchProfile,
  property: NormalizedPropertyForMatching,
  options: MatchOptions = {},
): PropertyMatch {
  const hardRequirementResults = profile.hardRequirements.map((criterion) =>
    resultForCriterion(criterion, property, "hard_requirement"),
  );
  const preferenceResults = profile.preferences.map((criterion) =>
    resultForCriterion(criterion, property, "preference"),
  );
  const exclusionResults = profile.exclusions.map((criterion) => {
    const result = resultForCriterion(criterion, property, "exclusion");
    if (result.outcome === "fail" && criterion.severity !== "reject") {
      return { ...result, outcome: "penalty" as const };
    }
    return result;
  });
  const budget = budgetMatchResult(profile, property, options);
  const location = locationMatchResult(profile, property);

  const hardFailures = hardRequirementResults.filter((result) => result.outcome === "fail");
  const hardUnknowns = hardRequirementResults.filter((result) => result.outcome === "unknown");
  const rejectingExclusions = exclusionResults.filter((result, index) =>
    result.outcome === "fail" && profile.exclusions[index]?.severity === "reject",
  );
  const exclusionPenalties = exclusionResults.filter((result) => result.outcome === "penalty");

  const totalPreferenceWeight = profile.preferences.reduce((sum, preference) => sum + preference.weight, 0);
  const matchedPreferenceWeight = preferenceResults.reduce((sum, result, index) => {
    return result.outcome === "pass" ? sum + profile.preferences[index].weight : sum;
  }, 0);
  const preferenceScore = totalPreferenceWeight > 0
    ? (matchedPreferenceWeight / totalPreferenceWeight) * 35
    : 0;

  const penaltyScore =
    budget.penalty +
    location.penalty +
    exclusionPenalties.length * 14 +
    hardUnknowns.length * 8 +
    preferenceResults.filter((result) => result.outcome === "unknown").length * 4;

  const baseScore = 45 + preferenceScore + property.dataQualityScore * 0.2 + location.bonus;
  let score = Math.round(Math.max(0, Math.min(100, baseScore - penaltyScore)));

  const rejected = hardFailures.length > 0 || rejectingExclusions.length > 0 || budget.rejected || location.rejected;
  const conditional =
    !rejected &&
    (hardUnknowns.length > 0 ||
      preferenceResults.some((result) => result.outcome === "unknown") ||
      exclusionResults.some((result) => result.outcome === "unknown") ||
      budget.result?.outcome === "unknown" ||
      budget.result?.outcome === "fail" ||
      location.result?.outcome === "unknown" ||
      location.result?.outcome === "fail");

  if (rejected) score = Math.min(score, 25);
  if (conditional) score = Math.min(score, 75);

  const reasonsForMatch = uniqueLimited([
    ...hardRequirementResults.filter((result) => result.outcome === "pass").map((result) => result.reason),
    ...preferenceResults.filter((result) => result.outcome === "pass").map((result) => result.reason),
    ...(location.result?.outcome === "pass" ? [location.result.reason] : []),
    ...(budget.result?.outcome === "pass" ? [budget.result.reason] : []),
  ]);

  const concerns = uniqueLimited([
    ...hardRequirementResults.filter((result) => result.outcome === "fail").map((result) => result.reason),
    ...exclusionResults.filter((result) => result.outcome === "fail" || result.outcome === "penalty").map((result) => result.reason),
    ...(location.result && location.result.outcome === "fail" ? [location.result.reason] : []),
    ...(budget.result && budget.result.outcome !== "pass" ? [budget.result.reason] : []),
  ]);

  const questionsToVerify = uniqueLimited([
    ...hardRequirementResults.filter((result) => result.outcome === "unknown").map((result) => result.reason),
    ...preferenceResults.filter((result) => result.outcome === "unknown").map((result) => result.reason),
    ...exclusionResults.filter((result) => result.outcome === "unknown").map((result) => result.reason),
    ...(location.result?.outcome === "unknown" ? [location.result.reason] : []),
  ]);

  return PropertyMatchSchema.parse({
    propertyId: property.propertyId,
    buyerProfileId: profile.buyerProfileId,
    score,
    eligibility: rejected ? "rejected" : conditional ? "conditional" : "eligible",
    hardRequirementResults,
    preferenceResults,
    exclusionResults,
    budgetResult: budget.result,
    dataQualityScore: property.dataQualityScore,
    verifiedFacts: factLabels(property, "verified"),
    unverifiedFacts: uniqueLimited([...factLabels(property, "unverified"), ...factLabels(property, "inferred")]),
    reasonsForMatch,
    concerns,
    questionsToVerify,
  });
}

export function rankPropertyMatches(matches: PropertyMatch[]) {
  return [...matches].sort((left, right) => {
    const eligibilityOrder = { eligible: 0, conditional: 1, rejected: 2 };
    const eligibilityDelta = eligibilityOrder[left.eligibility] - eligibilityOrder[right.eligibility];
    if (eligibilityDelta !== 0) return eligibilityDelta;
    if (right.score !== left.score) return right.score - left.score;
    return left.propertyId.localeCompare(right.propertyId);
  });
}
