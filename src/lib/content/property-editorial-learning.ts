export type EditorialLearningEvidenceLevel = "insufficient" | "emerging" | "measured";

export type EditorialLearningMetrics = {
  ageDays: number;
  searchArrivals: number;
  touchpoints: number;
  leadTouchpoints: number;
  publicationViews: number;
};

export type EditorialLearningAssessment = EditorialLearningMetrics & {
  evidenceLevel: EditorialLearningEvidenceLevel;
  note: string;
};

const nonNegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

export function assessEditorialLearning(
  input: EditorialLearningMetrics,
): EditorialLearningAssessment {
  const metrics = {
    ageDays: nonNegative(input.ageDays),
    searchArrivals: nonNegative(input.searchArrivals),
    touchpoints: nonNegative(input.touchpoints),
    leadTouchpoints: nonNegative(input.leadTouchpoints),
    publicationViews: nonNegative(input.publicationViews),
  };

  if (metrics.ageDays < 7) {
    return {
      ...metrics,
      evidenceLevel: "insufficient",
      note: "For fersk til å bruke som læringssignal. Samle data uten å endre strategi.",
    };
  }

  if (
    metrics.leadTouchpoints >= 2 ||
    metrics.searchArrivals >= 20 ||
    metrics.touchpoints >= 10
  ) {
    return {
      ...metrics,
      evidenceLevel: "measured",
      note: "Nok observert respons til å inngå i en senere, kontrollert scoringmodell.",
    };
  }

  if (
    metrics.leadTouchpoints >= 1 ||
    metrics.searchArrivals >= 5 ||
    metrics.touchpoints >= 3
  ) {
    return {
      ...metrics,
      evidenceLevel: "emerging",
      note: "Et lovende signal, men fortsatt for lite data til automatisk strategijustering.",
    };
  }

  return {
    ...metrics,
    evidenceLevel: "insufficient",
    note: "For få observerte signaler. Behold som evidens, ikke som beslutningsregel.",
  };
}

export function articlePathFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  const values = tags.map((value) => String(value || ""));
  const slug = values.find((value) => value.startsWith("slug:"))?.slice(5).trim();
  if (!slug) return null;
  const cms = values.find((value) => value.startsWith("cms:"))?.slice(4).trim();
  if (cms === "magasin") return `/magasin/${slug}`;
  if (cms === "guide") return `/guide/${slug}`;
  if (cms === "kjopsprosess") return `/kjopsprosess/${slug}`;
  return `/magasin/${slug}`;
}

export function nexusOpportunityIdFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  const raw = tags
    .map((value) => String(value || ""))
    .find((value) => value.startsWith("nexus-opportunity:"));
  return raw?.slice("nexus-opportunity:".length).trim() || null;
}

export function nexusAngleFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  const raw = tags
    .map((value) => String(value || ""))
    .find((value) => value.startsWith("nexus-angle:"));
  return raw?.slice("nexus-angle:".length).trim() || null;
}
