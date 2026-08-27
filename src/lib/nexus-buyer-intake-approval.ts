export interface BuyerIntakeLifestyleCandidate {
  key: string;
  value?: boolean | string | null;
  strength?: "strong_preference" | "nice_to_have" | string | null;
  confidence?: number | null;
  sourceText?: string | null;
  customerConfirmed?: boolean | null;
}

export interface BuyerProfileCriterionRevision {
  criterionType: "hard_requirement" | "preference" | "exclusion" | "missing_information";
  key: string;
  otherKey: string | null;
  operator: string;
  value: unknown;
  weight: number | null;
  severity: string | null;
  appliesToPropertyTypes: string[];
  sourceText: string | null;
  customerConfirmed: boolean;
  active: boolean;
}

export interface ExistingBuyerProfileCriterionRow {
  criterion_type?: string | null;
  key?: string | null;
  other_key?: string | null;
  operator?: string | null;
  value?: unknown;
  weight?: number | null;
  severity?: string | null;
  applies_to_property_types?: string[] | null;
  source_text?: string | null;
  customer_confirmed?: boolean | null;
  active?: boolean | null;
}

function criterionIdentity(criterion: Pick<BuyerProfileCriterionRevision, "key" | "otherKey">) {
  return `${criterion.key}:${criterion.otherKey || ""}`;
}

export function buildBuyerIntakeLifestyleCriteria(
  candidates: BuyerIntakeLifestyleCandidate[],
): BuyerProfileCriterionRevision[] {
  return candidates
    .filter((candidate) => Boolean(candidate?.key) && candidate.customerConfirmed !== false)
    .map((candidate) => ({
      criterionType: "preference" as const,
      key: "other",
      otherKey: String(candidate.key).trim(),
      operator: "eq",
      value: candidate.value ?? true,
      weight: candidate.strength === "nice_to_have" ? 0.6 : 0.85,
      severity: null,
      appliesToPropertyTypes: [],
      sourceText: candidate.sourceText ? String(candidate.sourceText).slice(0, 1000) : null,
      customerConfirmed: true,
      active: true,
    }))
    .filter((criterion) => Boolean(criterion.otherKey));
}

export function normalizeExistingBuyerProfileCriteria(
  rows: ExistingBuyerProfileCriterionRow[],
): BuyerProfileCriterionRevision[] {
  return rows
    .filter((row) => row.active !== false && Boolean(row.key) && Boolean(row.criterion_type))
    .map((row) => ({
      criterionType: row.criterion_type as BuyerProfileCriterionRevision["criterionType"],
      key: String(row.key),
      otherKey: row.other_key ? String(row.other_key) : null,
      operator: String(row.operator || "eq"),
      value: row.value ?? null,
      weight: typeof row.weight === "number" ? row.weight : null,
      severity: row.severity ? String(row.severity) : null,
      appliesToPropertyTypes: Array.isArray(row.applies_to_property_types) ? row.applies_to_property_types.map(String) : [],
      sourceText: row.source_text ? String(row.source_text) : null,
      customerConfirmed: row.customer_confirmed === true,
      active: true,
    }));
}

export function mergeBuyerIntakeCriteria(input: {
  existingCriteria: ExistingBuyerProfileCriterionRow[];
  lifestyleCandidates: BuyerIntakeLifestyleCandidate[];
}) {
  const existing = normalizeExistingBuyerProfileCriteria(input.existingCriteria);
  const suggested = buildBuyerIntakeLifestyleCriteria(input.lifestyleCandidates);
  const merged = new Map<string, BuyerProfileCriterionRevision>();

  for (const criterion of existing) merged.set(criterionIdentity(criterion), criterion);
  for (const criterion of suggested) merged.set(criterionIdentity(criterion), criterion);

  return {
    existingCriteria: existing,
    suggestedLifestyleCriteria: suggested,
    mergedCriteria: [...merged.values()],
    addedOrRefreshed: suggested.length,
  };
}
