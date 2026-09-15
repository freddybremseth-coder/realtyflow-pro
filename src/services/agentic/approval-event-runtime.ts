import { buildRevenueEventDedupeKey, insertRevenueEvent, type RevenueEventsSupabaseLike } from "@/lib/revenue/events";
import type { GatewayOutcomeEvent } from "@/lib/agentic/approval-gateway";
import { resolveReceiptIdentity } from "@/services/agentic/receipt-identity";

export function makeApprovalDecisionPublisher(supabase: RevenueEventsSupabaseLike) {
  return async (event: GatewayOutcomeEvent): Promise<void> => {
    const identity = await resolveReceiptIdentity(supabase, event.customerRef);
    const isMessageApproval = event.outcome === "approved" && event.subjectType === "message_draft";

    await insertRevenueEvent(supabase, {
      eventType: isMessageApproval ? "message_approved" : "note",
      title: event.title,
      contactId: identity.contactId,
      brandId: identity.brandId,
      sourceSystem: "agentic_approval_gateway",
      sourceType: "approval_decision",
      sourceId: event.approvalId,
      actorType: "human",
      revenueImpactEur: null,
      dedupeKey: buildRevenueEventDedupeKey(["agentic-approval", event.approvalId, event.outcome]),
      metadata: {
        approval_id: event.approvalId,
        run_id: event.runId ?? null,
        correlation_id: event.correlationId ?? null,
        approval_outcome: event.outcome,
        gated_action_class: event.gatedActionClass,
        subject_type: event.subjectType,
        subject_ref: event.subjectRef ?? null,
        customer_ref: event.customerRef ?? null,
        contact_resolution: identity.resolution,
        estimated_opportunity_eur: event.revenueImpactEur ?? null,
        execution_proof: false,
      },
      createdBy: "agentic-approval-gateway",
    });
  };
}
