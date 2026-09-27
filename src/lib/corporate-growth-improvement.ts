import { operatingReviewFingerprint } from "@/lib/revenue/operating-review";
import type { ImprovementCandidate } from "@/lib/revenue/continuous-improvement";
import type {
  CorporateGrowthReview,
  CorporateGrowthReviewComparison,
} from "@/lib/corporate-growth-review";

type GrowthReviewLogRow = {
  created_at?: string | null;
  details?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function weekStart(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.getUTCDay();
  const diff = (day + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - diff);
  return parsed.toISOString().slice(0, 10);
}

function storedReview(row: GrowthReviewLogRow) {
  const details = record(row.details);
  const review = details.review as CorporateGrowthReview | undefined;
  const comparison = details.comparison as CorporateGrowthReviewComparison | undefined;
  const createdAt = row.created_at ? String(row.created_at) : "";
  if (!createdAt || review?.kind !== "corporate_growth_review") return null;
  return { createdAt, review, comparison: comparison || null };
}

export function corporateGrowthCandidateId(stage: string) {
  return `SALES:SOURCE_BOTTLENECK:CORPORATE_HOMES:${stage}`;
}

export function buildCorporateGrowthImprovementCandidate(
  rows: GrowthReviewLogRow[],
): ImprovementCandidate | null {
  const stored = rows
    .map(storedReview)
    .filter((item): item is NonNullable<ReturnType<typeof storedReview>> => item !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const latest = stored[0];
  const stage = latest?.review.status === "READY" ? latest.review.bottleneck?.stage || null : null;
  if (
    !latest ||
    !stage ||
    !latest.review.bottleneck ||
    !latest.comparison?.continuousImprovementCandidate
  ) return null;

  const consecutive: typeof stored = [];
  for (const item of stored) {
    const itemStage = item.review.status === "READY" ? item.review.bottleneck?.stage || null : null;
    if (itemStage !== stage) break;
    consecutive.push(item);
  }
  if (consecutive.length < 2) return null;

  const firstWeek = weekStart(consecutive[consecutive.length - 1].createdAt);
  const lastWeek = weekStart(consecutive[0].createdAt);
  if (!firstWeek || !lastWeek) return null;

  const streak = Math.max(2, Math.min(latest.comparison.sameBottleneckStreak, consecutive.length));
  const bottleneck = latest.review.bottleneck;
  const delta = latest.comparison.rateDeltaPctPoints;
  const deltaText = delta === null
    ? "Ingen sammenlignbar prosentpoengsendring mot forrige snapshot."
    : `Endring mot forrige snapshot: ${delta > 0 ? "+" : ""}${delta} prosentpoeng.`;

  const base = {
    id: corporateGrowthCandidateId(stage),
    role: "SALES" as const,
    source: "SALES" as const,
    issueType: "SOURCE_BOTTLENECK" as const,
    severity: (streak >= 3 || bottleneck.confidence === "HIGH" ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM",
    title: "Corporate Homes · gjentatt funnel-flaskehals",
    subject: `Corporate Homes · ${bottleneck.label}`,
    detail:
      `${bottleneck.numerator} av ${bottleneck.denominator} har passert steget (${bottleneck.ratePct}%). ` +
      `Samme flaskehals er målt i ${streak} ukentlige snapshots på rad. ${deltaText} ` +
      "Dette er et målt mønster, ikke dokumentasjon på årsakssammenheng.",
    recommendedAction: latest.review.nextFocus,
    href: "/corporate-homes",
    decisionKey: null,
    firstWeek,
    lastWeek,
    observedWeeks: consecutive.length,
    occurrenceWeeks: consecutive.length,
    totalOccurrences: consecutive.length,
    overdueInstances: 0,
    repeatedDeferrals: 0,
    maximumDaysOpen: null,
    amountEur: null,
    occurrenceRate: 100,
    existingImprovementId: null,
  };
  return {
    ...base,
    fingerprint: operatingReviewFingerprint(base),
  };
}
