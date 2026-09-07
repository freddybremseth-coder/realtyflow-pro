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
    createdBy: string;
  },
) {
  const previousStatus = normalizeCustomerPipelineStatus(input.previousStatus);
  const nextStatus = normalizeCustomerPipelineStatus(input.nextStatus);
  if (!input.contactId || previousStatus === nextStatus) return { ok: true, skipped: true as const };
  const occurredAt = input.occurredAt instanceof Date ? input.occurredAt.toISOString() : String(input.occurredAt || new Date().toISOString());
  const result = await insertRevenueEvent(supabase, {
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
  return { ...result, skipped: false as const, previousStatus, nextStatus };
}
