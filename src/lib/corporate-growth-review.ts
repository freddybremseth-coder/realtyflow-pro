export type CorporateGrowthFunnel = {
  totalProspects: number;
  contacted: number;
  meetings: number;
  opportunities: number;
  viewingCompanies: number;
  offerCompanies: number;
  revenueEventsReady: boolean;
};

export type CorporateGrowthReviewStage =
  | "prospect_to_contact"
  | "contact_to_meeting"
  | "meeting_to_opportunity"
  | "opportunity_to_viewing"
  | "viewing_to_offer";

export type CorporateGrowthReviewComparison = {
  previousBottleneckStage: CorporateGrowthReviewStage | null;
  previousRatePct: number | null;
  rateDeltaPctPoints: number | null;
  sameBottleneckStreak: number;
  continuousImprovementCandidate: boolean;
  note: string;
};

export type CorporateGrowthReview = {
  version: 1;
  kind: "corporate_growth_review";
  status: "READY" | "LEARNING" | "DATA_GAP";
  window: "current_pipeline_snapshot";
  minimumDenominator: number;
  bottleneck: null | {
    stage: CorporateGrowthReviewStage;
    label: string;
    numerator: number;
    denominator: number;
    ratePct: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  };
  measuredStages: Array<{
    stage: CorporateGrowthReviewStage;
    label: string;
    numerator: number;
    denominator: number;
    ratePct: number;
    eligible: boolean;
  }>;
  nextFocus: string;
  evidenceNote: string;
  guardrails: {
    readOnly: true;
    automaticBudgetChanges: false;
    automaticOutreach: false;
    inferredOutcomes: false;
  };
};

const pct = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;

const nextFocusByStage: Record<CorporateGrowthReviewStage, string> = {
  prospect_to_contact:
    "Undersøk readiness, selskapskanal-dekning og manuell kontaktkapasitet før mer prospect-volum legges til.",
  contact_to_meeting:
    "Undersøk svarmønster, Corporate-verdiforslag og discovery-handoff før mer outbound eller betalt trafikk skaleres.",
  meeting_to_opportunity:
    "Undersøk discovery-kvalitet, beslutningskriterier og kvalifiseringsdata før flere møter jages.",
  opportunity_to_viewing:
    "Undersøk shortlist-fit, Decision Pack-friksjon og beslutningsklarhet før mer trafikk kjøpes.",
  viewing_to_offer:
    "Undersøk boligfit, pris, innvendinger og tilbudspreflight før kampanjebudsjett eller volum økes.",
};

export function buildCorporateGrowthReview(
  funnel: CorporateGrowthFunnel,
  minimumDenominator = 5,
): CorporateGrowthReview {
  const stages = [
    {
      stage: "prospect_to_contact" as const,
      label: "Prospekt → kontakt",
      numerator: funnel.contacted,
      denominator: funnel.totalProspects,
    },
    {
      stage: "contact_to_meeting" as const,
      label: "Kontakt → møte",
      numerator: funnel.meetings,
      denominator: funnel.contacted,
    },
    {
      stage: "meeting_to_opportunity" as const,
      label: "Møte → opportunity",
      numerator: funnel.opportunities,
      denominator: funnel.meetings,
    },
    {
      stage: "opportunity_to_viewing" as const,
      label: "Opportunity → faktisk visning",
      numerator: funnel.viewingCompanies,
      denominator: funnel.opportunities,
    },
    {
      stage: "viewing_to_offer" as const,
      label: "Faktisk visning → faktisk tilbud",
      numerator: funnel.offerCompanies,
      denominator: funnel.viewingCompanies,
    },
  ].map((item) => ({
    ...item,
    ratePct: pct(item.numerator, item.denominator),
    eligible: item.denominator >= minimumDenominator,
  }));

  const guardrails = {
    readOnly: true as const,
    automaticBudgetChanges: false as const,
    automaticOutreach: false as const,
    inferredOutcomes: false as const,
  };

  if (!funnel.revenueEventsReady) {
    return {
      version: 1,
      kind: "corporate_growth_review",
      status: "DATA_GAP",
      window: "current_pipeline_snapshot",
      minimumDenominator,
      bottleneck: null,
      measuredStages: stages,
      nextFocus: "Gjenopprett Revenue OS-datagrunnlaget før funnel eller kanaler brukes til vekstbeslutninger.",
      evidenceNote: "Revenue Events er ikke tilgjengelig. Visning og tilbud kan derfor ikke vurderes som dokumenterte utfall.",
      guardrails,
    };
  }

  const eligible = stages
    .filter((item) => item.eligible)
    .sort((a, b) => a.ratePct - b.ratePct || b.denominator - a.denominator);

  if (!eligible.length) {
    return {
      version: 1,
      kind: "corporate_growth_review",
      status: "LEARNING",
      window: "current_pipeline_snapshot",
      minimumDenominator,
      bottleneck: null,
      measuredStages: stages,
      nextFocus: "Samle flere dokumenterte Corporate-observasjoner før funnel-dropp brukes som styringssignal.",
      evidenceNote: `Ingen funnel-overgang har minst ${minimumDenominator} observasjoner i nevneren.`,
      guardrails,
    };
  }

  const selected = eligible[0];
  const confidence =
    selected.denominator >= 20 ? "HIGH" as const :
    selected.denominator >= 10 ? "MEDIUM" as const :
    "LOW" as const;

  return {
    version: 1,
    kind: "corporate_growth_review",
    status: "READY",
    window: "current_pipeline_snapshot",
    minimumDenominator,
    bottleneck: {
      stage: selected.stage,
      label: selected.label,
      numerator: selected.numerator,
      denominator: selected.denominator,
      ratePct: selected.ratePct,
      confidence,
    },
    measuredStages: stages,
    nextFocus: nextFocusByStage[selected.stage],
    evidenceNote:
      "Flaskehalsen er valgt deterministisk blant målte overganger med tilstrekkelig utvalg. Faktisk visning og tilbud kommer kun fra bekreftede Revenue OS-events.",
    guardrails,
  };
}


function validHistoricalReview(value: unknown): CorporateGrowthReview | null {
  if (!value || typeof value !== "object") return null;
  const review = value as CorporateGrowthReview;
  if (review.kind !== "corporate_growth_review") return null;
  if (!["READY", "LEARNING", "DATA_GAP"].includes(review.status)) return null;
  return review;
}

export function compareCorporateGrowthReview(
  current: CorporateGrowthReview,
  previousReviews: unknown[],
): CorporateGrowthReviewComparison {
  const history = previousReviews
    .map(validHistoricalReview)
    .filter((review): review is CorporateGrowthReview => review !== null);

  const previous = history[0] || null;
  const currentStage = current.status === "READY" ? current.bottleneck?.stage || null : null;
  const previousStage = previous?.status === "READY" ? previous.bottleneck?.stage || null : null;
  const previousRatePct =
    currentStage && previousStage === currentStage && previous?.bottleneck
      ? previous.bottleneck.ratePct
      : null;
  const rateDeltaPctPoints =
    currentStage && previousRatePct !== null && current.bottleneck
      ? current.bottleneck.ratePct - previousRatePct
      : null;

  let sameBottleneckStreak = currentStage ? 1 : 0;
  if (currentStage) {
    for (const review of history) {
      const stage = review.status === "READY" ? review.bottleneck?.stage || null : null;
      if (stage !== currentStage) break;
      sameBottleneckStreak += 1;
    }
  }

  const continuousImprovementCandidate =
    Boolean(currentStage) && sameBottleneckStreak >= 2;

  return {
    previousBottleneckStage: previousStage,
    previousRatePct,
    rateDeltaPctPoints,
    sameBottleneckStreak,
    continuousImprovementCandidate,
    note: continuousImprovementCandidate
      ? "Samme målte flaskehals er gjentatt i minst to ukentlige snapshots. Dette er en kandidat for menneskelig vurdering i Kontinuerlig forbedring, ikke en automatisk oppgave eller årsakskonklusjon."
      : "Snapshot-sammenligningen er et retningssignal. Den dokumenterer ikke årsakssammenheng og oppretter ingen forbedringssak automatisk.",
  };
}
