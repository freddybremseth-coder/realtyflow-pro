export interface FacebookPostEngagement {
  impressions: number;
  reach: number;
  reactions: number;
  comments: number;
  shares: number;
  raw: Record<string, unknown>;
}

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function metricValue(rows: any[], name: string): number {
  const row = rows.find((item) => String(item?.name ?? "") === name);
  const values = Array.isArray(row?.values) ? row.values : [];
  if (!values.length) return 0;
  return Math.max(...values.map((item: any) => n(item?.value)));
}

export async function fetchFacebookPostEngagement(
  postId: string,
  accessToken: string,
): Promise<FacebookPostEngagement> {
  if (!postId) throw new Error("FACEBOOK_POST_ID_MISSING");
  if (!accessToken) throw new Error("FACEBOOK_ACCESS_TOKEN_MISSING");

  // `shares` is not exposed for every Facebook object type. Keep the canonical
  // engagement fetch limited to fields that are consistently available, then
  // fetch shares separately as a best-effort enrichment.
  const fields = "reactions.summary(true),comments.summary(true)";
  const objectUrl = new URL(`https://graph.facebook.com/v25.0/${encodeURIComponent(postId)}`);
  objectUrl.searchParams.set("fields", fields);
  objectUrl.searchParams.set("access_token", accessToken);

  const objectRes = await fetch(objectUrl.toString());
  const objectRaw = await objectRes.json().catch(() => ({}));
  if (!objectRes.ok) {
    throw new Error(`FACEBOOK_ENGAGEMENT_FETCH_FAILED: ${JSON.stringify(objectRaw)}`);
  }

  let sharesRaw: Record<string, unknown> = {};
  let shares = 0;
  try {
    const sharesUrl = new URL(`https://graph.facebook.com/v25.0/${encodeURIComponent(postId)}`);
    sharesUrl.searchParams.set("fields", "shares");
    sharesUrl.searchParams.set("access_token", accessToken);
    const sharesRes = await fetch(sharesUrl.toString());
    sharesRaw = await sharesRes.json().catch(() => ({}));
    if (sharesRes.ok) shares = n((sharesRaw as any)?.shares?.count);
  } catch {
    // Reactions/comments remain valid even when this post type has no shares field.
  }

  let insightsRaw: Record<string, unknown> = {};
  let impressions = 0;
  let reach = 0;
  try {
    const insightsUrl = new URL(`https://graph.facebook.com/v25.0/${encodeURIComponent(postId)}/insights`);
    insightsUrl.searchParams.set("metric", "post_impressions,post_impressions_unique");
    insightsUrl.searchParams.set("access_token", accessToken);
    const insightsRes = await fetch(insightsUrl.toString());
    insightsRaw = await insightsRes.json().catch(() => ({}));
    if (insightsRes.ok) {
      const rows = Array.isArray((insightsRaw as any)?.data) ? (insightsRaw as any).data : [];
      impressions = metricValue(rows, "post_impressions");
      reach = metricValue(rows, "post_impressions_unique");
    }
  } catch {
    // Engagement counts remain usable even if Page Insights is unavailable.
  }

  return {
    impressions,
    reach,
    reactions: n((objectRaw as any)?.reactions?.summary?.total_count),
    comments: n((objectRaw as any)?.comments?.summary?.total_count),
    shares,
    raw: {
      post: objectRaw,
      shares: sharesRaw,
      insights: insightsRaw,
    },
  };
}
