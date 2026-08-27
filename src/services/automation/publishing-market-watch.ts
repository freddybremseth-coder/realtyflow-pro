import type { SupabaseClient } from "@supabase/supabase-js";

export const APPROVED_PUBLISHING_SIGNAL_SOURCES = [
  "amazon_creators_api",
  "amazon_ads_api",
  "apple_books_reporter",
  "apple_books_rss",
  "google_books_api",
  "publishdrive_api",
  "kdp_report_import",
  "manual_verified_import",
] as const;

export type ApprovedPublishingSignalSource = (typeof APPROVED_PUBLISHING_SIGNAL_SOURCES)[number];

type MarketSnapshot = {
  id?: string;
  source: string;
  query: string;
  marketplace?: string | null;
  total_results_estimate?: number | null;
  top_results?: unknown;
  summary?: unknown;
  created_at?: string;
};

export type BookIdea = {
  title: string;
  subtitle: string;
  angle: string;
  seed_query: string;
  opportunity_score: number;
  source: ApprovedPublishingSignalSource;
  evidence: Record<string, unknown>;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function slug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function clampScore(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.round(parsed))) : 50;
}

export function isApprovedPublishingSignalSource(value: unknown): value is ApprovedPublishingSignalSource {
  return typeof value === "string" && (APPROVED_PUBLISHING_SIGNAL_SOURCES as readonly string[]).includes(value);
}

export function extractApprovedBookIdeas(snapshots: MarketSnapshot[]): BookIdea[] {
  const ideas: BookIdea[] = [];
  for (const snapshot of snapshots) {
    if (!isApprovedPublishingSignalSource(snapshot.source)) continue;
    const summary = asObject(snapshot.summary);
    const candidates = Array.isArray(summary.book_ideas) ? summary.book_ideas : [];
    for (const raw of candidates) {
      const candidate = asObject(raw);
      const title = String(candidate.title || "").trim();
      const angle = String(candidate.angle || "").trim();
      if (!title || !angle) continue;
      const evidence = asObject(candidate.evidence);
      if (Object.keys(evidence).length === 0) continue;
      ideas.push({
        title,
        subtitle: String(candidate.subtitle || "").trim(),
        angle,
        seed_query: String(snapshot.query || "").trim(),
        opportunity_score: clampScore(candidate.opportunity_score ?? summary.opportunity_score),
        source: snapshot.source,
        evidence: {
          ...evidence,
          marketplace: snapshot.marketplace || null,
          snapshot_id: snapshot.id || null,
          observed_at: snapshot.created_at || null,
        },
      });
    }
  }

  ideas.sort((a, b) => b.opportunity_score - a.opportunity_score);
  const deduped: BookIdea[] = [];
  const seen = new Set<string>();
  for (const idea of ideas) {
    const key = slug(idea.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(idea);
    if (deduped.length >= 5) break;
  }
  return deduped;
}

async function getQueries(supabase: SupabaseClient) {
  try {
    const { data } = await supabase.from("brand_settings").select("settings").eq("brand_id", "_system").maybeSingle();
    const configured = (data as any)?.settings?.publishing_market_queries;
    if (Array.isArray(configured)) return configured.map(String).map((query) => query.trim()).filter(Boolean);
  } catch {
    // A query list is optional. Approved providers may ingest signals independently.
  }
  return [] as string[];
}

async function createBookIdeaTasks(supabase: SupabaseClient, ideas: BookIdea[]) {
  const dateKey = new Date().toISOString().slice(0, 10);
  const sourceIds = ideas.map((idea) => `marketwatch:${dateKey}:bookidea:${slug(idea.title)}`);
  if (sourceIds.length === 0) return 0;
  const existing = await supabase.from("work_items").select("source_id").in("source_id", sourceIds);
  if (existing.error) throw existing.error;
  const existingSet = new Set((existing.data || []).map((row: any) => String(row.source_id)));
  const inserts = ideas
    .filter((idea) => !existingSet.has(`marketwatch:${dateKey}:bookidea:${slug(idea.title)}`))
    .map((idea) => ({
      title: `Best next book: ${idea.title}`,
      description: `Opportunity score ${idea.opportunity_score}/100. ${idea.angle}. Verifisert kilde: ${idea.source}. Signal: ${idea.seed_query}.`,
      status: "TO_DO",
      priority: idea.opportunity_score >= 80 ? "CRITICAL" : "HIGH",
      due_date: dateKey,
      brand_id: "freddypublishing",
      source_type: "publishing",
      source_id: `marketwatch:${dateKey}:bookidea:${slug(idea.title)}`,
      assigned_agent: "publishing",
      next_action: "Gjennomgå evidensen og opprett Book Engine-prosjekt hvis muligheten godkjennes.",
      ai_score: idea.opportunity_score,
      metadata: { loop: "publishing_market_watch_v2", idea },
    }));
  if (inserts.length > 0) {
    const { error } = await supabase.from("work_items").insert(inserts);
    if (error) throw error;
  }
  return inserts.length;
}

async function createMissingCatalogTask(supabase: SupabaseClient) {
  const dateKey = new Date().toISOString().slice(0, 10);
  const sourceId = `marketwatch:${dateKey}:import_books`;
  const { data, error } = await supabase.from("work_items").select("id").eq("source_id", sourceId).maybeSingle();
  if (error) throw error;
  if (data) return 0;
  const { error: insertError } = await supabase.from("work_items").insert({
    title: "Importer bokkatalog til Publishing Hub",
    description: "Market Watch fant ingen egne bøker. Katalog og salgsrapporter må kobles til før systemet kan lære av salg.",
    status: "TO_DO",
    priority: "CRITICAL",
    due_date: dateKey,
    brand_id: "freddypublishing",
    source_type: "publishing",
    source_id: sourceId,
    assigned_agent: "publishing",
    next_action: "Importer KDP-rapport og koble til øvrige godkjente salgskilder.",
    ai_score: 99,
    metadata: { loop: "publishing_market_watch_v2" },
  });
  if (insertError) throw insertError;
  return 1;
}

export async function runPublishingMarketWatch(supabase: SupabaseClient) {
  const queries = await getQueries(supabase);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: snapshots, error: snapshotError } = await supabase.from("publishing_market_snapshots")
    .select("id,source,query,marketplace,total_results_estimate,top_results,summary,created_at")
    .in("source", [...APPROVED_PUBLISHING_SIGNAL_SOURCES])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(250);
  if (snapshotError) throw snapshotError;

  const approvedSnapshots = (snapshots || []).filter((row: any) => isApprovedPublishingSignalSource(row.source));
  const ideas = extractApprovedBookIdeas(approvedSnapshots as MarketSnapshot[]);
  const ideaTasksCreated = await createBookIdeaTasks(supabase, ideas);

  const { data: ownBooks, error: booksError } = await supabase.from("publishing_books")
    .select("id,title,orders,reviews_count,role,status")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (booksError) throw booksError;
  const own = ownBooks || [];
  const catalogTasksCreated = own.length === 0 ? await createMissingCatalogTask(supabase) : 0;

  return {
    mode: "approved_sources_only",
    legacy_amazon_html_scraper: "disabled",
    configured_queries: queries,
    approved_sources: [...APPROVED_PUBLISHING_SIGNAL_SOURCES],
    snapshots_considered: approvedSnapshots.length,
    provider_setup_required: approvedSnapshots.length === 0,
    own_books_count: own.length,
    own_orders_total: own.reduce((sum, book: any) => sum + Number(book.orders || 0), 0),
    top_book_ideas: ideas,
    idea_tasks_created: ideaTasksCreated,
    catalog_tasks_created: catalogTasksCreated,
  };
}
