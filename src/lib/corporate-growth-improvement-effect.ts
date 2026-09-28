import type { CorporateGrowthReviewStage } from "@/lib/corporate-growth-review";

export type CorporateGrowthImprovementEffectTrend =
  | "NOT_ENOUGH_DATA"
  | "IMPROVING"
  | "UNCHANGED"
  | "WORSENING";

export type CorporateGrowthImprovementEffect = {
  trend: CorporateGrowthImprovementEffectTrend;
  stage: CorporateGrowthReviewStage;
  baselineRatePct: number | null;
  latestRatePct: number | null;
  deltaPctPoints: number | null;
  postSnapshots: number;
  latestSnapshotAt: string | null;
  evidenceNote: string;
};

type GrowthReviewLogRow = {
  created_at?: string | null;
  details?: unknown;
};

type MeasuredStage = {
  stage?: string;
  ratePct?: number;
  eligible?: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stageRate(row: GrowthReviewLogRow, stage: CorporateGrowthReviewStage) {
  const details = record(row.details);
  const review = record(details.review);
  const measuredStages = Array.isArray(review.measuredStages)
    ? review.measuredStages as MeasuredStage[]
    : [];
  const measured = measuredStages.find((item) => item?.stage === stage && item?.eligible === true);
  const rate = Number(measured?.ratePct);
  const at = row.created_at ? String(row.created_at) : "";
  if (!at || !Number.isFinite(rate)) return null;
  return { at, ratePct: Math.round(rate) };
}

export function buildCorporateGrowthImprovementEffect(
  stage: CorporateGrowthReviewStage,
  improvementCreatedAt: string,
  rows: GrowthReviewLogRow[],
): CorporateGrowthImprovementEffect {
  const createdMs = Date.parse(improvementCreatedAt);
  const observations = rows
    .map((row) => stageRate(row, stage))
    .filter((item): item is NonNullable<ReturnType<typeof stageRate>> => item !== null)
    .sort((a, b) => a.at.localeCompare(b.at));

  const baseline = Number.isFinite(createdMs)
    ? [...observations]
        .filter((item) => Date.parse(item.at) <= createdMs)
        .sort((a, b) => b.at.localeCompare(a.at))[0] || null
    : null;
  const post = Number.isFinite(createdMs)
    ? observations.filter((item) => Date.parse(item.at) > createdMs)
    : [];
  const latest = post.at(-1) || null;

  if (!baseline || post.length < 2 || !latest) {
    return {
      trend: "NOT_ENOUGH_DATA",
      stage,
      baselineRatePct: baseline?.ratePct ?? null,
      latestRatePct: latest?.ratePct ?? null,
      deltaPctPoints:
        baseline && latest ? latest.ratePct - baseline.ratePct : null,
      postSnapshots: post.length,
      latestSnapshotAt: latest?.at ?? null,
      evidenceNote:
        "Corporate effekt krever en kvalifisert baseline og minst to kvalifiserte ukessnapshots etter at forbedringstiltaket ble opprettet.",
    };
  }

  const latestTwo = post.slice(-2);
  const averagePostRate = Math.round(
    latestTwo.reduce((sum, item) => sum + item.ratePct, 0) / latestTwo.length,
  );
  const delta = averagePostRate - baseline.ratePct;
  const trend: CorporateGrowthImprovementEffectTrend =
    delta >= 10 ? "IMPROVING" :
    delta <= -10 ? "WORSENING" :
    "UNCHANGED";

  return {
    trend,
    stage,
    baselineRatePct: baseline.ratePct,
    latestRatePct: latest.ratePct,
    deltaPctPoints: delta,
    postSnapshots: post.length,
    latestSnapshotAt: latest.at,
    evidenceNote:
      "Trenden sammenligner baseline med gjennomsnittet av de to siste kvalifiserte Corporate Growth Review-snapshotene. ±10 prosentpoeng kreves for å kalle retningen bedre eller verre. Dette dokumenterer utvikling, ikke årsakssammenheng.",
  };
}
