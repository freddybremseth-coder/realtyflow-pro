import type { CommandAction } from "@/lib/revenue/command";

export type NexusActionPolicyClass = "AUTO_SAFE" | "DRAFT_ONLY" | "HUMAN_REQUIRED" | "WAIT" | "FORBIDDEN";

export type NexusActionType =
  | "crm_note_update"
  | "buyer_profile_exact_evidence_update"
  | "property_match_prepare"
  | "shortlist_draft_prepare"
  | "presentation_draft_prepare"
  | "criteria_clarification_email"
  | "general_customer_message"
  | "property_recommendation_send"
  | "viewing_booking"
  | "ambiguous_criteria_change"
  | "closing_decision"
  | "commission_decision"
  | "commercial_approval"
  | "legal_or_contract_commitment"
  | "price_or_availability_guarantee"
  | "wait";

export interface NexusActionPolicy {
  actionType: NexusActionType;
  policyClass: NexusActionPolicyClass;
  reversible: boolean;
  customerFacing: boolean;
  sideEffect: boolean;
  requiresFreshSafetyCheck: boolean;
  reason: string;
}

const POLICIES: Record<NexusActionType, NexusActionPolicy> = {
  crm_note_update: {
    actionType: "crm_note_update",
    policyClass: "AUTO_SAFE",
    reversible: true,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: false,
    reason: "Internal CRM note updates are reversible, auditable and do not contact the customer.",
  },
  buyer_profile_exact_evidence_update: {
    actionType: "buyer_profile_exact_evidence_update",
    policyClass: "AUTO_SAFE",
    reversible: true,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: false,
    reason: "Only exact, high-confidence customer evidence may update an approved Buyer Profile through the governed versioned flow.",
  },
  property_match_prepare: {
    actionType: "property_match_prepare",
    policyClass: "AUTO_SAFE",
    reversible: true,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: false,
    reason: "Internal property matching prepares candidates but does not send or approve anything for the customer.",
  },
  shortlist_draft_prepare: {
    actionType: "shortlist_draft_prepare",
    policyClass: "AUTO_SAFE",
    reversible: true,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: false,
    reason: "A review-only shortlist draft is internal and remains subject to human quality review.",
  },
  presentation_draft_prepare: {
    actionType: "presentation_draft_prepare",
    policyClass: "AUTO_SAFE",
    reversible: true,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: false,
    reason: "Presentation and message drafts may be prepared automatically but are not customer sends.",
  },
  criteria_clarification_email: {
    actionType: "criteria_clarification_email",
    policyClass: "AUTO_SAFE",
    reversible: false,
    customerFacing: true,
    sideEffect: true,
    requiresFreshSafetyCheck: true,
    reason: "This narrowly authorized customer email may ask only for missing buyer criteria and must pass suppression, brand and send-safety checks.",
  },
  general_customer_message: {
    actionType: "general_customer_message",
    policyClass: "DRAFT_ONLY",
    reversible: true,
    customerFacing: true,
    sideEffect: false,
    requiresFreshSafetyCheck: true,
    reason: "Nexus may draft general customer communication, but sending requires a separate explicit policy or human approval.",
  },
  property_recommendation_send: {
    actionType: "property_recommendation_send",
    policyClass: "HUMAN_REQUIRED",
    reversible: false,
    customerFacing: true,
    sideEffect: true,
    requiresFreshSafetyCheck: true,
    reason: "Sending property recommendations is commercially meaningful and remains behind explicit human send approval.",
  },
  viewing_booking: {
    actionType: "viewing_booking",
    policyClass: "HUMAN_REQUIRED",
    reversible: false,
    customerFacing: true,
    sideEffect: true,
    requiresFreshSafetyCheck: true,
    reason: "Viewing bookings create external commitments and require explicit human confirmation under the current policy.",
  },
  ambiguous_criteria_change: {
    actionType: "ambiguous_criteria_change",
    policyClass: "HUMAN_REQUIRED",
    reversible: true,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: false,
    reason: "Ambiguous customer language must be interpreted by a human rather than guessed by Nexus.",
  },
  closing_decision: {
    actionType: "closing_decision",
    policyClass: "HUMAN_REQUIRED",
    reversible: false,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: true,
    reason: "Closing decisions can affect contracts, money and legal obligations.",
  },
  commission_decision: {
    actionType: "commission_decision",
    policyClass: "HUMAN_REQUIRED",
    reversible: false,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: true,
    reason: "Commission actions affect financial claims and require human judgment.",
  },
  commercial_approval: {
    actionType: "commercial_approval",
    policyClass: "HUMAN_REQUIRED",
    reversible: false,
    customerFacing: false,
    sideEffect: true,
    requiresFreshSafetyCheck: true,
    reason: "Commercial approvals remain a human decision boundary.",
  },
  legal_or_contract_commitment: {
    actionType: "legal_or_contract_commitment",
    policyClass: "FORBIDDEN",
    reversible: false,
    customerFacing: true,
    sideEffect: true,
    requiresFreshSafetyCheck: true,
    reason: "Nexus must not autonomously enter, alter or promise legally binding contractual commitments.",
  },
  price_or_availability_guarantee: {
    actionType: "price_or_availability_guarantee",
    policyClass: "FORBIDDEN",
    reversible: false,
    customerFacing: true,
    sideEffect: true,
    requiresFreshSafetyCheck: true,
    reason: "Nexus must not guarantee price, availability, scarcity or other facts that require fresh external verification.",
  },
  wait: {
    actionType: "wait",
    policyClass: "WAIT",
    reversible: true,
    customerFacing: false,
    sideEffect: false,
    requiresFreshSafetyCheck: false,
    reason: "The correct action is to wait until a meaningful new signal or scheduled follow-up point exists.",
  },
};

export function getNexusActionPolicy(actionType: NexusActionType): NexusActionPolicy {
  return POLICIES[actionType];
}

export function listNexusActionPolicies(): NexusActionPolicy[] {
  return Object.values(POLICIES);
}

export function policyForRevenueAction(action: Pick<CommandAction, "source">): NexusActionPolicy {
  if (action.source === "closing") return POLICIES.closing_decision;
  if (action.source === "commissions") return POLICIES.commission_decision;
  if (action.source === "approvals") return POLICIES.commercial_approval;
  if (action.source === "today" || action.source === "recovery" || action.source === "service-revenue" || action.source === "after-sales") {
    return POLICIES.general_customer_message;
  }
  return POLICIES.wait;
}

export function canExecuteAutomatically(policy: NexusActionPolicy): boolean {
  return policy.policyClass === "AUTO_SAFE";
}
