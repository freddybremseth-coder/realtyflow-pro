export type PortalIntentSignal =
  | "session_active"
  | "property_view"
  | "repeat_property_view"
  | "preferences_updated"
  | "property_interested"
  | "customer_message";

export type PortalIntentDecision = {
  hotLead: boolean;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  responseMinutes: number | null;
  aiScore: number;
  operationalTarget: "PORTAL_ACTIVITY" | "PROPERTY_MATCHING" | "BUYER_PROFILE" | "CUSTOMER_REPLY";
  createWorkItem: boolean;
  reason: string;
};

const POLICY: Record<PortalIntentSignal, PortalIntentDecision> = {
  session_active: {
    hotLead: false,
    priority: "LOW",
    responseMinutes: null,
    aiScore: 45,
    operationalTarget: "PORTAL_ACTIVITY",
    createWorkItem: false,
    reason: "Authenticated customer is active in the portal",
  },
  property_view: {
    hotLead: false,
    priority: "MEDIUM",
    responseMinutes: null,
    aiScore: 62,
    operationalTarget: "PROPERTY_MATCHING",
    createWorkItem: false,
    reason: "Customer viewed a property while signed in",
  },
  repeat_property_view: {
    hotLead: true,
    priority: "HIGH",
    responseMinutes: 30,
    aiScore: 88,
    operationalTarget: "PROPERTY_MATCHING",
    createWorkItem: true,
    reason: "Customer returned to the same property repeatedly",
  },
  preferences_updated: {
    hotLead: true,
    priority: "HIGH",
    responseMinutes: 15,
    aiScore: 92,
    operationalTarget: "BUYER_PROFILE",
    createWorkItem: true,
    reason: "Customer changed buying criteria",
  },
  property_interested: {
    hotLead: true,
    priority: "CRITICAL",
    responseMinutes: 5,
    aiScore: 98,
    operationalTarget: "PROPERTY_MATCHING",
    createWorkItem: true,
    reason: "Customer marked a specific property as interesting",
  },
  customer_message: {
    hotLead: true,
    priority: "HIGH",
    responseMinutes: 10,
    aiScore: 94,
    operationalTarget: "CUSTOMER_REPLY",
    createWorkItem: true,
    reason: "Customer sent a message from the portal",
  },
};

export function decidePortalIntent(signal: PortalIntentSignal): PortalIntentDecision {
  return { ...POLICY[signal] };
}

export function portalResponseDueAt(nowIso: string, responseMinutes: number | null) {
  if (!responseMinutes) return null;
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("Invalid portal intent timestamp");
  return new Date(now + responseMinutes * 60_000).toISOString();
}

export function portalWorkItemMetadata(signal: PortalIntentSignal, nowIso: string) {
  const decision = decidePortalIntent(signal);
  return {
    portal_signal: signal,
    hot_lead: decision.hotLead,
    response_sla_minutes: decision.responseMinutes,
    response_due_at: portalResponseDueAt(nowIso, decision.responseMinutes),
    operational_target: decision.operationalTarget,
    stage_readiness_href: decision.operationalTarget === "CUSTOMER_REPLY" ? "/nexus-os/replies" : "/pipeline",
    intent_reason: decision.reason,
  };
}
