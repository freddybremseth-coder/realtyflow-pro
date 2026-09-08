import type { InboundReplyClassification, InboundReplyIntent } from "@/lib/inbound-reply-intelligence";

export type HotLeadPriority = "CRITICAL" | "HIGH" | "MEDIUM";

export interface HotLeadSlaDecision {
  isHotLead: boolean;
  priority: HotLeadPriority;
  responseMinutes: number | null;
  aiScore: number;
  reason: string;
  operationalTarget: "VIEWING" | "PROPERTY_MATCHING" | "BUYER_PROFILE" | "CUSTOMER_REPLY" | "REVIEW";
}

const HOT_LEAD_POLICY: Record<InboundReplyIntent, HotLeadSlaDecision> = {
  viewing_request: {
    isHotLead: true,
    priority: "CRITICAL",
    responseMinutes: 5,
    aiScore: 99,
    reason: "Explicit viewing request",
    operationalTarget: "VIEWING",
  },
  property_interest: {
    isHotLead: true,
    priority: "CRITICAL",
    responseMinutes: 5,
    aiScore: 98,
    reason: "Specific property interest",
    operationalTarget: "PROPERTY_MATCHING",
  },
  active_interest: {
    isHotLead: true,
    priority: "HIGH",
    responseMinutes: 10,
    aiScore: 95,
    reason: "Customer confirms active buying interest",
    operationalTarget: "PROPERTY_MATCHING",
  },
  update_preferences: {
    isHotLead: true,
    priority: "HIGH",
    responseMinutes: 15,
    aiScore: 92,
    reason: "Customer changed buying criteria",
    operationalTarget: "BUYER_PROFILE",
  },
  question: {
    isHotLead: true,
    priority: "HIGH",
    responseMinutes: 10,
    aiScore: 90,
    reason: "Customer asks a commercial question",
    operationalTarget: "CUSTOMER_REPLY",
  },
  follow_up_later: {
    isHotLead: false,
    priority: "MEDIUM",
    responseMinutes: null,
    aiScore: 75,
    reason: "Customer requests later follow-up",
    operationalTarget: "CUSTOMER_REPLY",
  },
  purchased_elsewhere: {
    isHotLead: false,
    priority: "MEDIUM",
    responseMinutes: null,
    aiScore: 25,
    reason: "Customer reports a completed purchase elsewhere",
    operationalTarget: "REVIEW",
  },
  no_longer_buying: {
    isHotLead: false,
    priority: "MEDIUM",
    responseMinutes: null,
    aiScore: 20,
    reason: "Customer explicitly ended the buying journey",
    operationalTarget: "REVIEW",
  },
  do_not_contact: {
    isHotLead: false,
    priority: "MEDIUM",
    responseMinutes: null,
    aiScore: 100,
    reason: "Suppression safety event",
    operationalTarget: "REVIEW",
  },
  unclear: {
    isHotLead: false,
    priority: "MEDIUM",
    responseMinutes: null,
    aiScore: 60,
    reason: "Intent unclear",
    operationalTarget: "REVIEW",
  },
};

export function decideHotLeadSla(classification: Pick<InboundReplyClassification, "intent" | "requiresFastResponse">): HotLeadSlaDecision {
  const base = HOT_LEAD_POLICY[classification.intent];
  if (classification.requiresFastResponse && !base.isHotLead) {
    return { ...base, isHotLead: true, priority: "HIGH", responseMinutes: 10, aiScore: Math.max(base.aiScore, 90) };
  }
  return { ...base };
}

export function responseDueAt(nowIso: string, responseMinutes: number | null): string | null {
  if (!responseMinutes) return null;
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) throw new Error("Invalid SLA base timestamp");
  return new Date(nowMs + responseMinutes * 60_000).toISOString();
}
