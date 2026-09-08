import { buildCustomerProfileCompleteness, type BuyerCriterionInput, type Customer360ContactInput } from "@/lib/customer-360";

export type BuyerProfileEvidenceSource = "property_interest" | "notes" | "interactions";

export type BuyerProfileEvidenceCandidate = {
  key: "property_type" | "bedrooms" | "other";
  otherKey: string | null;
  operator: "eq" | "gte";
  value: string | number;
  confidence: number;
  source: BuyerProfileEvidenceSource;
  sourceText: string;
};

export type BuyerProfileEvidenceConflict = {
  field: "property_type" | "bedrooms" | "purchase_timeline";
  values: Array<string | number>;
  reason: string;
};

export type BuyerProfileEvidenceInput = Customer360ContactInput & {
  notes?: string | null;
  interactions?: unknown[] | null;
};

const PROPERTY_TYPE_RULES: Array<{ value: string; pattern: RegExp }> = [
  { value: "end_townhouse", pattern: /\b(end townhouse|end town house|end terrace|hjørne[- ]?rekkehus)\b/i },
  { value: "townhouse", pattern: /\b(townhouse|town house|rekkehus|adosado)\b/i },
  { value: "apartment", pattern: /\b(apartment|apartamento|leilighet)\b/i },
  { value: "penthouse", pattern: /\b(penthouse|ático|atico)\b/i },
  { value: "villa", pattern: /\bvilla\b/i },
  { value: "duplex", pattern: /\b(duplex|dúplex)\b/i },
  { value: "bungalow", pattern: /\bbungalow\b/i },
  { value: "finca", pattern: /\bfinca\b/i },
  { value: "country_house", pattern: /\b(country house|casa de campo|landsted)\b/i },
  { value: "plot", pattern: /\b(plot|tomt|parcela)\b/i },
  { value: "commercial", pattern: /\b(commercial|local comercial|næringseiendom)\b/i },
];

const TIMELINE_RULES: Array<{ value: string; pattern: RegExp }> = [
  { value: "immediate", pattern: /\b(immediately|umiddelbart|as soon as possible|så snart som mulig|ready now|klar nå)\b/i },
  { value: "this_year", pattern: /\b(this year|i år)\b/i },
  { value: "next_year", pattern: /\b(next year|neste år)\b/i },
  { value: "soon", pattern: /\b(soon|snart)\b/i },
];

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function interactionText(interactions: unknown[] | null | undefined) {
  if (!Array.isArray(interactions)) return "";
  return interactions
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return [row.content, row.body, row.message, row.title, row.note, row.details]
        .map(clean)
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join(" | ");
}

function sources(input: BuyerProfileEvidenceInput) {
  return [
    { source: "property_interest" as const, text: clean(input.property_interest) },
    { source: "notes" as const, text: clean(input.notes) },
    { source: "interactions" as const, text: interactionText(input.interactions) },
  ].filter((row) => row.text);
}

function excerpt(text: string, match: RegExpMatchArray) {
  const index = match.index ?? 0;
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + match[0].length + 75);
  return text.slice(start, end).trim();
}

function detectPropertyType(input: BuyerProfileEvidenceInput) {
  const hits: Array<{ value: string; source: BuyerProfileEvidenceSource; sourceText: string }> = [];
  for (const row of sources(input)) {
    for (const rule of PROPERTY_TYPE_RULES) {
      const match = row.text.match(rule.pattern);
      if (!match) continue;
      hits.push({ value: rule.value, source: row.source, sourceText: excerpt(row.text, match) });
    }
  }
  const unique = [...new Set(hits.map((hit) => hit.value))];
  if (unique.length !== 1) return { hit: null, values: unique };
  return { hit: hits.find((item) => item.value === unique[0]) || null, values: unique };
}

function bedroomMatches(text: string) {
  const matches: Array<{ value: number; sourceText: string; operator: "eq" | "gte" }> = [];
  const range = /\b([1-9])\s*[-–]\s*([1-9])\s*(?:bed|beds|bedroom|bedrooms|soverom)\b/gi;
  if (range.test(text)) return [{ value: -1, sourceText: "range", operator: "eq" as const }];

  const pattern = /\b(min(?:imum)?\.?\s*|minst\s*)?([1-9])\s*(?:bed|beds|bedroom|bedrooms|soverom)\b/gi;
  for (const match of text.matchAll(pattern)) {
    matches.push({
      value: Number(match[2]),
      operator: match[1] ? "gte" : "eq",
      sourceText: excerpt(text, match),
    });
  }
  return matches;
}

function detectBedrooms(input: BuyerProfileEvidenceInput) {
  const hits: Array<{ value: number; operator: "eq" | "gte"; source: BuyerProfileEvidenceSource; sourceText: string }> = [];
  let hasRange = false;
  for (const row of sources(input)) {
    for (const match of bedroomMatches(row.text)) {
      if (match.value < 0) {
        hasRange = true;
        continue;
      }
      hits.push({ ...match, source: row.source });
    }
  }
  const unique = [...new Set(hits.map((hit) => hit.value))];
  if (hasRange || unique.length !== 1) return { hit: null, values: hasRange ? [...unique, "range"] : unique };
  const preferred = hits.find((item) => item.operator === "gte") || hits[0] || null;
  return { hit: preferred, values: unique };
}

function detectTimeline(input: BuyerProfileEvidenceInput) {
  const hits: Array<{ value: string; source: BuyerProfileEvidenceSource; sourceText: string }> = [];
  for (const row of sources(input)) {
    for (const rule of TIMELINE_RULES) {
      const match = row.text.match(rule.pattern);
      if (match) hits.push({ value: rule.value, source: row.source, sourceText: excerpt(row.text, match) });
    }
    for (const match of row.text.matchAll(/\b(?:within|innen)\s+([1-9]|1[0-8])\s*(?:months?|mnd|måneder)\b/gi)) {
      hits.push({ value: `within_${Number(match[1])}_months`, source: row.source, sourceText: excerpt(row.text, match) });
    }
  }
  const unique = [...new Set(hits.map((hit) => hit.value))];
  if (unique.length !== 1) return { hit: null, values: unique };
  return { hit: hits.find((item) => item.value === unique[0]) || null, values: unique };
}

export function buildBuyerProfileEvidencePreview(input: BuyerProfileEvidenceInput) {
  const candidates: BuyerProfileEvidenceCandidate[] = [];
  const conflicts: BuyerProfileEvidenceConflict[] = [];

  const propertyType = detectPropertyType(input);
  if (propertyType.hit) {
    candidates.push({
      key: "property_type",
      otherKey: null,
      operator: "eq",
      value: propertyType.hit.value,
      confidence: 0.98,
      source: propertyType.hit.source,
      sourceText: propertyType.hit.sourceText,
    });
  } else if (propertyType.values.length > 1) {
    conflicts.push({ field: "property_type", values: propertyType.values, reason: "Multiple explicit property types found in CRM evidence." });
  }

  const bedrooms = detectBedrooms(input);
  if (bedrooms.hit) {
    candidates.push({
      key: "bedrooms",
      otherKey: null,
      operator: bedrooms.hit.operator,
      value: bedrooms.hit.value,
      confidence: 0.99,
      source: bedrooms.hit.source,
      sourceText: bedrooms.hit.sourceText,
    });
  } else if (bedrooms.values.length > 1 || bedrooms.values.includes("range")) {
    conflicts.push({ field: "bedrooms", values: bedrooms.values, reason: "Bedroom evidence is a range or contains conflicting explicit counts." });
  }

  const timeline = detectTimeline(input);
  if (timeline.hit) {
    candidates.push({
      key: "other",
      otherKey: "purchase timeline",
      operator: "eq",
      value: timeline.hit.value,
      confidence: 0.97,
      source: timeline.hit.source,
      sourceText: timeline.hit.sourceText,
    });
  } else if (timeline.values.length > 1) {
    conflicts.push({ field: "purchase_timeline", values: timeline.values, reason: "Multiple explicit purchase timelines found in CRM evidence." });
  }

  const projectedCriteria: BuyerCriterionInput[] = candidates.map((item) => ({
    key: item.key,
    other_key: item.otherKey,
    approval_status: "approved",
    active: true,
  }));

  const currentCompleteness = buildCustomerProfileCompleteness(input, []);
  const projectedCompleteness = buildCustomerProfileCompleteness(input, projectedCriteria);

  return {
    candidates,
    conflicts,
    currentCompleteness,
    projectedCompleteness,
    projectedProfileComplete: projectedCompleteness.score === 100 && projectedCompleteness.missing.length === 0,
    safeForAutoPersistence: false as const,
    readOnly: true as const,
  };
}
