export type PublishGapBand =
  | "under_6h"
  | "h_6_20"
  | "h_20_36"
  | "h_36_72"
  | "h_72_120"
  | "h_120_plus"
  | "first_post";

export interface PublicationCadenceObservation {
  publishGapBand: PublishGapBand;
  gapHours: number | null;
  learningEligible: boolean;
  reason: string | null;
}

/**
 * Classify the actual time since the previous post on the same brand/channel.
 * The sub-6h band is retained for audit but is never allowed to teach Growth OS
 * that runaway/burst publishing is desirable.
 */
export function observePublicationCadence(
  postedAt: string | Date,
  previousPostedAt?: string | Date | null,
): PublicationCadenceObservation {
  if (!previousPostedAt) {
    return { publishGapBand: "first_post", gapHours: null, learningEligible: false, reason: "first_post_no_cadence_baseline" };
  }

  const current = new Date(postedAt).getTime();
  const previous = new Date(previousPostedAt).getTime();
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current <= previous) {
    return { publishGapBand: "first_post", gapHours: null, learningEligible: false, reason: "invalid_publication_gap" };
  }

  const gapHours = Number(((current - previous) / 3_600_000).toFixed(2));
  if (gapHours < 6) {
    return { publishGapBand: "under_6h", gapHours, learningEligible: false, reason: "historical_runaway_cadence" };
  }
  if (gapHours < 20) return { publishGapBand: "h_6_20", gapHours, learningEligible: true, reason: null };
  if (gapHours < 36) return { publishGapBand: "h_20_36", gapHours, learningEligible: true, reason: null };
  if (gapHours < 72) return { publishGapBand: "h_36_72", gapHours, learningEligible: true, reason: null };
  if (gapHours < 120) return { publishGapBand: "h_72_120", gapHours, learningEligible: true, reason: null };
  return { publishGapBand: "h_120_plus", gapHours, learningEligible: true, reason: null };
}

/** Conservative mapping for later execution. Never goes below the DB safety floor. */
export function cadenceBandTargetHours(band: PublishGapBand): number | null {
  switch (band) {
    case "h_6_20": return 20;
    case "h_20_36": return 28;
    case "h_36_72": return 48;
    case "h_72_120": return 96;
    case "h_120_plus": return 120;
    default: return null;
  }
}
