/**
 * Phase 3 — inntak av kanal-metrics.
 * Henter rå plattform-metrics (fra hvilken som helst kilde), normaliserer til
 * ContentMetrics, fletter inn attribution-baserte forretnings-metrics, og
 * registrerer en marketing-hendelse med enhetlig metrics + business value.
 * Bak DI (byggetrygg generisk klient).
 */

import { combineMetrics, normalizeChannelMetrics } from "@/lib/marketing/analytics";
import type { ContentGenome, MarketingChannel } from "@/lib/marketing/genome";
import type { MarketingEventType } from "@/lib/marketing/events";
import type { ContentMetrics } from "@/lib/marketing/value-score";
import { makeMarketingStore, type MarketingSupabaseLike } from "@/services/marketing/adapters";

export interface IngestChannelMetricsInput {
  brandId: string;
  channel: MarketingChannel;
  contentId?: string | null;
  genome?: ContentGenome | null;
  /** Rå metrics fra plattformens API/tabell (vilkårlig feltnavn-form). */
  rawMetrics: Record<string, unknown>;
  /** Attribution-baserte forretnings-metrics (leads/qualified/sales) — Phase 4. */
  businessMetrics?: Partial<ContentMetrics> | null;
  eventType?: MarketingEventType;
  correlationId?: string | null;
}

export async function ingestChannelMetrics(supabase: MarketingSupabaseLike, input: IngestChannelMetricsInput) {
  const platform = normalizeChannelMetrics(input.channel, input.rawMetrics);
  // Ownership: plattform-metrics er observed; attribution-metrics er canonical
  // (vinner ved overlap) — hindrer dobbelttelling.
  const metrics = combineMetrics({ observed: [platform], canonical: input.businessMetrics ?? undefined });
  const store = makeMarketingStore(supabase);
  return store.recordEvent({
    eventType: input.eventType ?? "content_viewed",
    brandId: input.brandId,
    contentId: input.contentId ?? undefined,
    channel: input.channel,
    genome: input.genome ?? undefined,
    metrics,
    correlationId: input.correlationId ?? undefined,
    metadata: { source: "unified_analytics", channel: input.channel },
  });
}
