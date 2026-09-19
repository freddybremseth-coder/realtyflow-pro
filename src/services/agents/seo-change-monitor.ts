import type { GSCBrandSnapshot } from "./seo-search-console";

/** Read-only, evidence-based follow-up of an already deployed and audited
 * low-risk SEO change. Never edits a live site or auto-reverts on noisy data. */
export type TrackedSEOChange = {
  changeId: string; brandId: string; page: string; query: string;
  appliedAt: string; commitSha: string | null; metadataRevision: number | null;
  baseline: { start: string; end: string; impressions: number; clicks: number; position: number };
};
export type SEOChangeEvaluation = {
  changeId: string; brandId: string; page: string; query: string; commitSha: string | null; metadataRevision: number | null;
  status: "waiting" | "unavailable" | "incomplete" | "measured";
  baseline: TrackedSEOChange["baseline"];
  current: { start: string; end: string; impressions: number; clicks: number; position: number } | null;
  note: string;
};

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function parseTrackedSEOChange(raw: unknown): TrackedSEOChange | null {
  const x = obj(raw);
  const changeId = String(x.change_id || "");
  const brandId = String(x.brand_id || "");
  const page = String(x.page || "");
  const query = String(x.query || "");
  const appliedAt = String(x.applied_at || "");
  const commitSha = String(x.commit_sha || "");
  const metadataRevision = x.metadata_revision === undefined ? null : Number(x.metadata_revision);
  const hasSourceRevision = Number.isInteger(metadataRevision) && metadataRevision !== null &&
    metadataRevision >= 1 && metadataRevision <= 9999 && brandId === "zeneco" && x.site_verified === true;
  const start = String(x.baseline_period_start || "");
  const end = String(x.baseline_period_end || "");
  const impressions = Number(x.baseline_impressions);
  const clicks = Number(x.baseline_clicks);
  const position = Number(x.baseline_position);
  if (!/^[a-z0-9_-]{5,90}$/.test(changeId) ||
      !["freddyb", "zeneco"].includes(brandId) ||
      !/^\/(?!\/)[a-z0-9/_-]*\/?$/i.test(page) ||
      !query || query.length > 180 ||
      !/^\d{4}-\d{2}-\d{2}T/.test(appliedAt) || !Number.isFinite(Date.parse(appliedAt)) ||
      (!/^[0-9a-f]{40}$/i.test(commitSha) && !hasSourceRevision) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      !Number.isFinite(impressions) || impressions < 0 ||
      !Number.isFinite(clicks) || clicks < 0 || clicks > impressions ||
      !Number.isFinite(position) || position < 0) return null;
  return {
    changeId, brandId, page, query, appliedAt,
    commitSha: /^[0-9a-f]{40}$/i.test(commitSha) ? commitSha : null,
    metadataRevision: hasSourceRevision ? metadataRevision : null,
    baseline: { start, end, impressions, clicks, position },
  };
}

function datePlusDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function evaluateTrackedSEOChanges(
  changes: readonly TrackedSEOChange[], snapshots: readonly GSCBrandSnapshot[],
): SEOChangeEvaluation[] {
  return changes.map(change => {
    const base = {
      changeId: change.changeId, brandId: change.brandId, page: change.page,
      query: change.query, commitSha: change.commitSha,
      metadataRevision: change.metadataRevision, baseline: change.baseline,
    };
    const snapshot = snapshots.find(item => item.brandId === change.brandId);
    if (!snapshot) return {
      ...base, status: "unavailable" as const, current: null,
      note: "Search Console-data for dette merket er utilgjengelige. Ingen resultatkonklusjon.",
    };
    const appliedDay = change.appliedAt.slice(0, 10);
    // Require a complete 30-day period that starts strictly AFTER publication.
    // Do not compare an overlapping pre/post window against the baseline.
    if (snapshot.period.currentStart <= appliedDay ||
        snapshot.period.currentEnd < datePlusDays(appliedDay, 30)) return {
      ...base, status: "waiting" as const, current: null,
      note: "Venter på en full 30-dagersperiode etter endringen. Tall som overlapper før/etter skal ikke sammenlignes.",
    };
    if (snapshot.dataQuality.truncated) return {
      ...base, status: "incomplete" as const, current: null,
      note: "Google-uttrekket er avkortet. Ingen konklusjon før fullstendig måling.",
    };
    const row = snapshot.topQueryPages.find(item =>
      item.page === change.page &&
      item.query.trim().toLocaleLowerCase() === change.query.trim().toLocaleLowerCase());
    if (!row) return {
      ...base, status: "incomplete" as const, current: null,
      note: "Denne søkefrasen/siden finnes ikke i Google-uttrekkets utvalg. Fravær er ikke et målt nullresultat.",
    };
    return {
      ...base, status: "measured" as const,
      current: {
        start: snapshot.period.currentStart, end: snapshot.period.currentEnd,
        impressions: row.impressions, clicks: row.clicks, position: row.position,
      },
      note: "Observerte Google-tall for samme søk og side. En forskjell beviser ikke at SEO-endringen forårsaket den; ingen automatisk tilbakeføring.",
    };
  });
}
