import type { CorporateGrowthReview, CorporateGrowthReviewStage } from "@/lib/corporate-growth-review";

type GrowthReviewLogRow = {
  created_at?: string | null;
  details?: unknown;
};

export type CorporateImprovementRecurrence = {
  detected: boolean;
  stage: CorporateGrowthReviewStage;
  label: string;
  closedAt: string;
  postClosureSnapshots: number;
  firstRecurrenceAt: string | null;
  latestAt: string | null;
  note: string;
};

export type CorporateImprovementObservedEffect = {
  status: "NOT_ENOUGH_DATA" | "MEASURED_UP" | "MEASURED_DOWN" | "UNCHANGED";
  stage: CorporateGrowthReviewStage;
  label: string;
  baselineAt: string | null;
  baselineRatePct: number | null;
  postSnapshots: number;
  latestAt: string | null;
  latestRatePct: number | null;
  postAveragePct: number | null;
  deltaPctPoints: number | null;
  note: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseReview(row: GrowthReviewLogRow) {
  const details = record(row.details);
  const review = details.review as CorporateGrowthReview | undefined;
  const createdAt = row.created_at ? String(row.created_at) : "";
  if (!createdAt || review?.kind !== "corporate_growth_review") return null;
  return { createdAt, review };
}

export function corporateStageFromCandidateId(candidateId: string): CorporateGrowthReviewStage | null {
  const prefix = "SALES:SOURCE_BOTTLENECK:CORPORATE_HOMES:";
  if (!candidateId.startsWith(prefix)) return null;
  const stage = candidateId.slice(prefix.length) as CorporateGrowthReviewStage;
  return [
    "prospect_to_contact",
    "contact_to_meeting",
    "meeting_to_opportunity",
    "opportunity_to_viewing",
    "viewing_to_offer",
  ].includes(stage) ? stage : null;
}

function rateForStage(review: CorporateGrowthReview, stage: CorporateGrowthReviewStage) {
  const measured = review.measuredStages.find((item) => item.stage === stage);
  if (!measured || !measured.eligible) return null;
  return {
    label: measured.label,
    ratePct: measured.ratePct,
  };
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildCorporateImprovementObservedEffect(
  rows: GrowthReviewLogRow[],
  improvement: { candidateId: string; createdAt: string },
): CorporateImprovementObservedEffect | null {
  const stage = corporateStageFromCandidateId(improvement.candidateId);
  if (!stage) return null;

  const createdAt = Date.parse(improvement.createdAt);
  if (!Number.isFinite(createdAt)) return null;

  const reviews = rows
    .map(parseReview)
    .filter((item): item is NonNullable<ReturnType<typeof parseReview>> => item !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const eligible = reviews
    .map((item) => {
      const measured = rateForStage(item.review, stage);
      return measured ? { ...item, ...measured } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const baseline = [...eligible]
    .filter((item) => Date.parse(item.createdAt) <= createdAt)
    .at(-1) || null;
  const post = eligible.filter((item) => Date.parse(item.createdAt) > createdAt);
  const latest = post.at(-1) || null;

  const label = baseline?.label || latest?.label || stage;
  if (!baseline || post.length < 2) {
    return {
      status: "NOT_ENOUGH_DATA",
      stage,
      label,
      baselineAt: baseline?.createdAt || null,
      baselineRatePct: baseline?.ratePct ?? null,
      postSnapshots: post.length,
      latestAt: latest?.createdAt || null,
      latestRatePct: latest?.ratePct ?? null,
      postAveragePct: null,
      deltaPctPoints: null,
      note:
        "Trenger baseline og minst to nye kvalifiserte Growth Review-snapshots etter at forbedringstiltaket ble opprettet. Ingen årsakssammenheng antas.",
    };
  }

  const postAveragePct = rounded(
    post.reduce((sum, item) => sum + item.ratePct, 0) / post.length,
  );
  const deltaPctPoints = rounded(postAveragePct - baseline.ratePct);
  const status =
    deltaPctPoints >= 5
      ? "MEASURED_UP"
      : deltaPctPoints <= -5
        ? "MEASURED_DOWN"
        : "UNCHANGED";

  return {
    status,
    stage,
    label,
    baselineAt: baseline.createdAt,
    baselineRatePct: baseline.ratePct,
    postSnapshots: post.length,
    latestAt: latest?.createdAt || null,
    latestRatePct: latest?.ratePct ?? null,
    postAveragePct,
    deltaPctPoints,
    note:
      "Dette er en målt endring i Corporate-funnelen etter at tiltaket ble opprettet. Den dokumenterer ikke at tiltaket forårsaket endringen.",
  };
}


export function buildCorporateImprovementRecurrence(
  rows: GrowthReviewLogRow[],
  improvement: { candidateId: string; closedAt: string | null },
): CorporateImprovementRecurrence | null {
  const stage = corporateStageFromCandidateId(improvement.candidateId);
  if (!stage || !improvement.closedAt) return null;

  const closedAtMs = Date.parse(improvement.closedAt);
  if (!Number.isFinite(closedAtMs)) return null;

  const reviews = rows
    .map(parseReview)
    .filter((item): item is NonNullable<ReturnType<typeof parseReview>> => item !== null)
    .filter((item) => Date.parse(item.createdAt) > closedAtMs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const matching: typeof reviews = [];
  for (const item of reviews) {
    const itemStage =
      item.review.status === "READY"
        ? item.review.bottleneck?.stage || null
        : null;
    if (itemStage !== stage) {
      if (matching.length === 0) {
        return {
          detected: false,
          stage,
          label: item.review.bottleneck?.label || stage,
          closedAt: improvement.closedAt,
          postClosureSnapshots: 0,
          firstRecurrenceAt: null,
          latestAt: item.createdAt,
          note:
            "Tiltaket er lukket, og siste kvalifiserte Growth Review viser ikke samme flaskehals. Ingen gjenåpning foreslås.",
        };
      }
      break;
    }
    matching.push(item);
  }

  const latest = matching[0] || null;
  const first = matching.at(-1) || null;
  const label = latest?.review.bottleneck?.label || stage;
  const detected = matching.length >= 2;

  return {
    detected,
    stage,
    label,
    closedAt: improvement.closedAt,
    postClosureSnapshots: matching.length,
    firstRecurrenceAt: detected ? first?.createdAt || null : null,
    latestAt: latest?.createdAt || null,
    note: detected
      ? "Samme Corporate-flaskehals er målt i minst to nye READY-snapshots etter at tiltaket ble lukket. Dette er en tilbakekomst-indikasjon og krever menneskelig vurdering før eventuell gjenåpning."
      : "Tiltaket er lukket. Det finnes ennå ikke minst to nye READY-snapshots med samme flaskehals etter lukking.",
  };
}
