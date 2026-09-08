import { decideAutopilotTier, type AutopilotSafetyDecision } from "@/lib/autopilot/safety-model";

export type InboundReplyIntent =
  | "do_not_contact"
  | "purchased_elsewhere"
  | "active_interest"
  | "property_interest"
  | "update_preferences"
  | "viewing_request"
  | "follow_up_later"
  | "question"
  | "unclear";

export interface InboundReplyClassification {
  intent: InboundReplyIntent;
  confidence: number;
  reasons: string[];
  proposedPipelineAction:
    | "suppress_contact"
    | "mark_lost_purchased_elsewhere"
    | "move_to_contact"
    | "refresh_buyer_profile"
    | "prioritize_property_match"
    | "prioritize_viewing"
    | "schedule_followup"
    | "prepare_answer"
    | "manual_review";
  shouldPauseNurture: boolean;
  shouldStopNurture: boolean;
  shouldRefreshBuyerProfile: boolean;
  shouldRunPropertyMatching: boolean;
  requiresFastResponse: boolean;
}

export interface GovernedInboundReplyDecision {
  classification: InboundReplyClassification;
  safety: AutopilotSafetyDecision;
  canApplyAutomatically: boolean;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function result(
  intent: InboundReplyIntent,
  confidence: number,
  proposedPipelineAction: InboundReplyClassification["proposedPipelineAction"],
  reasons: string[],
  overrides: Partial<InboundReplyClassification> = {},
): InboundReplyClassification {
  return {
    intent,
    confidence,
    reasons,
    proposedPipelineAction,
    shouldPauseNurture: false,
    shouldStopNurture: false,
    shouldRefreshBuyerProfile: false,
    shouldRunPropertyMatching: false,
    requiresFastResponse: false,
    ...overrides,
  };
}

export function classifyInboundReply(input: { subject?: string | null; body?: string | null }): InboundReplyClassification {
  const text = normalize(`${input.subject || ""} ${input.body || ""}`);

  const dnc = /\b(do not contact|don't contact|dont contact|stop contacting|unsubscribe|remove me|avmeld|ikke kontakt|ikke send|stopp e-?post|stopp mail)\b/i.test(text);
  if (dnc) return result("do_not_contact", 0.995, "suppress_contact", ["Explicit do-not-contact signal detected."], { shouldStopNurture: true });

  const purchasedElsewhere = /\b(already bought|already purchased|bought (a |the )?(house|home|property|apartment|villa)|purchased elsewhere|bought elsewhere|we bought|i bought|har kjøpt|kjøpt bolig|kjøpt hus|kjøpt leilighet|kjøpt et annet sted|allerede kjøpt)\b/i.test(text);
  if (purchasedElsewhere) return result("purchased_elsewhere", 0.98, "mark_lost_purchased_elsewhere", ["Customer states that a property has already been purchased."], { shouldStopNurture: true });

  const viewing = /\b(viewing|view it|see the property|see this property|book a viewing|schedule a viewing|visning|se boligen|se denne|kan vi se|booke visning|avtale visning)\b/i.test(text);
  if (viewing) return result("viewing_request", 0.97, "prioritize_viewing", ["Explicit viewing intent detected."], { shouldPauseNurture: true, requiresFastResponse: true, shouldRunPropertyMatching: true });

  const specificProperty = /\b(this property|that property|the apartment|the villa|the house|denne boligen|den boligen|denne leiligheten|denne villaen|ref\.?\s*[a-z0-9-]+|reference\s*[a-z0-9-]+)\b/i.test(text) || /https?:\/\//i.test(text);
  if (specificProperty) return result("property_interest", 0.93, "prioritize_property_match", ["Customer references a specific property or property link."], { shouldPauseNurture: true, shouldRunPropertyMatching: true, requiresFastResponse: true });

  const changed = /\b(changed|different area|different budget|new budget|other area|other location|requirements changed|endret|andre ønsker|annet område|nytt budsjett|annet budsjett|ser etter noe annet)\b/i.test(text);
  if (changed) return result("update_preferences", 0.91, "refresh_buyer_profile", ["Customer indicates changed buying requirements."], { shouldPauseNurture: true, shouldRefreshBuyerProfile: true, shouldRunPropertyMatching: true });

  const later = /\b(later|next year|in a few months|not now|after summer|after christmas|senere|neste år|om noen måneder|ikke nå|etter sommeren|etter jul)\b/i.test(text);
  if (later) return result("follow_up_later", 0.9, "schedule_followup", ["Customer asks for a later follow-up."], { shouldPauseNurture: true });

  const active = /\b(still interested|still looking|interested|yes we are|yes i am|ready to buy|ready to move forward|fortsatt interessert|fortsatt aktuelt|vi ser fortsatt|jeg ser fortsatt|interessert|klar til å kjøpe|aktuelt)\b/i.test(text);
  if (active) return result("active_interest", 0.91, "move_to_contact", ["Customer confirms active buying interest."], { shouldPauseNurture: true, shouldRunPropertyMatching: true, requiresFastResponse: true });

  const question = /\?|\b(can you|could you|what is|how much|is it available|available\?|kan du|hva er|hvor mye|er den ledig|er boligen tilgjengelig)\b/i.test(text);
  if (question) return result("question", 0.82, "prepare_answer", ["Inbound message contains a customer question."], { shouldPauseNurture: true, requiresFastResponse: true });

  return result("unclear", 0.35, "manual_review", ["No sufficiently clear commercial intent detected."], { shouldPauseNurture: true });
}

export function governInboundReply(classification: InboundReplyClassification): GovernedInboundReplyDecision {
  if (classification.intent === "do_not_contact") {
    const safety: AutopilotSafetyDecision = { tier: "AUTO", allowed: true, reason: "Explicit do-not-contact request should be honored immediately", requiresAudit: true };
    return { classification, safety, canApplyAutomatically: true };
  }

  if (classification.intent === "purchased_elsewhere") {
    const safety = decideAutopilotTier({ actionType: "pipeline_transition", risk: "medium", confidence: classification.confidence, currentStage: "QUALIFIED", targetStage: "LOST" });
    return { classification, safety, canApplyAutomatically: safety.tier === "AUTO" && safety.allowed };
  }

  if (classification.intent === "active_interest") {
    const safety = decideAutopilotTier({ actionType: "pipeline_transition", risk: "low", confidence: classification.confidence, currentStage: "NEW", targetStage: "CONTACT" });
    return { classification, safety, canApplyAutomatically: safety.tier === "AUTO" && safety.allowed };
  }

  const risk = classification.intent === "unclear" ? "high" : "medium";
  const safety = decideAutopilotTier({ actionType: classification.shouldRefreshBuyerProfile ? "buyer_profile_activation" : "data_update", risk, confidence: classification.confidence, requiredDataComplete: classification.intent !== "unclear" });
  return { classification, safety, canApplyAutomatically: safety.tier === "AUTO" && safety.allowed };
}
