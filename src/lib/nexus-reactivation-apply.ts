import type { ReactivationReplyClassification } from "@/lib/nexus-reactivation-reply";

export interface ReactivationApplyDecision {
  allowed: boolean;
  contactUpdates: Record<string, unknown>;
  createBuyerProfileRefreshWorkItem: boolean;
  reason: string;
}

function normalizedStatus(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export function buildReactivationApplyDecision(input: {
  classification: ReactivationReplyClassification;
  currentPipelineStatus?: string | null;
  replyOccurredAt: string;
}) : ReactivationApplyDecision {
  const { classification, replyOccurredAt } = input;
  const currentStatus = normalizedStatus(input.currentPipelineStatus);

  if (classification.intent === "stop") {
    return {
      allowed: true,
      contactUpdates: {
        nurture_status: "stopped",
        last_contact: replyOccurredAt,
        updated_at: replyOccurredAt,
      },
      createBuyerProfileRefreshWorkItem: false,
      reason: "Explicit stop signal: permanently stop nurture and preserve pipeline stage.",
    };
  }

  if (classification.intent === "reactivate_now") {
    const nextStatus = !currentStatus || currentStatus === "NEW" ? "CONTACT" : currentStatus;
    return {
      allowed: true,
      contactUpdates: {
        pipeline_status: nextStatus,
        nurture_status: "completed",
        last_contact: replyOccurredAt,
        updated_at: replyOccurredAt,
      },
      createBuyerProfileRefreshWorkItem: false,
      reason: "Explicit continued interest: mark real engagement and stop nurture automation while preserving earned qualification.",
    };
  }

  if (classification.intent === "update_preferences") {
    const nextStatus = !currentStatus || currentStatus === "NEW" ? "CONTACT" : currentStatus;
    return {
      allowed: true,
      contactUpdates: {
        pipeline_status: nextStatus,
        nurture_status: "completed",
        last_contact: replyOccurredAt,
        updated_at: replyOccurredAt,
      },
      createBuyerProfileRefreshWorkItem: true,
      reason: "Lead is active but needs refreshed Buyer Intelligence before new matching.",
    };
  }

  return {
    allowed: false,
    contactUpdates: {},
    createBuyerProfileRefreshWorkItem: false,
    reason: classification.intent === "follow_up_later"
      ? "Later intent requires an explicit follow-up date before a write is allowed."
      : "Unclear reply remains in human review.",
  };
}
