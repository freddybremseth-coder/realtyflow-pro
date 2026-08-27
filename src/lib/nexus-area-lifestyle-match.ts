import type { BuyerLifestylePreference } from "./nexus-buyer-lifestyle";

export interface AreaLifestyleProfileLike {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  hero_blurb?: string | null;
  description?: string | null;
  highlights?: string[] | null;
  lifestyle?: string | null;
  climate?: string | null;
}

export type AreaLifestyleDimensionOutcome = "match" | "unknown" | "conflict";

export interface AreaLifestyleDimensionResult {
  key: string;
  outcome: AreaLifestyleDimensionOutcome;
  score: number;
  strength: BuyerLifestylePreference["strength"];
  confirmed: boolean;
  evidence: string[];
  reason: string;
}

export interface AreaLifestyleMatchResult {
  areaId: string | null;
  areaName: string;
  score: number;
  confidence: number;
  matched: number;
  unknown: number;
  conflicts: number;
  dimensions: AreaLifestyleDimensionResult[];
}

type DimensionRule = {
  positive: RegExp[];
  negative?: RegExp[];
};

const RULES: Record<string, DimensionRule> = {
  "lifestyle:beach": {
    positive: [/\bbeach\b/i, /\bstrand\b/i, /\bplaya\b/i, /\bcoast(?:al)?\b/i, /\bsea front\b/i],
  },
  "lifestyle:restaurants_cafes": {
    positive: [/\brestaurants?\b/i, /\bcaf[eé]s?\b/i, /\bdining\b/i, /\btapas\b/i, /\bgastronom/i],
  },
  "lifestyle:hiking_nature": {
    positive: [/\bhiking\b/i, /\bwalking trails?\b/i, /\bnature\b/i, /\bmountains?\b/i, /\bparque natural\b/i],
  },
  "lifestyle:golf": {
    positive: [/\bgolf\b/i, /\bgolf course\b/i],
  },
  "lifestyle:marina_boating": {
    positive: [/\bmarina\b/i, /\bboating\b/i, /\byacht/i, /\bport\b/i, /\bpuerto deportivo\b/i],
  },
  "lifestyle:culture": {
    positive: [/\bculture\b/i, /\bcultural\b/i, /\bmuseum\b/i, /\btheatre\b/i, /\btheater\b/i, /\bold town\b/i, /\bhistoric/i],
  },
  "environment:quiet": {
    positive: [/\bquiet\b/i, /\bpeaceful\b/i, /\btranquil\b/i, /\brolig\b/i, /\bresidential\b/i],
    negative: [/\blively\b/i, /\bnightlife\b/i, /\bbusy\b/i, /\bparty\b/i],
  },
  "environment:lively": {
    positive: [/\blively\b/i, /\bnightlife\b/i, /\bvibrant\b/i, /\bbustling\b/i, /\bactive centre\b/i],
    negative: [/\bquiet\b/i, /\bpeaceful\b/i, /\btranquil\b/i],
  },
  "environment:local_spanish": {
    positive: [/\blocal spanish\b/i, /\btraditional spanish\b/i, /\bauthentic spanish\b/i, /\bspanish village\b/i],
  },
  "environment:international": {
    positive: [/\binternational\b/i, /\bmulticultural\b/i, /\bexpat\b/i, /\bcosmopolitan\b/i],
  },
  "environment:village_feel": {
    positive: [/\bvillage\b/i, /\bpueblo\b/i, /\bsmall town\b/i, /\bcommunity feel\b/i],
    negative: [/\burban\b/i, /\bcity centre\b/i],
  },
  "environment:urban": {
    positive: [/\burban\b/i, /\bcity centre\b/i, /\bdowntown\b/i, /\bmetropolitan\b/i],
    negative: [/\bvillage\b/i, /\brural\b/i],
  },
  "social:scandinavian": {
    positive: [/\bscandinavian\b/i, /\bnordic\b/i, /\bnorwegian\b/i, /\bswedish\b/i, /\bdanish\b/i],
  },
  "social:international_mix": {
    positive: [/\binternational community\b/i, /\binternational mix\b/i, /\bmulticultural\b/i, /\bexpat community\b/i],
  },
  "social:local_integration": {
    positive: [/\blocal community\b/i, /\blocal life\b/i, /\bspanish community\b/i, /\bauthentic local\b/i],
  },
  "mobility:walkable": {
    positive: [/\bwalkable\b/i, /\bwalking distance\b/i, /\bon foot\b/i, /\bpedestrian\b/i],
    negative: [/\bcar essential\b/i, /\bcar required\b/i, /\bcar dependent\b/i],
  },
  "mobility:flat_terrain": {
    positive: [/\bflat\b/i, /\blevel terrain\b/i, /\bflat terrain\b/i],
    negative: [/\bsteep\b/i, /\bhilly\b/i, /\bhillside\b/i],
  },
  "mobility:car_ok": {
    positive: [/\bcar\b/i, /\bdriving\b/i, /\broad access\b/i],
  },
  "mobility:public_transport": {
    positive: [/\bpublic transport\b/i, /\bbus\b/i, /\btram\b/i, /\btrain\b/i, /\bmetro\b/i],
  },
  "daily_life:beach_walkability": {
    positive: [/\bwalk(?:ing)? distance to (?:the )?beach\b/i, /\bbeach within walking distance\b/i, /\bwalk to the beach\b/i],
  },
  "daily_life:restaurants_walkability": {
    positive: [/\bwalk(?:ing)? distance to restaurants?\b/i, /\brestaurants? within walking distance\b/i, /\bwalk to restaurants?\b/i],
  },
  "daily_life:shops_walkability": {
    positive: [/\bwalk(?:ing)? distance to shops?\b/i, /\bshops? within walking distance\b/i, /\bwalk to shops?\b/i],
  },
  "daily_life:healthcare_nearby": {
    positive: [/\bhealthcare\b/i, /\bhospital\b/i, /\bclinic\b/i, /\bmedical centre\b/i, /\bmedical center\b/i],
  },
  "daily_life:airport_access": {
    positive: [/\bairport\b/i, /\bairport access\b/i, /\bminutes? from .*airport\b/i],
  },
};

function strengthWeight(strength: BuyerLifestylePreference["strength"]) {
  if (strength === "must_have") return 1;
  if (strength === "strong_preference") return 0.8;
  if (strength === "nice_to_have") return 0.5;
  return 0.15;
}

function areaSearchText(area: AreaLifestyleProfileLike) {
  return [
    area.name,
    area.hero_blurb,
    area.description,
    area.lifestyle,
    area.climate,
    ...(Array.isArray(area.highlights) ? area.highlights : []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

function snippets(text: string, rules: RegExp[]) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const matched = lines.filter((line) => rules.some((rule) => rule.test(line)));
  return Array.from(new Set(matched)).slice(0, 3);
}

export function scoreAreaLifestyleMatch(
  area: AreaLifestyleProfileLike,
  preferences: BuyerLifestylePreference[],
): AreaLifestyleMatchResult {
  const text = areaSearchText(area);
  const dimensions: AreaLifestyleDimensionResult[] = [];

  for (const preference of preferences) {
    if (preference.value === false || preference.value === "false" || preference.strength === "not_important") continue;
    const key = `${preference.namespace}:${preference.dimension}`;
    const rule = RULES[key];
    const weight = strengthWeight(preference.strength) * (preference.confirmed ? 1 : Math.max(0.4, preference.confidence));

    if (!rule) {
      dimensions.push({
        key,
        outcome: "unknown",
        score: 0,
        strength: preference.strength,
        confirmed: preference.confirmed,
        evidence: [],
        reason: "No deterministic area evidence rule exists for this lifestyle dimension yet.",
      });
      continue;
    }

    const positiveEvidence = snippets(text, rule.positive);
    const negativeEvidence = snippets(text, rule.negative || []);
    const outcome: AreaLifestyleDimensionOutcome = negativeEvidence.length > 0 && positiveEvidence.length === 0
      ? "conflict"
      : positiveEvidence.length > 0
        ? "match"
        : "unknown";
    const rawScore = outcome === "match" ? 100 : outcome === "conflict" ? 0 : 50;

    dimensions.push({
      key,
      outcome,
      score: Math.round(rawScore * weight),
      strength: preference.strength,
      confirmed: preference.confirmed,
      evidence: outcome === "conflict" ? negativeEvidence : positiveEvidence,
      reason: outcome === "match"
        ? "Area profile contains explicit evidence supporting this lifestyle preference."
        : outcome === "conflict"
          ? "Area profile contains explicit evidence that conflicts with this lifestyle preference."
          : "Area profile does not contain enough explicit evidence to score this preference.",
    });
  }

  const weighted = dimensions.filter((item) => item.outcome !== "unknown");
  const score = weighted.length
    ? Math.round(weighted.reduce((sum, item) => sum + item.score, 0) / weighted.length)
    : 0;
  const confidence = dimensions.length
    ? Math.round((weighted.length / dimensions.length) * 100)
    : 0;

  return {
    areaId: area.id ? String(area.id) : null,
    areaName: String(area.name || area.slug || "Unknown area"),
    score,
    confidence,
    matched: dimensions.filter((item) => item.outcome === "match").length,
    unknown: dimensions.filter((item) => item.outcome === "unknown").length,
    conflicts: dimensions.filter((item) => item.outcome === "conflict").length,
    dimensions,
  };
}

export function rankAreasByLifestyle(
  areas: AreaLifestyleProfileLike[],
  preferences: BuyerLifestylePreference[],
) {
  return areas
    .map((area) => scoreAreaLifestyleMatch(area, preferences))
    .sort((left, right) => right.score - left.score || right.confidence - left.confidence || left.areaName.localeCompare(right.areaName));
}
