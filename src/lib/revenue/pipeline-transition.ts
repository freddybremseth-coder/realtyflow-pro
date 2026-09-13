import { normalizeCustomerPipelineStatus } from "@/lib/customer-updates";
import { buildRevenueEventDedupeKey, insertRevenueEvent, type RevenueEventsSupabaseLike } from "@/lib/revenue/events";

export async function recordPipelineTransition(
  supabase: RevenueEventsSupabaseLike,
  input: {
    contactId: string;
    brandId?: string | null;
    previousStatus?: unknown;
    nextStatus?: unknown;
    occurredAt?: string | Date | null;
    actorType?: "human" | "ai" | "automation" | "system" | "customer" | "external";
    actorId?: string | null;
    salePriceEur?: number | null;
    commissionEur?: number | null;
    createdBy: string;
  },
) {
  const previousStatus = normalizeCustomerPipelineStatus(input.previousStatus);
  const nextStatus = normalizeCustomerPipelineStatus(input.nextStatus);
  if (!input.contactId || previousStatus === nextStatus) return { ok: true, skipped: true as const };
  const occurredAt = input.occurredAt instanceof Date ? input.occurredAt.toISOString() : String(input.occurredAt || new Date().toISOString());
  const auditResult = await insertRevenueEvent(supabase, {
    eventType: "contact_updated",
    title: `Pipeline: ${previousStatus} → ${nextStatus}`,
    contactId: input.contactId,
    brandId: input.brandId || null,
    sourceSystem: "crm_pipeline",
    sourceType: "pipeline_stage_changed",
    sourceId: input.contactId,
    actorType: input.actorType || "human",
    actorId: input.actorId || null,
    occurredAt,
    dedupeKey: buildRevenueEventDedupeKey(["pipeline-stage", input.contactId, previousStatus, nextStatus, occurredAt]),
    metadata: { previous_status: previousStatus, next_status: nextStatus },
    createdBy: input.createdBy,
  });

  const outcomeType = nextStatus === "QUALIFIED"
    ? "qualified"
    : nextStatus === "WON"
      ? "deal_won"
      : null;
  let outcomeResult = null;
  if (outcomeType && input.brandId) {
    outcomeResult = await insertRevenueEvent(supabase, {
      eventType: outcomeType,
      title: outcomeType === "qualified" ? "Lead kvalifisert i CRM" : "Salg vunnet i CRM",
      contactId: input.contactId,
      brandId: input.brandId,
      sourceSystem: "crm_pipeline",
      sourceType: "pipeline_status",
      sourceId: input.contactId,
      actorType: input.actorType || "human",
      actorId: input.actorId || null,
      revenueImpactEur: outcomeType === "deal_won" ? input.salePriceEur ?? null : null,
      occurredAt,
      dedupeKey: buildRevenueEventDedupeKey(["pipeline-outcome", input.brandId, input.contactId, outcomeType]),
      metadata: {
        previous_status: previousStatus,
        next_status: nextStatus,
        sale_price_eur: outcomeType === "deal_won" ? input.salePriceEur ?? null : null,
        commission_eur: outcomeType === "deal_won" ? input.commissionEur ?? null : null,
      },
      createdBy: input.createdBy,
    });
  }

  return {
    ...auditResult,
    skipped: false as const,
    previousStatus,
    nextStatus,
    outcomeType,
    outcomeResult,
    outcomeSkippedReason: outcomeType && !input.brandId ? "brand_id_required" : null,
  };
}
