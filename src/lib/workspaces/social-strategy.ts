export const SOCIAL_CATEGORIES = [
  "property",
  "area_lifestyle",
  "guide_competence",
  "market_insight",
  "people_advisor",
  "proof_process",
] as const;

export type SocialCategory = typeof SOCIAL_CATEGORIES[number];
export type ClassifiedSocialCategory = SocialCategory | "unknown";

export type SocialPublicationLike = {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  content_features?: unknown;
  published_at?: unknown;
  created_at?: unknown;
};

export type SocialStrategySnapshot = {
  strategyEnabled: boolean;
  strategyPeriodId: string | null;
  windowPosts: number;
  classifiedPosts: number;
  propertyPosts: number;
  propertyShare: number;
  propertyCeiling: number | null;
  propertyTargetMin: number | null;
  postsSinceLastProperty: number | null;
  minNonPropertyBetweenProperty: number | null;
  counts: Record<ClassifiedSocialCategory, number>;
  shares: Record<ClassifiedSocialCategory, number>;
  recommendedCategory: SocialCategory;
  recommendationReason: string;
  propertyRecommendationAllowed: boolean;
  targetShares: Record<SocialCategory, number>;
};

const ZENECO_TARGETS: Record<SocialCategory, number> = {
  property: 0.175,
  area_lifestyle: 0.25,
  guide_competence: 0.20,
  market_insight: 0.15,
  people_advisor: 0.10,
  proof_process: 0.125,
};

const DEFAULT_TARGETS: Record<SocialCategory, number> = {
  property: 0.30,
  area_lifestyle: 0.20,
  guide_competence: 0.20,
  market_insight: 0.10,
  people_advisor: 0.10,
  proof_process: 0.10,
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function tags(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}

function features(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function inferSocialCategory(publication: SocialPublicationLike): ClassifiedSocialCategory {
  const featureMap = features(publication.content_features);
  const explicit = text(featureMap.social_category);
  if ((SOCIAL_CATEGORIES as readonly string[]).includes(explicit)) {
    return explicit as SocialCategory;
  }
  if (featureMap.is_property_presentation === true) return "property";

  const tagList = tags(publication.tags);
  const tagText = tagList.join(" ");
  for (const category of SOCIAL_CATEGORIES) {
    if (tagList.includes("social-category-" + category.replace(/_/g, "-"))) return category;
    if (tagList.includes("social-category-" + category)) return category;
  }

  if (tagList.some((tag) => tag === "source-property" || tag.startsWith("property-") || tag.startsWith("style-"))) {
    return "property";
  }
  if (tagList.some((tag) => tag === "source-area" || tag.startsWith("source-area-"))) {
    return "area_lifestyle";
  }

  const combined = [text(publication.title), text(publication.description), tagText].join(" ");

  if (hasAny(combined, [
    "markedsinnsikt", "market insight", "boligmarked", "markedet", "markedsrapport",
    "prisutvikling", "prisnivå", "prisvekst", "etterspørsel", "trend", "analyse",
  ])) return "market_insight";

  if (hasAny(combined, [
    "bak kulissene", "møt rådgiver", "møt team", "rådgiver", "teamet", "hvem er vi",
    "på kontoret", "hverdagen vår", "menneskene",
  ])) return "people_advisor";

  if (hasAny(combined, [
    "kundereise", "kundecase", "case study", "slik jobber vi", "kjøpsprosess",
    "overtakelse", "visning", "faq", "ofte stilte", "prosess", "sjekkliste",
  ])) return "proof_process";

  if (hasAny(combined, [
    "guide", "slik kjøper", "før du kjøper", "boliglån", "skatt", "avgift", "advokat",
    "juridisk", "kostnader", "finansiering", "kjøpskompetanse", "kjøpe bolig",
  ])) return "guide_competence";

  if (hasAny(combined, [
    "område", "livsstil", "strand", "nabolag", "lokalliv", "restauranter", "skole",
    "promenade", "hverdagsliv", "costa blanca", "benidorm", "finestrat", "villajoyosa",
    "altea", "albir", "javea", "jávea", "denia", "guardamar",
  ])) return "area_lifestyle";

  if (tagList.some((tag) => tag === "source-content" || tag.startsWith("source-content-"))) {
    return "guide_competence";
  }

  return "unknown";
}

function zeroCounts(): Record<ClassifiedSocialCategory, number> {
  return {
    property: 0,
    area_lifestyle: 0,
    guide_competence: 0,
    market_insight: 0,
    people_advisor: 0,
    proof_process: 0,
    unknown: 0,
  };
}

function categoryLabel(category: SocialCategory) {
  switch (category) {
    case "property": return "bolig";
    case "area_lifestyle": return "område/livsstil";
    case "guide_competence": return "guide/kjøpskompetanse";
    case "market_insight": return "markedsinnsikt";
    case "people_advisor": return "mennesker/rådgivning";
    case "proof_process": return "prosess/kundereise";
  }
}

function largestDeficit(
  shares: Record<ClassifiedSocialCategory, number>,
  targets: Record<SocialCategory, number>,
  allowProperty: boolean,
) {
  const candidates = SOCIAL_CATEGORIES.filter((category) => allowProperty || category !== "property");
  return candidates
    .map((category) => ({ category, deficit: targets[category] - shares[category] }))
    .sort((a, b) => b.deficit - a.deficit)[0]?.category || "area_lifestyle";
}

export function buildSocialStrategySnapshot(
  publications: SocialPublicationLike[],
  brandKey: string,
): SocialStrategySnapshot {
  const strategyEnabled = brandKey === "zeneco";
  const targets = strategyEnabled ? ZENECO_TARGETS : DEFAULT_TARGETS;
  const maxPosts = 30;
  const rows = publications.slice(0, maxPosts);
  const counts = zeroCounts();
  const classified = rows.map((row) => inferSocialCategory(row));
  classified.forEach((category) => { counts[category] += 1; });

  const total = rows.length;
  const shares = zeroCounts();
  for (const category of [...SOCIAL_CATEGORIES, "unknown"] as ClassifiedSocialCategory[]) {
    shares[category] = total ? counts[category] / total : 0;
  }

  const firstPropertyIndex = classified.findIndex((category) => category === "property");
  const postsSinceLastProperty = firstPropertyIndex < 0
    ? (total ? total : null)
    : firstPropertyIndex;

  const propertyCeiling = strategyEnabled ? 0.20 : null;
  const propertyTargetMin = strategyEnabled ? 0.15 : null;
  const minNonPropertyBetweenProperty = strategyEnabled ? 4 : null;
  const cadenceSatisfied = !strategyEnabled || firstPropertyIndex < 0 || firstPropertyIndex >= 4;
  const belowCeiling = !strategyEnabled || shares.property < 0.20;
  const propertyRecommendationAllowed = cadenceSatisfied && belowCeiling;

  let recommendedCategory = largestDeficit(shares, targets, propertyRecommendationAllowed);
  if (strategyEnabled && total === 0) recommendedCategory = "area_lifestyle";

  let recommendationReason = "Anbefalt ut fra balansen i de siste publiserte innleggene.";
  if (strategyEnabled) {
    if (shares.property >= 0.20) {
      recommendationReason =
        "Boligposter utgjør " + Math.round(shares.property * 100) +
        " % av de siste innleggene. Strategien har 20 % som tak, så neste anbefaling er " +
        categoryLabel(recommendedCategory) + ".";
    } else if (firstPropertyIndex >= 0 && firstPropertyIndex < 4) {
      recommendationReason =
        "Det er bare " + firstPropertyIndex + " ikke-boligposter siden siste rene boligpost. " +
        "Strategien anbefaler minst fire før neste boligpresentasjon. Velg " +
        categoryLabel(recommendedCategory) + " nå.";
    } else {
      const actual = Math.round(shares[recommendedCategory] * 100);
      const target = Math.round(targets[recommendedCategory] * 100);
      recommendationReason =
        categoryLabel(recommendedCategory).replace(/^./, (letter) => letter.toUpperCase()) +
        " er underrepresentert (" + actual + " % mot ca. " + target + " % i strategien).";
    }
  }

  return {
    strategyEnabled,
    strategyPeriodId: strategyEnabled ? "zeneco-trust-2026-10-07-90d" : null,
    windowPosts: total,
    classifiedPosts: total - counts.unknown,
    propertyPosts: counts.property,
    propertyShare: shares.property,
    propertyCeiling,
    propertyTargetMin,
    postsSinceLastProperty,
    minNonPropertyBetweenProperty,
    counts,
    shares,
    recommendedCategory,
    recommendationReason,
    propertyRecommendationAllowed,
    targetShares: targets,
  };
}

export function socialCategoryForSource(input: {
  sourceType: string;
  contentKind?: string | null;
  explicitCategory?: string | null;
}): SocialCategory {
  const explicit = text(input.explicitCategory);
  if ((SOCIAL_CATEGORIES as readonly string[]).includes(explicit)) return explicit as SocialCategory;
  if (input.sourceType === "property") return "property";
  if (input.sourceType === "area") return "area_lifestyle";
  if (input.sourceType === "article") {
    const kind = text(input.contentKind);
    if (kind === "area") return "area_lifestyle";
    if (kind === "magazine" || kind === "article") return "market_insight";
    return "guide_competence";
  }
  return "market_insight";
}

export function socialCategoryLabel(category: SocialCategory) {
  return categoryLabel(category);
}
