export type InstagramMediaEngagement = {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  views: number;
  totalInteractions: number;
  raw: Record<string, unknown>;
};

type GraphMetric = {
  name?: string;
  values?: Array<{ value?: unknown }>;
  total_value?: { value?: unknown };
};

function asCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function metricValue(metrics: GraphMetric[], name: string): number {
  const metric = metrics.find((item) => item.name === name);
  return asCount(metric?.total_value?.value ?? metric?.values?.[0]?.value);
}

async function graphJson(url: URL, fetcher: typeof fetch) {
  const response = await fetcher(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message = data?.error?.message || `Meta Graph API HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

/**
 * Fetches public counters and private Insights for one Instagram Business
 * media object. Unsupported metrics are retried individually so one renamed
 * or media-type-specific metric cannot discard the complete snapshot.
 */
export async function fetchInstagramMediaEngagement(
  mediaId: string,
  accessToken: string,
  options: { fetcher?: typeof fetch; graphVersion?: string } = {},
): Promise<InstagramMediaEngagement> {
  const fetcher = options.fetcher ?? fetch;
  const graphVersion = options.graphVersion ?? process.env.META_GRAPH_API_VERSION ?? "v25.0";
  const base = `https://graph.facebook.com/${graphVersion}`;

  const mediaUrl = new URL(`${base}/${encodeURIComponent(mediaId)}`);
  mediaUrl.searchParams.set("fields", "id,media_type,media_product_type,like_count,comments_count,timestamp,permalink");
  mediaUrl.searchParams.set("access_token", accessToken);
  const media = await graphJson(mediaUrl, fetcher);

  const requestedMetrics = ["reach", "impressions", "views", "plays", "saved", "shares", "total_interactions"];
  const insightsUrl = new URL(`${base}/${encodeURIComponent(mediaId)}/insights`);
  insightsUrl.searchParams.set("metric", requestedMetrics.join(","));
  insightsUrl.searchParams.set("access_token", accessToken);

  let metrics: GraphMetric[] = [];
  try {
    const insights = await graphJson(insightsUrl, fetcher);
    metrics = Array.isArray(insights?.data) ? insights.data : [];
  } catch {
    // Meta varies metric availability by media type and API version. Fetch
    // metrics independently so valid data survives one unsupported metric.
    const settled = await Promise.allSettled(
      requestedMetrics.map(async (metric) => {
        const url = new URL(`${base}/${encodeURIComponent(mediaId)}/insights`);
        url.searchParams.set("metric", metric);
        url.searchParams.set("access_token", accessToken);
        const result = await graphJson(url, fetcher);
        return Array.isArray(result?.data) ? (result.data as GraphMetric[]) : [];
      }),
    );
    metrics = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  }

  const views = Math.max(metricValue(metrics, "views"), metricValue(metrics, "plays"));
  const likes = asCount(media.like_count);
  const comments = asCount(media.comments_count);
  const shares = metricValue(metrics, "shares");
  const saves = metricValue(metrics, "saved");

  return {
    likes,
    comments,
    shares,
    saves,
    reach: metricValue(metrics, "reach"),
    impressions: metricValue(metrics, "impressions"),
    views,
    totalInteractions: metricValue(metrics, "total_interactions") || likes + comments + shares + saves,
    raw: { media, insights: metrics },
  };
}
