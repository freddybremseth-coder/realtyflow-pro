export type BuyerLifestyleStrength = "must_have" | "strong_preference" | "nice_to_have" | "not_important";
export type BuyerLifestyleEvidence = "customer_confirmed" | "advisor_note" | "inferred";

export type BuyerLifestyleNamespace = "lifestyle" | "environment" | "social" | "mobility" | "daily_life" | "residence";

export interface BuyerLifestyleCriterionLike {
  key?: string | null;
  other_key?: string | null;
  criterion_type?: string | null;
  value?: unknown;
  weight?: number | null;
  source?: string | null;
  source_text?: string | null;
  confidence?: number | null;
  customer_confirmed?: boolean | null;
  approval_status?: string | null;
  active?: boolean | null;
}

export interface BuyerLifestylePreference {
  namespace: BuyerLifestyleNamespace;
  dimension: string;
  value: string | boolean | number | null;
  strength: BuyerLifestyleStrength;
  evidence: BuyerLifestyleEvidence;
  confidence: number;
  confirmed: boolean;
  sourceText: string | null;
}

const NAMESPACES = new Set<BuyerLifestyleNamespace>([
  "lifestyle",
  "environment",
  "social",
  "mobility",
  "daily_life",
  "residence",
]);

export const BUYER_LIFESTYLE_DIMENSIONS = [
  "lifestyle:beach",
  "lifestyle:restaurants_cafes",
  "lifestyle:hiking_nature",
  "lifestyle:golf",
  "lifestyle:marina_boating",
  "lifestyle:culture",
  "environment:quiet",
  "environment:lively",
  "environment:local_spanish",
  "environment:international",
  "environment:village_feel",
  "environment:urban",
  "social:scandinavian",
  "social:international_mix",
  "social:local_integration",
  "mobility:walkable",
  "mobility:flat_terrain",
  "mobility:car_ok",
  "mobility:public_transport",
  "daily_life:beach_walkability",
  "daily_life:restaurants_walkability",
  "daily_life:shops_walkability",
  "daily_life:healthcare_nearby",
  "daily_life:airport_access",
  "residence:permanent",
  "residence:part_year",
  "residence:holiday_home",
  "residence:rental_use",
] as const;

function clampConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function strengthFromWeight(weight: unknown): BuyerLifestyleStrength {
  const value = Number(weight);
  if (!Number.isFinite(value)) return "nice_to_have";
  if (value >= 0.9) return "must_have";
  if (value >= 0.7) return "strong_preference";
  if (value <= 0.15) return "not_important";
  return "nice_to_have";
}

function evidenceFor(row: BuyerLifestyleCriterionLike): BuyerLifestyleEvidence {
  if (row.customer_confirmed) return "customer_confirmed";
  if (String(row.source || "").toLowerCase() === "manual") return "advisor_note";
  return "inferred";
}

export function parseBuyerLifestyleCriterion(row: BuyerLifestyleCriterionLike): BuyerLifestylePreference | null {
  if (row.active === false || String(row.approval_status || "approved") === "rejected") return null;
  if (row.key !== "other") return null;
  const otherKey = String(row.other_key || "").trim().toLowerCase();
  const [namespace, ...dimensionParts] = otherKey.split(":");
  if (!NAMESPACES.has(namespace as BuyerLifestyleNamespace) || !dimensionParts.length) return null;
  const dimension = dimensionParts.join(":");
  if (!dimension) return null;

  const rawValue = row.value as unknown;
  let value: BuyerLifestylePreference["value"] = null;
  if (["string", "boolean", "number"].includes(typeof rawValue)) value = rawValue as string | boolean | number;
  else if (rawValue && typeof rawValue === "object" && "value" in (rawValue as Record<string, unknown>)) {
    const nested = (rawValue as Record<string, unknown>).value;
    if (["string", "boolean", "number"].includes(typeof nested)) value = nested as string | boolean | number;
  }

  return {
    namespace: namespace as BuyerLifestyleNamespace,
    dimension,
    value,
    strength: strengthFromWeight(row.weight),
    evidence: evidenceFor(row),
    confidence: clampConfidence(row.confidence),
    confirmed: Boolean(row.customer_confirmed),
    sourceText: row.source_text ? String(row.source_text) : null,
  };
}

export function buildBuyerLifestyleProfile(rows: BuyerLifestyleCriterionLike[]) {
  const preferences = rows
    .map(parseBuyerLifestyleCriterion)
    .filter((item): item is BuyerLifestylePreference => Boolean(item));
  const confirmed = preferences.filter((item) => item.confirmed);
  const inferred = preferences.filter((item) => !item.confirmed);
  const strong = preferences.filter((item) => item.strength === "must_have" || item.strength === "strong_preference");

  return {
    preferences,
    confirmed,
    inferred,
    strong,
    hasVerifiedLifestyleEvidence: confirmed.length > 0,
    summary: strong.slice(0, 5).map((item) => `${item.namespace}:${item.dimension} (${item.strength})`),
  };
}

export function buyerLifestyleDiscoveryGaps(rows: BuyerLifestyleCriterionLike[]) {
  const profile = buildBuyerLifestyleProfile(rows);
  const present = new Set(profile.preferences.map((item) => `${item.namespace}:${item.dimension}`));
  const priorityQuestions = [
    ["environment:quiet", "Hvor viktig er ro kontra mer liv og aktivitet?"],
    ["daily_life:beach_walkability", "Hvor viktig er gåavstand til stranden?"],
    ["daily_life:restaurants_walkability", "Hvor viktig er restauranter og kaféer i gangavstand?"],
    ["social:scandinavian", "Har du en preferanse for skandinavisk miljø, lokalt spansk miljø eller en internasjonal miks?"],
    ["mobility:car_ok", "Vil du kunne klare hverdagen til fots, eller er bilavhengighet helt greit?"],
  ] as const;

  return priorityQuestions
    .filter(([key]) => !present.has(key))
    .map(([key, question]) => ({ key, question }));
}
