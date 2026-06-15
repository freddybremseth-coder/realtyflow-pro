export type ReviewableCriterion =
  | {
      key?: unknown;
      otherKey?: unknown;
      operator?: unknown;
      value?: unknown;
      appliesToPropertyTypes?: unknown;
      sourceText?: unknown;
    }
  | {
      key?: unknown;
      question?: unknown;
    };

export function stableReviewJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableReviewJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableReviewJson(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function criterionReviewFingerprint(input: {
  criterionType: string;
  index: number;
  item: ReviewableCriterion;
}) {
  const item = input.item as Record<string, unknown>;
  return stableReviewJson({
    criterionType: input.criterionType,
    index: input.index,
    key: item.key,
    otherKey: item.otherKey || null,
    operator: item.operator || "unknown",
    value: "value" in item ? item.value : null,
    appliesToPropertyTypes: item.appliesToPropertyTypes || [],
    sourceText: item.sourceText || item.question || null,
  });
}
