type SourceRow = {
  id?: string | null;
  brand_id?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  title?: string | null;
  priority?: number | null;
  recommended_channels?: unknown;
  payload?: Record<string, unknown> | null;
  status?: string | null;
  last_planned_at?: string | null;
  updated_at?: string | null;
};

type ContentRow = {
  content_id?: string | null;
  brand_id?: string | null;
  channel?: string | null;
  genome?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type PublicationRow = {
  content_id?: string | null;
  brand_id?: string | null;
  channel?: string | null;
  state?: string | null;
  updated_at?: string | null;
};

type EventRow = {
  content_id?: string | null;
  brand_id?: string | null;
  channel?: string | null;
  metrics?: Record<string, unknown> | null;
  occurred_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type TouchpointRow = {
  id?: string | null;
  content_id?: string | null;
  brand_id?: string | null;
  channel?: string | null;
  contact_id?: string | null;
  touch_type?: string | null;
  commission_eur?: number | string | null;
  occurred_at?: string | null;
};

export type SEOTopicJourneyStage =
  | "MISSION_READY"
  | "CONTENT_CREATED"
  | "PUBLISHED"
  | "MEASURED"
  | "LEAD_SIGNAL"
  | "QUALIFIED_SIGNAL"
  | "BUSINESS_PROVEN";

export type SEOTopicJourney = {
  topicId: string;
  genomeTopic: string;
  brandId: string;
  title: string;
  canonicalUrl: string;
  sourceStatus: string;
  priority: number;
  recommendedChannels: string[];
  evidence: string | null;
  observation: string | null;
  nextAction: string | null;
  sourceUpdatedAt: string | null;
  sourceLastPlannedAt: string | null;
  stage: SEOTopicJourneyStage;
  contentCount: number;
  publishedCount: number;
  measuredContentCount: number;
  latestPublishedAt: string | null;
  latestMetricsAt: string | null;
  channels: string[];
  metrics: {
    impressions: number;
    views: number;
    clicks: number;
    reactions: number;
    comments: number;
    saves: number;
    shares: number;
  };
  business: {
    leads: number;
    qualified: number;
    viewings: number;
    offers: number;
    sales: number;
    commissionEur: number;
  };
};

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const arr = (value: unknown) => Array.isArray(value)
  ? value.map(String).map((item) => item.trim()).filter(Boolean)
  : [];

const latestIso = (values: Array<string | null | undefined>) => {
  const valid = values
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(String(value))))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return valid[0] ?? null;
};

function distinctContacts(rows: TouchpointRow[], type: string) {
  const contacts = new Set<string>();
  let anonymous = 0;
  for (const row of rows) {
    if (String(row.touch_type) !== type) continue;
    const contactId = String(row.contact_id ?? "").trim();
    if (contactId) contacts.add(contactId);
    else anonymous += 1;
  }
  return contacts.size + anonymous;
}

function stageFor(input: {
  contentCount: number;
  publishedCount: number;
  measuredContentCount: number;
  leads: number;
  qualified: number;
  sales: number;
}): SEOTopicJourneyStage {
  if (input.sales > 0) return "BUSINESS_PROVEN";
  if (input.qualified > 0) return "QUALIFIED_SIGNAL";
  if (input.leads > 0) return "LEAD_SIGNAL";
  if (input.measuredContentCount > 0) return "MEASURED";
  if (input.publishedCount > 0) return "PUBLISHED";
  if (input.contentCount > 0) return "CONTENT_CREATED";
  return "MISSION_READY";
}

export function buildSEOTopicJourneys(input: {
  sources: SourceRow[];
  contents: ContentRow[];
  publications: PublicationRow[];
  events: EventRow[];
  touchpoints: TouchpointRow[];
}): SEOTopicJourney[] {
  const contentByGenomeTopic = new Map<string, ContentRow[]>();
  for (const content of input.contents) {
    const genomeTopic = String(content.genome?.topic ?? "").trim();
    if (!genomeTopic) continue;
    const rows = contentByGenomeTopic.get(genomeTopic) ?? [];
    rows.push(content);
    contentByGenomeTopic.set(genomeTopic, rows);
  }

  const journeys = input.sources.flatMap((source): SEOTopicJourney[] => {
    const payload = source.payload && typeof source.payload === "object" ? source.payload : {};
    const topicId = String(payload.topic_id ?? "").trim();
    const genomeTopic = String(payload.genome_topic ?? "").trim();
    const brandId = String(source.brand_id ?? "").trim();
    const canonicalUrl = String(payload.canonical_url ?? source.source_url ?? "").trim();
    if (!topicId || !genomeTopic || !brandId || !canonicalUrl) return [];

    const contents = (contentByGenomeTopic.get(genomeTopic) ?? [])
      .filter((row) => String(row.brand_id ?? "") === brandId);
    const contentIds = new Set(contents.map((row) => String(row.content_id ?? "")).filter(Boolean));
    const publications = input.publications.filter((row) =>
      contentIds.has(String(row.content_id ?? ""))
      && String(row.brand_id ?? "") === brandId,
    );
    const published = publications.filter((row) => String(row.state) === "published");

    const latestEventByContent = new Map<string, EventRow>();
    for (const event of input.events) {
      const contentId = String(event.content_id ?? "");
      if (!contentIds.has(contentId) || String(event.brand_id ?? "") !== brandId) continue;
      if (event.metadata?.learning_eligible === false) continue;
      const previous = latestEventByContent.get(contentId);
      const currentAt = Date.parse(String(event.occurred_at ?? ""));
      const previousAt = Date.parse(String(previous?.occurred_at ?? ""));
      if (!previous || (Number.isFinite(currentAt) && (!Number.isFinite(previousAt) || currentAt > previousAt))) {
        latestEventByContent.set(contentId, event);
      }
    }

    const metricTotals = {
      impressions: 0,
      views: 0,
      clicks: 0,
      reactions: 0,
      comments: 0,
      saves: 0,
      shares: 0,
    };
    for (const event of latestEventByContent.values()) {
      const metrics = event.metrics ?? {};
      metricTotals.impressions += n(metrics.impressions);
      metricTotals.views += n(metrics.views);
      metricTotals.clicks += n(metrics.clicks);
      metricTotals.reactions += n(metrics.reactions);
      metricTotals.comments += n(metrics.comments);
      metricTotals.saves += n(metrics.saves);
      metricTotals.shares += n(metrics.shares);
    }

    const touches = input.touchpoints.filter((row) =>
      contentIds.has(String(row.content_id ?? ""))
      && String(row.brand_id ?? "") === brandId,
    );
    const saleTouches = touches.filter((row) => String(row.touch_type) === "sale");
    const commissionEur = saleTouches.reduce((sum, row) => sum + n(row.commission_eur), 0);
    const leads = distinctContacts(touches, "lead_created");
    const qualified = distinctContacts(touches, "qualified");
    const viewings = distinctContacts(touches, "viewing");
    const offers = distinctContacts(touches, "offer");
    const sales = distinctContacts(touches, "sale");

    const channels = Array.from(new Set([
      ...contents.map((row) => String(row.channel ?? "")).filter(Boolean),
      ...published.map((row) => String(row.channel ?? "")).filter(Boolean),
    ])).sort();

    return [{
      topicId,
      genomeTopic,
      brandId,
      title: String(source.title ?? topicId),
      canonicalUrl,
      sourceStatus: String(source.status ?? "unknown"),
      priority: n(source.priority),
      recommendedChannels: arr(source.recommended_channels),
      evidence: payload.evidence ? String(payload.evidence) : null,
      observation: payload.observation ? String(payload.observation) : null,
      nextAction: payload.next_action ? String(payload.next_action) : null,
      sourceUpdatedAt: source.updated_at ? String(source.updated_at) : null,
      sourceLastPlannedAt: source.last_planned_at ? String(source.last_planned_at) : null,
      stage: stageFor({
        contentCount: contents.length,
        publishedCount: published.length,
        measuredContentCount: latestEventByContent.size,
        leads,
        qualified,
        sales,
      }),
      contentCount: contents.length,
      publishedCount: published.length,
      measuredContentCount: latestEventByContent.size,
      latestPublishedAt: latestIso(published.map((row) => row.updated_at)),
      latestMetricsAt: latestIso(Array.from(latestEventByContent.values()).map((row) => row.occurred_at)),
      channels,
      metrics: metricTotals,
      business: {
        leads,
        qualified,
        viewings,
        offers,
        sales,
        commissionEur: Math.round(commissionEur),
      },
    }];
  });

  const stageWeight: Record<SEOTopicJourneyStage, number> = {
    MISSION_READY: 0,
    CONTENT_CREATED: 1,
    PUBLISHED: 2,
    MEASURED: 3,
    LEAD_SIGNAL: 4,
    QUALIFIED_SIGNAL: 5,
    BUSINESS_PROVEN: 6,
  };

  return journeys.sort((a, b) =>
    stageWeight[b.stage] - stageWeight[a.stage]
    || b.business.sales - a.business.sales
    || b.business.qualified - a.business.qualified
    || b.business.leads - a.business.leads
    || b.priority - a.priority
    || Date.parse(b.sourceUpdatedAt ?? "1970-01-01") - Date.parse(a.sourceUpdatedAt ?? "1970-01-01"),
  );
}

export async function loadSEOTopicJourneys(
  supabase: any,
  opts: { limit?: number } = {},
): Promise<SEOTopicJourney[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 12, 50));
  const { data: sources, error: sourceError } = await supabase
    .from("marketing_source_queue")
    .select("id,brand_id,source_id,source_url,title,priority,recommended_channels,payload,status,last_planned_at,updated_at")
    .eq("source_type", "seo_topic")
    .in("status", ["pending", "ready", "drafted"])
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(100);
  if (sourceError) throw new Error(`SEO_TOPIC_JOURNEY_SOURCE_FAILED: ${sourceError.message}`);

  const sourceRows = (sources ?? []) as SourceRow[];
  if (!sourceRows.length) return [];
  const brandIds = Array.from(new Set(sourceRows.map((row) => String(row.brand_id ?? "")).filter(Boolean)));

  const { data: contents, error: contentError } = await supabase
    .from("marketing_content")
    .select("content_id,brand_id,channel,genome,updated_at")
    .in("brand_id", brandIds)
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (contentError) throw new Error(`SEO_TOPIC_JOURNEY_CONTENT_FAILED: ${contentError.message}`);

  const genomeTopics = new Set(sourceRows.map((row) => String(row.payload?.genome_topic ?? "")).filter(Boolean));
  const relevantContents = ((contents ?? []) as ContentRow[])
    .filter((row) => genomeTopics.has(String(row.genome?.topic ?? "")));
  const contentIds = Array.from(new Set(relevantContents.map((row) => String(row.content_id ?? "")).filter(Boolean)));

  let publications: PublicationRow[] = [];
  let events: EventRow[] = [];
  let touchpoints: TouchpointRow[] = [];

  if (contentIds.length) {
    const [publicationsR, eventsR, touchpointsR] = await Promise.all([
      supabase
        .from("marketing_publications")
        .select("content_id,brand_id,channel,state,updated_at")
        .in("content_id", contentIds)
        .limit(5000),
      supabase
        .from("marketing_events")
        .select("content_id,brand_id,channel,metrics,occurred_at,metadata")
        .in("content_id", contentIds)
        .eq("event_type", "metrics_snapshot")
        .limit(10000),
      supabase
        .from("marketing_touchpoints")
        .select("id,content_id,brand_id,channel,contact_id,touch_type,commission_eur,occurred_at")
        .in("content_id", contentIds)
        .limit(10000),
    ]);
    const readError = publicationsR.error || eventsR.error || touchpointsR.error;
    if (readError) throw new Error(`SEO_TOPIC_JOURNEY_OUTCOME_FAILED: ${readError.message}`);
    publications = publicationsR.data ?? [];
    events = eventsR.data ?? [];
    touchpoints = touchpointsR.data ?? [];
  }

  return buildSEOTopicJourneys({
    sources: sourceRows,
    contents: relevantContents,
    publications,
    events,
    touchpoints,
  }).slice(0, limit);
}
