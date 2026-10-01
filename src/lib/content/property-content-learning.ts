export type PropertyContentLearningEvidenceLevel =
  | "insufficient"
  | "emerging"
  | "measured";

export type PropertyContentLearningSnapshot = {
  opportunity_id?: unknown;
  opportunity_type?: unknown;
  search_arrivals?: unknown;
  touchpoints?: unknown;
  lead_touchpoints?: unknown;
  publication_views?: unknown;
  evidence_level?: unknown;
  observed_at?: unknown;
};

const EVIDENCE_RANK: Record<PropertyContentLearningEvidenceLevel, number> = {
  insufficient: 0,
  emerging: 1,
  measured: 2,
};

function nonNegative(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function normalizeTrackedPath(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      return url.pathname.replace(/\/+$/, "") || "/";
    }
  } catch {
    // Fall through to path cleanup.
  }
  const path = raw.split(/[?#]/, 1)[0] || "";
  if (!path) return "";
  const normalized = (path.startsWith("/") ? path : "/" + path).replace(/\/{2,}/g, "/");
  return normalized.replace(/\/+$/, "") || "/";
}

export function propertyContentEvidenceLevel(metrics: {
  searchArrivals?: number;
  touchpoints?: number;
  leadTouchpoints?: number;
  publicationViews?: number;
}): PropertyContentLearningEvidenceLevel {
  const searchArrivals = nonNegative(metrics.searchArrivals);
  const touchpoints = nonNegative(metrics.touchpoints);
  const leadTouchpoints = nonNegative(metrics.leadTouchpoints);
  const publicationViews = nonNegative(metrics.publicationViews);

  if (leadTouchpoints > 0 || searchArrivals >= 5 || touchpoints >= 3 || publicationViews >= 50) return "measured";
  if (searchArrivals > 0 || touchpoints > 0 || publicationViews > 0) return "emerging";
  return "insufficient";
}

export function propertyContentLearningNote(level: PropertyContentLearningEvidenceLevel) {
  if (level === "measured") {
    return "Artikkelen har målbar trafikk eller engasjement. Samle flere publiserte eksempler før signaltypen får påvirke prioriteringen.";
  }
  if (level === "emerging") {
    return "Tidlig aktivitet er registrert, men evidensen er for svak til å endre prioriteringen.";
  }
  return "Ingen sikker effekt er målt ennå. Nexus observerer videre uten å endre scoring.";
}

export function aggregatePropertyContentLearning(rows: PropertyContentLearningSnapshot[]) {
  const latestByOpportunity = new Map<string, PropertyContentLearningSnapshot>();

  for (const row of rows) {
    const id = String(row.opportunity_id ?? "").trim();
    if (!id) continue;
    const current = latestByOpportunity.get(id);
    const currentTime = current?.observed_at ? Date.parse(String(current.observed_at)) : 0;
    const nextTime = row.observed_at ? Date.parse(String(row.observed_at)) : 0;
    if (!current || nextTime >= currentTime) latestByOpportunity.set(id, row);
  }

  const byType = new Map<string, {
    opportunityType: string;
    observedArticles: number;
    searchArrivals: number;
    touchpoints: number;
    leadTouchpoints: number;
    publicationViews: number;
    evidenceLevel: PropertyContentLearningEvidenceLevel;
  }>();

  let updatedAt: string | null = null;
  for (const row of latestByOpportunity.values()) {
    const opportunityType = String(row.opportunity_type ?? "unknown");
    const observedAt = row.observed_at ? String(row.observed_at) : null;
    if (observedAt && (!updatedAt || Date.parse(observedAt) > Date.parse(updatedAt))) updatedAt = observedAt;

    const searchArrivals = nonNegative(row.search_arrivals);
    const touchpoints = nonNegative(row.touchpoints);
    const leadTouchpoints = nonNegative(row.lead_touchpoints);
    const publicationViews = nonNegative(row.publication_views);
    const rawLevel = String(row.evidence_level ?? "");
    const level: PropertyContentLearningEvidenceLevel =
      rawLevel in EVIDENCE_RANK
        ? rawLevel as PropertyContentLearningEvidenceLevel
        : propertyContentEvidenceLevel({ searchArrivals, touchpoints, leadTouchpoints, publicationViews });

    const current = byType.get(opportunityType) || {
      opportunityType,
      observedArticles: 0,
      searchArrivals: 0,
      touchpoints: 0,
      leadTouchpoints: 0,
      publicationViews: 0,
      evidenceLevel: "insufficient" as PropertyContentLearningEvidenceLevel,
    };

    current.observedArticles += 1;
    current.searchArrivals += searchArrivals;
    current.touchpoints += touchpoints;
    current.leadTouchpoints += leadTouchpoints;
    current.publicationViews += publicationViews;
    if (EVIDENCE_RANK[level] > EVIDENCE_RANK[current.evidenceLevel]) current.evidenceLevel = level;
    byType.set(opportunityType, current);
  }

  const types = [...byType.values()]
    .map(item => {
      const readyForReview =
        item.observedArticles >= 3 &&
        (item.leadTouchpoints >= 2 || item.searchArrivals >= 15 || item.publicationViews >= 150);
      const advisoryScore = readyForReview
        ? Math.round((
            item.leadTouchpoints * 30
            + item.searchArrivals * 2
            + item.touchpoints
            + item.publicationViews / 25
          ) / Math.max(1, item.observedArticles) * 10) / 10
        : 0;
      return {
        ...item,
        readyForReview,
        advisoryScore,
        note: propertyContentLearningNote(item.evidenceLevel),
      };
    })
    .sort((a, b) =>
      Number(b.readyForReview) - Number(a.readyForReview)
      || b.advisoryScore - a.advisoryScore
      || EVIDENCE_RANK[b.evidenceLevel] - EVIDENCE_RANK[a.evidenceLevel]
      || b.leadTouchpoints - a.leadTouchpoints
      || b.searchArrivals - a.searchArrivals
      || b.publicationViews - a.publicationViews,
    );

  const totals = types.reduce(
    (acc, item) => ({
      searchArrivals: acc.searchArrivals + item.searchArrivals,
      touchpoints: acc.touchpoints + item.touchpoints,
      leadTouchpoints: acc.leadTouchpoints + item.leadTouchpoints,
      publicationViews: acc.publicationViews + item.publicationViews,
    }),
    { searchArrivals: 0, touchpoints: 0, leadTouchpoints: 0, publicationViews: 0 },
  );

  const recommendedOpportunityType =
    types.find(item => item.readyForReview && item.evidenceLevel === "measured")?.opportunityType || null;

  return {
    mode: recommendedOpportunityType ? "advisory_priority" as const : "observe_only" as const,
    updatedAt,
    observedArticles: latestByOpportunity.size,
    readyForReview: types.some(item => item.readyForReview),
    recommendedOpportunityType,
    recommendationReason: recommendedOpportunityType
      ? "Måledata er sterke nok til å løfte denne signaltypen i Content Studio-listen. Lagret score og publiseringsregler endres ikke."
      : null,
    totals,
    types,
  };
}
