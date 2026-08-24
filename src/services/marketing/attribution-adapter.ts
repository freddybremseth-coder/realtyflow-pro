/**
 * Phase 4 — attribusjons-adapter. Fanger touchpoints (idempotent) og ruller opp
 * kunde­reiser til canonical business metrics per innhold. Bak DI, byggetrygg.
 * revenue_events forblir source-of-truth for downstream utfall; touchpoints
 * lenker dem tilbake til content/campaign.
 */

import {
  canonicalMetricsForContent,
  rollupContentOutcomes,
  touchpointDedupeKey,
  type Journey,
  type MarketingTouchpoint,
  type AttributionModel,
} from "@/lib/marketing/attribution";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

function rowToTouch(r: any): MarketingTouchpoint {
  return {
    touchpointId: r.id ? String(r.id) : undefined,
    brandId: String(r.brand_id),
    contentId: r.content_id ?? null,
    publicationId: r.publication_id ?? null,
    campaignId: r.campaign_id ?? null,
    creativeVariantId: r.creative_variant_id ?? null,
    visitorId: r.visitor_id ?? null,
    contactId: r.contact_id ?? null,
    channel: r.channel ?? null,
    touchType: r.touch_type,
    occurredAt: r.occurred_at,
    confidence: r.confidence ?? undefined,
    commissionEur: r.commission_eur ?? null,
    metadata: r.metadata ?? undefined,
  };
}

/** Idempotent touch-fangst: dedupe_key + unique constraint hindrer dobbel-attribusjon. */
export async function recordTouchpoint(supabase: MarketingSupabaseLike, t: MarketingTouchpoint): Promise<{ deduped: boolean }> {
  if (!t.brandId?.trim()) throw new Error("ATTRIBUTION_BRAND_REQUIRED: brandId mangler");
  const dedupe_key = touchpointDedupeKey(t);
  const { error } = await supabase.from("marketing_touchpoints").upsert(
    {
      dedupe_key,
      brand_id: t.brandId,
      content_id: t.contentId ?? null,
      publication_id: t.publicationId ?? null,
      campaign_id: t.campaignId ?? null,
      creative_variant_id: t.creativeVariantId ?? null,
      visitor_id: t.visitorId ?? null,
      contact_id: t.contactId ?? null,
      channel: t.channel ?? null,
      touch_type: t.touchType,
      occurred_at: t.occurredAt,
      confidence: t.confidence ?? null,
      commission_eur: t.commissionEur ?? null,
      metadata: t.metadata ?? {},
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`recordTouchpoint failed: ${error.message}`);
  return { deduped: true };
}

async function loadJourneys(supabase: MarketingSupabaseLike, opts: { brandId: string }): Promise<Journey[]> {
  if (!opts.brandId?.trim()) throw new Error("ATTRIBUTION_BRAND_REQUIRED: brandId mangler");
  const { data } = await supabase
    .from("marketing_touchpoints")
    .select("*")
    .eq("brand_id", opts.brandId)
    .order("occurred_at", { ascending: true })
    .limit(10000);
  const byContact = new Map<string, MarketingTouchpoint[]>();
  for (const r of data ?? []) {
    const t = rowToTouch(r);
    const key = t.contactId || t.visitorId;
    if (!key) continue;
    (byContact.get(key) ?? byContact.set(key, []).get(key)!).push(t);
  }
  return Array.from(byContact.values()).map((touches) => ({ touches }));
}

export async function attributeContent(supabase: MarketingSupabaseLike, contentId: string, opts: { brandId: string; model?: AttributionModel }) {
  const journeys = await loadJourneys(supabase, opts);
  return canonicalMetricsForContent(journeys, contentId, opts.model ?? "last_touch");
}

export async function attributeAll(supabase: MarketingSupabaseLike, opts: { brandId: string; model?: AttributionModel }) {
  const journeys = await loadJourneys(supabase, opts);
  return rollupContentOutcomes(journeys, opts.model ?? "last_touch");
}
