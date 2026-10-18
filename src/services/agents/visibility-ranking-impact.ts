/**
 * Read-only comparison of two verified Google Search Console observation windows.
 * A ranking change is never proof of a deployed fix or causal SEO impact.
 */
export type VisibilityRankingWindow = {
  start: string;
  end: string;
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  position: number | null;
};
export type VisibilityRankingComparison = {
  state: "COMPARABLE" | "INSUFFICIENT_EVIDENCE";
  before: VisibilityRankingWindow;
  after: VisibilityRankingWindow;
  deltaClicks: number | null;
  deltaImpressions: number | null;
  deltaPosition: number | null;
  causeVerified: false;
  releaseVerified: false;
  note: string;
};
const day = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : NaN;
export function compareVisibilityRankingWindows(before: VisibilityRankingWindow, after: VisibilityRankingWindow): VisibilityRankingComparison {
  const valid = before.query === after.query && before.page === after.page &&
    Number.isFinite(day(before.start)) && Number.isFinite(day(before.end)) &&
    Number.isFinite(day(after.start)) && Number.isFinite(day(after.end)) &&
    day(before.start) <= day(before.end) && day(after.start) <= day(after.end) &&
    day(before.end) < day(after.start) &&
    day(before.end) - day(before.start) === day(after.end) - day(after.start) &&
    [before.impressions, before.clicks, after.impressions, after.clicks].every(n => Number.isInteger(n) && n >= 0) &&
    before.clicks <= before.impressions && after.clicks <= after.impressions &&
    before.impressions > 0 && after.impressions > 0 &&
    before.position !== null && after.position !== null &&
    Number.isFinite(before.position) && Number.isFinite(after.position) &&
    before.position > 0 && after.position > 0;
  return {
    state: valid ? "COMPARABLE" : "INSUFFICIENT_EVIDENCE",
    before, after,
    deltaClicks: valid ? after.clicks - before.clicks : null,
    deltaImpressions: valid ? after.impressions - before.impressions : null,
    deltaPosition: valid ? Math.round((before.position! - after.position!) * 100) / 100 : null,
    causeVerified: false, releaseVerified: false,
    note: valid
      ? "Sammenlignbare GSC-perioder. Positiv posisjonsendring betyr bedre gjennomsnittsrangering. Endringen viser ikke årsak eller verifisert publisering."
      : "Måling kan ikke sammenlignes sikkert: kontroller eksakt søk/side, datoperioder og tilgjengelige Google-data.",
  };
}
