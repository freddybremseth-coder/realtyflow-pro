import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export type PublicationIntegrityCode =
  | "MISSING_POSTED_ATTEMPT"
  | "MISSING_EXTERNAL_ID"
  | "MISSING_ASSET"
  | "MISSING_CANONICAL_CONTENT"
  | "CONTENT_BRAND_MISMATCH"
  | "CONTENT_CHANNEL_MISMATCH"
  | "GENOME_BRAND_MISMATCH"
  | "GENOME_CHANNEL_MISMATCH"
  | "PROPERTY_FACTS_MISSING"
  | "PROPERTY_ID_MISSING"
  | "PROPERTY_SOURCE_MISMATCH";

export interface PublicationIntegrityIssue {
  publicationId: string;
  contentId: string;
  code: PublicationIntegrityCode;
  detail: string;
}

export interface PublicationIntegrityItem {
  publicationId: string;
  contentId: string;
  brandId: string;
  channel: string;
  sourceId: string | null;
  externalId: string | null;
  ok: boolean;
  issues: PublicationIntegrityIssue[];
}

export interface PublicationIntegrityResult {
  brandId: string;
  channel: string;
  checked: number;
  healthy: number;
  unhealthy: number;
  issuesByCode: Record<string, number>;
  items: PublicationIntegrityItem[];
}

function propertyIdFromSource(sourceId: string | null): string | null {
  return sourceId?.startsWith("property:") ? sourceId.slice("property:".length) : null;
}

function latestBy<T extends Record<string, any>>(rows: T[], key: keyof T): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const id = String(row[key] ?? "");
    if (id && !map.has(id)) map.set(id, row);
  }
  return map;
}

export async function auditPublishedMarketingIntegrity(
  supabase: MarketingSupabaseLike,
  opts: { brandId: string; channel: string; limit?: number },
): Promise<PublicationIntegrityResult> {
  const brandId = opts.brandId?.trim();
  const channel = opts.channel?.trim();
  if (!brandId) throw new Error("PUBLICATION_INTEGRITY_BRAND_REQUIRED");
  if (!channel) throw new Error("PUBLICATION_INTEGRITY_CHANNEL_REQUIRED");
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 250));

  const { data: publications, error: pubError } = await supabase
    .from("marketing_publications")
    .select("publication_id, content_id, brand_id, channel, source_id, state, updated_at")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .eq("state", "published")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (pubError) throw new Error(`PUBLICATION_INTEGRITY_PUBLICATIONS_FAILED: ${pubError.message}`);

  const pubs = publications ?? [];
  const publicationIds = pubs.map((r: any) => String(r.publication_id ?? "")).filter(Boolean);
  const contentIds = pubs.map((r: any) => String(r.content_id ?? "")).filter(Boolean);
  if (!publicationIds.length || !contentIds.length) {
    return { brandId, channel, checked: 0, healthy: 0, unhealthy: 0, issuesByCode: {}, items: [] };
  }

  const [{ data: attempts }, { data: assets }, { data: contents }] = await Promise.all([
    supabase
      .from("marketing_publish_attempts")
      .select("publication_id, status, external_media_id, external_id, updated_at")
      .in("publication_id", publicationIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("marketing_assets")
      .select("content_id, genome, fact_sources, property_ids, updated_at")
      .in("content_id", contentIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("marketing_content")
      .select("content_id, brand_id, channel, genome, updated_at")
      .in("content_id", contentIds)
      .order("updated_at", { ascending: false }),
  ]);

  const postedAttempts = latestBy(
    (attempts ?? []).filter((r: any) => String(r.status) === "posted"),
    "publication_id",
  );
  const latestAssets = latestBy(assets ?? [], "content_id");
  const latestContents = latestBy(contents ?? [], "content_id");

  const items: PublicationIntegrityItem[] = pubs.map((pub: any) => {
    const publicationId = String(pub.publication_id ?? "");
    const contentId = String(pub.content_id ?? "");
    const sourceId = pub.source_id ? String(pub.source_id) : null;
    const issues: PublicationIntegrityIssue[] = [];
    const add = (code: PublicationIntegrityCode, detail: string) => issues.push({ publicationId, contentId, code, detail });

    const attempt = postedAttempts.get(publicationId);
    const externalId = attempt ? String(attempt.external_media_id ?? attempt.external_id ?? "").trim() || null : null;
    if (!attempt) add("MISSING_POSTED_ATTEMPT", "Publikasjonen mangler posted publish-attempt.");
    else if (!externalId) add("MISSING_EXTERNAL_ID", "Posted attempt mangler ekstern kanal-ID.");

    const asset = latestAssets.get(contentId);
    const content = latestContents.get(contentId);
    if (!asset) add("MISSING_ASSET", "marketing_assets mangler canonical asset/provenance.");
    if (!content) add("MISSING_CANONICAL_CONTENT", "marketing_content mangler canonical genome.");

    if (content) {
      if (String(content.brand_id ?? "") !== brandId) add("CONTENT_BRAND_MISMATCH", `marketing_content.brand_id=${String(content.brand_id ?? "")}`);
      if (String(content.channel ?? "") !== channel) add("CONTENT_CHANNEL_MISMATCH", `marketing_content.channel=${String(content.channel ?? "")}`);
      if (String(content.genome?.brandId ?? "") !== brandId) add("GENOME_BRAND_MISMATCH", `genome.brandId=${String(content.genome?.brandId ?? "")}`);
      if (String(content.genome?.channel ?? "") !== channel) add("GENOME_CHANNEL_MISMATCH", `genome.channel=${String(content.genome?.channel ?? "")}`);
    }

    const propertyId = propertyIdFromSource(sourceId);
    if (propertyId && asset) {
      const facts = Array.isArray(asset.fact_sources) ? asset.fact_sources : [];
      const propertyIds = Array.isArray(asset.property_ids) ? asset.property_ids.map(String) : [];
      if (facts.length === 0) add("PROPERTY_FACTS_MISSING", "Property-grounded publikasjon mangler fact_sources.");
      if (propertyIds.length === 0) add("PROPERTY_ID_MISSING", "Property-grounded publikasjon mangler property_ids.");
      else if (!propertyIds.includes(propertyId)) add("PROPERTY_SOURCE_MISMATCH", `source property=${propertyId}, asset property_ids=${propertyIds.join(",")}`);
    }

    return { publicationId, contentId, brandId, channel, sourceId, externalId, ok: issues.length === 0, issues };
  });

  const issuesByCode: Record<string, number> = {};
  for (const item of items) {
    for (const issue of item.issues) issuesByCode[issue.code] = (issuesByCode[issue.code] ?? 0) + 1;
  }
  const healthy = items.filter((i) => i.ok).length;
  return { brandId, channel, checked: items.length, healthy, unhealthy: items.length - healthy, issuesByCode, items };
}
