/**
 * Marketing Growth OS — Marketing Event Backbone (Phase 1).
 *
 * Standardiserte hendelser for hele markedsføringssløyfen. Alt lagres i
 * marketing_events (med genome + metrics + business value), og de revenue-
 * relevante hendelsene (lead attribuert osv.) speiles til revenue_events —
 * det delte nervesystemet — så markedsføring og salg henger sammen.
 */

import type { ContentGenome, MarketingChannel } from "./genome";
import { businessValueScore, type ContentMetrics } from "./value-score";
import type { RevenueEventInput } from "@/lib/revenue/events";

export const MARKETING_EVENT_TYPES = [
  "content_created",
  "content_approved",
  "content_published",
  "content_viewed",
  "content_clicked",
  /** Canonical cumulative channel snapshot. Exactly one current row per content/channel. */
  "metrics_snapshot",
  "lead_attributed",
  "qualified_lead",
  "experiment_started",
  "experiment_completed",
  "learning_created",
] as const;
export type MarketingEventType = (typeof MARKETING_EVENT_TYPES)[number];

export interface MarketingEventInput {
  eventType: MarketingEventType;
  brandId: string;
  contentId?: string | null;
  channel?: MarketingChannel | null;
  genome?: ContentGenome | null;
  metrics?: ContentMetrics | null;
  revenueImpactEur?: number | null;
  occurredAt?: string | Date | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MarketingEventPayload {
  event_type: MarketingEventType;
  brand_id: string;
  content_id: string | null;
  channel: string | null;
  genome: ContentGenome | null;
  metrics: ContentMetrics | null;
  business_value: number;
  revenue_impact_eur: number | null;
  occurred_at: string;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
}

export function isMarketingEventType(v: unknown): v is MarketingEventType {
  return MARKETING_EVENT_TYPES.includes(v as MarketingEventType);
}

export function normalizeMarketingEvent(input: MarketingEventInput): MarketingEventPayload {
  if (!isMarketingEventType(input.eventType)) throw new Error(`Ukjent marketing-event: ${input.eventType}`);
  if (!input.brandId?.trim()) throw new Error("brandId er påkrevd");
  const occurred = input.occurredAt ? new Date(input.occurredAt) : new Date();
  return {
    event_type: input.eventType,
    brand_id: input.brandId.trim(),
    content_id: input.contentId ?? null,
    channel: input.channel ?? input.genome?.channel ?? null,
    genome: input.genome ?? null,
    metrics: input.metrics ?? null,
    business_value: input.metrics ? businessValueScore(input.metrics) : 0,
    revenue_impact_eur: input.revenueImpactEur ?? null,
    occurred_at: Number.isNaN(occurred.getTime()) ? new Date().toISOString() : occurred.toISOString(),
    correlation_id: input.correlationId ?? null,
    metadata: input.metadata ?? {},
  };
}

/** Revenue-relevante marketing-events som skal speiles til revenue_events. */
const REVENUE_BRIDGE: Partial<Record<MarketingEventType, { eventType: RevenueEventInput["eventType"]; actorType: RevenueEventInput["actorType"] }>> = {
  lead_attributed: { eventType: "lead_created", actorType: "external" },
  qualified_lead: { eventType: "note", actorType: "automation" },
};

/**
 * Bygg et revenue_events-innslag for en marketing-hendelse — eller null hvis
 * hendelsen ikke er revenue-relevant (da lever den kun i marketing_events).
 */
export function revenueEventForMarketing(input: MarketingEventInput): RevenueEventInput | null {
  const map = REVENUE_BRIDGE[input.eventType];
  if (!map) return null;
  const g = input.genome;
  return {
    eventType: map.eventType,
    actorType: map.actorType,
    brandId: input.brandId,
    title: input.eventType === "lead_attributed" ? "Lead fra markedsføring" : "Kvalifisert lead (markedsføring)",
    revenueImpactEur: input.revenueImpactEur ?? null,
    occurredAt: input.occurredAt ?? null,
    metadata: {
      marketing_source: true,
      marketing_event: input.eventType,
      channel: input.channel ?? g?.channel ?? null,
      content_id: input.contentId ?? null,
      genome_signature: g ? `${g.channel}|${g.format}|${g.hookType ?? "?"}|${g.area ?? "?"}` : null,
    },
  };
}
