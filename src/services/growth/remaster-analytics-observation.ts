import type { RemasterAnalyticsVideoRow } from "@/services/integrations/remaster-youtube-analytics";

export type RemasterWatchQualityBand = "ABOVE_COHORT" | "NEAR_COHORT" | "BELOW_COHORT" | "INSUFFICIENT_DATA";

export type RemasterAnalyticsObservation = {
  videoId: string;
  views: number;
  averageViewPercentage: number;
  engagementRatePct: number;
  netSubscribers: number;
  watchQuality: RemasterWatchQualityBand;
  engagementQuality: RemasterWatchQualityBand;
};

export type RemasterAnalyticsObservationSummary = {
  eligibleVideos: number;
  insufficientVideos: number;
  cohort: {
    medianAverageViewPercentage: number | null;
    medianEngagementRatePct: number | null;
  };
  observations: RemasterAnalyticsObservation[];
};

const MIN_VIEWS_FOR_COMPARISON = 20;
const RELATIVE_BAND = 0.15;

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function engagementRatePct(row: RemasterAnalyticsVideoRow) {
  if (row.views <= 0) return 0;
  return ((row.likes + row.comments + row.shares) / row.views) * 100;
}

function relativeBand(value: number, cohortMedian: number | null, eligible: boolean): RemasterWatchQualityBand {
  if (!eligible || cohortMedian === null) return "INSUFFICIENT_DATA";
  if (cohortMedian <= 0) return value > 0 ? "ABOVE_COHORT" : "NEAR_COHORT";
  if (value >= cohortMedian * (1 + RELATIVE_BAND)) return "ABOVE_COHORT";
  if (value <= cohortMedian * (1 - RELATIVE_BAND)) return "BELOW_COHORT";
  return "NEAR_COHORT";
}

/**
 * Read-only observation model for YouTube Analytics.
 *
 * It intentionally compares each mature-enough video to the Re-Master cohort
 * instead of using universal retention/engagement thresholds. This avoids
 * teaching Growth OS that one arbitrary benchmark applies across mixes,
 * short tracks and different audience acquisition contexts.
 *
 * This function NEVER creates growth actions and must remain observational
 * until measured history exists for the Analytics-derived signals.
 */
export function summarizeRemasterAnalytics(rows: RemasterAnalyticsVideoRow[]): RemasterAnalyticsObservationSummary {
  const eligible = rows.filter((row) => row.views >= MIN_VIEWS_FOR_COMPARISON);
  const retentionMedian = median(eligible.map((row) => row.averageViewPercentage));
  const engagementMedian = median(eligible.map(engagementRatePct));

  const observations = rows.map((row) => {
    const matureEnough = row.views >= MIN_VIEWS_FOR_COMPARISON;
    const engagement = engagementRatePct(row);
    return {
      videoId: row.videoId,
      views: row.views,
      averageViewPercentage: round(row.averageViewPercentage),
      engagementRatePct: round(engagement),
      netSubscribers: row.subscribersGained - row.subscribersLost,
      watchQuality: relativeBand(row.averageViewPercentage, retentionMedian, matureEnough),
      engagementQuality: relativeBand(engagement, engagementMedian, matureEnough),
    };
  });

  return {
    eligibleVideos: eligible.length,
    insufficientVideos: rows.length - eligible.length,
    cohort: {
      medianAverageViewPercentage: retentionMedian === null ? null : round(retentionMedian),
      medianEngagementRatePct: engagementMedian === null ? null : round(engagementMedian),
    },
    observations,
  };
}
