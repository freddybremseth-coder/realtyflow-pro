export type HealthStatus = "HEALTHY" | "NEEDS_ATTENTION" | "BLOCKED";

export type BuyerProfileHealthInput = {
  status?: string | null;
  budgetAmount?: number | null;
  purchaseReadiness?: string | null;
  updatedAt?: string | null;
};

export type BuyerCriterionHealthInput = {
  key?: string | null;
  otherKey?: string | null;
  value?: unknown;
  confidence?: number | null;
  customerConfirmed?: boolean | null;
  approvalStatus?: string | null;
  active?: boolean | null;
};

export type MatchQualityInput = {
  score?: number | null;
  dataQualityScore?: number | null;
  systemEligibility?: string | null;
  reviewStatus?: string | null;
  concerns?: unknown;
  questionsToVerify?: unknown;
};

export type BuyerProfileHealth = {
  status: HealthStatus;
  score: number;
  completeness: number;
  evidenceQuality: number;
  freshnessDays: number | null;
  missing: string[];
  conflicts: string[];
  blockers: string[];
  warnings: string[];
};

export type MatchQualityHealth = {
  status: HealthStatus;
  score: number;
  candidates: number;
  eligible: number;
  strong: number;
  clientReady: number;
  needsReview: number;
  bestScore: number | null;
  averageDataQuality: number | null;
  blockers: string[];
  warnings: string[];
};

const REQUIRED_CRITERIA = [
  { key: "location", label: "område" },
  { key: "property_type", label: "boligtype" },
  { key: "bedrooms", label: "soverom" },
] as const;

function bounded(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

function present(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function daysSince(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

export function evaluateBuyerProfileHealth(
  profile: BuyerProfileHealthInput,
  criteriaInput: BuyerCriterionHealthInput[],
  now = new Date(),
): BuyerProfileHealth {
  const criteria = criteriaInput.filter((row) => row.active !== false && row.approvalStatus !== "rejected");
  const keys = new Set(criteria.filter((row) => present(row.value)).map((row) => String(row.otherKey || row.key || "")));
  const missing = [
    ...(!present(profile.budgetAmount) && !keys.has("total_budget") && !keys.has("purchase_price") ? ["budsjett"] : []),
    ...REQUIRED_CRITERIA.filter((required) => !keys.has(required.key)).map((required) => required.label),
  ];

  const valuesByKey = new Map<string, Set<string>>();
  for (const criterion of criteria) {
    const key = String(criterion.otherKey || criterion.key || "");
    if (!key || !present(criterion.value)) continue;
    const values = valuesByKey.get(key) || new Set<string>();
    values.add(JSON.stringify(criterion.value));
    valuesByKey.set(key, values);
  }
  const conflicts = [...valuesByKey.entries()].filter(([, values]) => values.size > 1).map(([key]) => key);
  const confirmed = criteria.filter((row) => row.customerConfirmed === true).length;
  const confidenceValues = criteria.map((row) => Number(row.confidence)).filter(Number.isFinite).map((value) => Math.max(0, Math.min(1, value)));
  const confirmationRate = criteria.length ? confirmed / criteria.length : 0;
  const averageConfidence = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : 0;
  const evidenceQuality = Math.round((confirmationRate * 0.65 + averageConfidence * 0.35) * 100);
  const completeness = Math.round(((4 - missing.length) / 4) * 100);
  const freshnessDays = daysSince(profile.updatedAt, now);
  const blockers = [
    ...(profile.status !== "approved" ? ["Buyer Profile er ikke godkjent."] : []),
    ...(missing.includes("budsjett") ? ["Godkjent budsjett mangler."] : []),
    ...(missing.includes("område") ? ["Godkjent område mangler."] : []),
    ...(conflicts.length ? [`Motstridende aktive kriterier: ${conflicts.join(", ")}.`] : []),
  ];
  const warnings = [
    ...(missing.filter((item) => item !== "budsjett" && item !== "område").length ? [`Profilen mangler: ${missing.filter((item) => item !== "budsjett" && item !== "område").join(", ")}.`] : []),
    ...(criteria.length > 0 && confirmed < criteria.length ? [`${criteria.length - confirmed} kriterier er ikke kundebekreftet.`] : []),
    ...(freshnessDays === null ? ["Profilens ferskhet kan ikke dokumenteres."] : freshnessDays > 90 ? [`Profilen er ${freshnessDays} dager gammel.`] : freshnessDays > 45 ? [`Profilen bør friskmeldes; sist endret for ${freshnessDays} dager siden.`] : []),
    ...(profile.purchaseReadiness === "unknown" || !profile.purchaseReadiness ? ["Kjøpsklarhet er ukjent."] : []),
  ];
  const freshnessScore = freshnessDays === null ? 0 : freshnessDays <= 45 ? 100 : freshnessDays <= 90 ? 60 : 20;
  let score = Math.round(completeness * 0.55 + evidenceQuality * 0.3 + freshnessScore * 0.15);
  if (blockers.length) score = Math.min(score, 49);
  const status: HealthStatus = blockers.length ? "BLOCKED" : warnings.length || score < 80 ? "NEEDS_ATTENTION" : "HEALTHY";
  return { status, score, completeness, evidenceQuality, freshnessDays, missing, conflicts, blockers, warnings };
}

export function evaluateMatchQuality(items: MatchQualityInput[]): MatchQualityHealth {
  const candidates = items.length;
  const eligibleItems = items.filter((item) => item.systemEligibility !== "rejected");
  const eligible = eligibleItems.length;
  const strong = eligibleItems.filter((item) => bounded(item.score) >= 80 && bounded(item.dataQualityScore) >= 70).length;
  const clientReady = eligibleItems.filter((item) => item.reviewStatus === "client_ready").length;
  const needsReview = eligibleItems.filter((item) => !item.reviewStatus || item.reviewStatus === "needs_review").length;
  const bestScore = eligibleItems.length ? Math.max(...eligibleItems.map((item) => bounded(item.score))) : null;
  const averageDataQuality = eligibleItems.length
    ? Math.round(eligibleItems.reduce((sum, item) => sum + bounded(item.dataQualityScore), 0) / eligibleItems.length)
    : null;
  const concernCount = eligibleItems.reduce((sum, item) => sum + list(item.concerns).length + list(item.questionsToVerify).length, 0);
  const blockers = [
    ...(!candidates ? ["Ingen lagret shortlist finnes for profilen."] : []),
    ...(candidates > 0 && !eligible ? ["Shortlisten har ingen kvalifiserte kandidater."] : []),
    ...(eligible > 0 && (bestScore || 0) < 65 ? ["Ingen kandidat når minste nyttige matchscore 65."] : []),
    ...(eligible > 0 && (averageDataQuality || 0) < 60 ? ["Gjennomsnittlig eiendomsdatakvalitet er under 60."] : []),
  ];
  const warnings = [
    ...(eligible > 0 && !clientReady ? ["Ingen kandidat er markert klar for kunde."] : []),
    ...(needsReview ? [`${needsReview} kandidater venter på kvalitetsreview.`] : []),
    ...(concernCount ? [`${concernCount} bekymringer eller verifiseringsspørsmål er åpne.`] : []),
  ];
  const matchComponent = bestScore || 0;
  const dataComponent = averageDataQuality || 0;
  const reviewComponent = eligible ? Math.round((clientReady / eligible) * 100) : 0;
  let score = Math.round(matchComponent * 0.45 + dataComponent * 0.35 + reviewComponent * 0.2);
  if (blockers.length) score = Math.min(score, 49);
  const status: HealthStatus = blockers.length ? "BLOCKED" : warnings.length || score < 80 ? "NEEDS_ATTENTION" : "HEALTHY";
  return { status, score, candidates, eligible, strong, clientReady, needsReview, bestScore, averageDataQuality, blockers, warnings };
}

export function combineBuyerJourneyHealth(profile: BuyerProfileHealth, match: MatchQualityHealth): HealthStatus {
  if (profile.status === "BLOCKED" || match.status === "BLOCKED") return "BLOCKED";
  if (profile.status === "NEEDS_ATTENTION" || match.status === "NEEDS_ATTENTION") return "NEEDS_ATTENTION";
  return "HEALTHY";
}
