import { evaluateTrackedSEOChanges, parseTrackedSEOChange } from "@/services/agents/seo-change-monitor";
import { targetForBrand, type GSCBrandSnapshot } from "@/services/agents/seo-search-console";
import type { SEOTopicJourney } from "@/services/marketing/seo-topic-journey";

type StoredSearchConsole = {
  brandId?: string | null;
  status?: string | null;
  result?: GSCBrandSnapshot | null;
};

type ChangeLogRow = {
  created_at?: string | null;
  details?: Record<string, unknown> | null;
};

export type SEOChangeJourney = {
  changeId: string;
  brandId: string;
  page: string;
  pageUrl: string | null;
  query: string;
  appliedAt: string;
  publisher: string | null;
  commitSha: string | null;
  metadataRevision: number | null;
  measurementStatus: "waiting" | "unavailable" | "incomplete" | "measured";
  measurementNote: string;
  baseline: {
    start: string;
    end: string;
    impressions: number;
    clicks: number;
    ctrPct: number;
    position: number;
  };
  current: null | {
    start: string;
    end: string;
    impressions: number;
    clicks: number;
    ctrPct: number;
    position: number;
  };
  observedDelta: null | {
    impressions: number;
    clicks: number;
    ctrPoints: number;
    position: number;
  };
  samePageTopics: Array<{
    topicId: string;
    title: string;
    stage: SEOTopicJourney["stage"];
    publishedCount: number;
    measuredContentCount: number;
    reach: number;
    clicks: number;
    leads: number;
    qualified: number;
    sales: number;
    commissionEur: number;
  }>;
};

function ctrPct(clicks: number, impressions: number) {
  if (!Number.isFinite(impressions) || impressions <= 0) return 0;
  return Number(((clicks / impressions) * 100).toFixed(2));
}

function normalizedPath(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    const raw = String(value || "").trim();
    if (!raw.startsWith("/")) return null;
    return raw.replace(/\/+$/, "") || "/";
  }
}

function pageUrlForBrand(brandId: string, page: string) {
  const target = targetForBrand(brandId);
  if (!target) return null;
  try {
    return new URL(page, target.base).toString();
  } catch {
    return null;
  }
}

export function buildSEOChangeJourneys(input: {
  changes: ChangeLogRow[];
  snapshots: GSCBrandSnapshot[];
  topicJourneys: SEOTopicJourney[];
}): SEOChangeJourney[] {
  const parsed = input.changes.flatMap((row) => {
    const tracked = parseTrackedSEOChange(row.details);
    if (!tracked) return [];
    return [{ tracked, details: row.details ?? {}, createdAt: row.created_at ?? null }];
  });
  const evaluations = evaluateTrackedSEOChanges(parsed.map((row) => row.tracked), input.snapshots);
  const evaluationById = new Map(evaluations.map((row) => [row.changeId, row]));

  return parsed.map(({ tracked, details }) => {
    const evaluation = evaluationById.get(tracked.changeId);
    const baselineCtr = ctrPct(tracked.baseline.clicks, tracked.baseline.impressions);
    const current = evaluation?.current
      ? {
          ...evaluation.current,
          ctrPct: ctrPct(evaluation.current.clicks, evaluation.current.impressions),
        }
      : null;
    const observedDelta = current
      ? {
          impressions: current.impressions - tracked.baseline.impressions,
          clicks: current.clicks - tracked.baseline.clicks,
          ctrPoints: Number((current.ctrPct - baselineCtr).toFixed(2)),
          position: Number((current.position - tracked.baseline.position).toFixed(2)),
        }
      : null;
    const pagePath = normalizedPath(tracked.page);
    const samePageTopics = input.topicJourneys
      .filter((topic) =>
        topic.brandId === tracked.brandId
        && pagePath !== null
        && normalizedPath(topic.canonicalUrl) === pagePath,
      )
      .map((topic) => ({
        topicId: topic.topicId,
        title: topic.title,
        stage: topic.stage,
        publishedCount: topic.publishedCount,
        measuredContentCount: topic.measuredContentCount,
        reach: Math.max(topic.metrics.impressions, topic.metrics.views),
        clicks: topic.metrics.clicks,
        leads: topic.business.leads,
        qualified: topic.business.qualified,
        sales: topic.business.sales,
        commissionEur: topic.business.commissionEur,
      }));

    return {
      changeId: tracked.changeId,
      brandId: tracked.brandId,
      page: tracked.page,
      pageUrl: pageUrlForBrand(tracked.brandId, tracked.page),
      query: tracked.query,
      appliedAt: tracked.appliedAt,
      publisher: details.publisher ? String(details.publisher) : null,
      commitSha: tracked.commitSha,
      metadataRevision: tracked.metadataRevision,
      measurementStatus: evaluation?.status ?? "unavailable",
      measurementNote: evaluation?.note ?? "Ingen måleevaluering er tilgjengelig.",
      baseline: {
        ...tracked.baseline,
        ctrPct: baselineCtr,
      },
      current,
      observedDelta,
      samePageTopics,
    };
  }).sort((a, b) =>
    Number(b.measurementStatus === "measured") - Number(a.measurementStatus === "measured")
    || Number(b.samePageTopics.some((topic) => topic.sales > 0)) - Number(a.samePageTopics.some((topic) => topic.sales > 0))
    || Date.parse(b.appliedAt) - Date.parse(a.appliedAt),
  );
}

function snapshotsFromDetails(details: unknown): GSCBrandSnapshot[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const rows = (details as Record<string, unknown>).google_search_console;
  if (!Array.isArray(rows)) return [];
  const out = new Map<string, GSCBrandSnapshot>();
  for (const raw of rows as StoredSearchConsole[]) {
    if (raw?.status !== "connected" || !raw.result || raw.result.brandId !== raw.brandId) continue;
    if (!out.has(raw.result.brandId)) out.set(raw.result.brandId, raw.result);
  }
  return [...out.values()];
}

export function mergeNewestGSCBrandSnapshots(
  ...groups: GSCBrandSnapshot[][]
): GSCBrandSnapshot[] {
  const byBrand = new Map<string, GSCBrandSnapshot>();
  for (const group of groups) {
    for (const snapshot of group) {
      const current = byBrand.get(snapshot.brandId);
      const currentAt = Date.parse(String(current?.collectedAt ?? ""));
      const nextAt = Date.parse(String(snapshot.collectedAt ?? ""));
      if (!current || (Number.isFinite(nextAt) && (!Number.isFinite(currentAt) || nextAt >= currentAt))) {
        byBrand.set(snapshot.brandId, snapshot);
      }
    }
  }
  return [...byBrand.values()];
}

export async function loadSEOChangeJourneys(
  supabase: any,
  topicJourneys: SEOTopicJourney[],
  opts: { limit?: number } = {},
): Promise<SEOChangeJourney[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 25));
  const [changesR, liveR, reviewR] = await Promise.all([
    supabase.from("automation_logs")
      .select("created_at,details")
      .eq("action", "seo_autopilot_change")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("automation_logs")
      .select("created_at,details")
      .eq("action", "seo_gsc_live_read")
      .in("status", ["success", "partial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("automation_logs")
      .select("created_at,details")
      .eq("action", "seo_portfolio_growth_review")
      .in("status", ["success", "partial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const error = changesR.error || liveR.error || reviewR.error;
  if (error) throw new Error(`SEO_CHANGE_JOURNEY_READ_FAILED: ${error.message}`);

  const liveSnapshots = snapshotsFromDetails(liveR.data?.details);
  const reviewSnapshots = snapshotsFromDetails(reviewR.data?.details);
  const snapshots = mergeNewestGSCBrandSnapshots(reviewSnapshots, liveSnapshots);

  return buildSEOChangeJourneys({
    changes: changesR.data ?? [],
    snapshots,
    topicJourneys,
  }).slice(0, limit);
}
