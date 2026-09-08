export type AutopilotTier = "AUTO" | "REVIEW" | "FREDDY";
export type AutopilotRisk = "low" | "medium" | "high" | "critical";
export type AutopilotActionType =
  | "data_update"
  | "buyer_profile_activation"
  | "property_matching"
  | "property_delivery"
  | "customer_message"
  | "pipeline_transition"
  | "content_publish"
  | "financial"
  | "legal"
  | "negotiation"
  | "other";

export interface AutopilotSafetyInput {
  actionType: AutopilotActionType;
  risk: AutopilotRisk;
  confidence?: number | null;
  externalSideEffect?: boolean;
  irreversible?: boolean;
  verifiedRecipient?: boolean;
  doNotContact?: boolean;
  consentKnown?: boolean;
  conflictingEvidence?: boolean;
  requiredDataComplete?: boolean;
  matchScore?: number | null;
  monetaryValueEur?: number | null;
  currentStage?: string | null;
  targetStage?: string | null;
}

export interface AutopilotSafetyDecision {
  tier: AutopilotTier;
  allowed: boolean;
  reason: string;
  requiresAudit: true;
}

const AUTO_CONFIDENCE = 0.95;
const REVIEW_CONFIDENCE = 0.8;
const AUTO_MATCH_SCORE = 90;

function confidence(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stage(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function freddy(reason: string, allowed = true): AutopilotSafetyDecision {
  return { tier: "FREDDY", allowed, reason, requiresAudit: true };
}

function review(reason: string): AutopilotSafetyDecision {
  return { tier: "REVIEW", allowed: true, reason, requiresAudit: true };
}

function auto(reason: string): AutopilotSafetyDecision {
  return { tier: "AUTO", allowed: true, reason, requiresAudit: true };
}

/**
 * Central deterministic safety policy for RealtyFlow Pro autonomy.
 *
 * Precedence matters: explicit safety blockers and high-stakes actions are
 * evaluated before confidence-based automation. Callers may become more
 * conservative, but must not override a FREDDY/block decision to AUTO.
 */
export function decideAutopilotTier(input: AutopilotSafetyInput): AutopilotSafetyDecision {
  const conf = confidence(input.confidence);

  if (input.doNotContact && (input.actionType === "customer_message" || input.actionType === "property_delivery")) {
    return freddy("Contact is suppressed/do-not-contact; outbound action is blocked", false);
  }

  if (input.conflictingEvidence) {
    return freddy("Conflicting evidence requires human resolution before execution");
  }

  if (input.irreversible || input.risk === "critical") {
    return freddy("Critical or irreversible action requires Freddy");
  }

  if (["legal", "financial", "negotiation"].includes(input.actionType)) {
    return freddy("Legal, financial and negotiation actions remain human-controlled");
  }

  if ((input.monetaryValueEur || 0) >= 25_000) {
    return freddy("High-value action exceeds autonomous monetary threshold");
  }

  if (input.requiredDataComplete === false) {
    return review("Required data is incomplete");
  }

  if (input.actionType === "customer_message" || input.actionType === "property_delivery") {
    if (!input.verifiedRecipient) return freddy("Outbound recipient is not verified", false);
    if (input.consentKnown === false) return freddy("Outbound consent state is unsafe or unknown", false);
    if (conf < REVIEW_CONFIDENCE) return freddy("Outbound confidence is below review threshold");
    if (conf < AUTO_CONFIDENCE) return review("Outbound action needs review because confidence is below auto threshold");
    if (input.actionType === "property_delivery" && (input.matchScore || 0) < AUTO_MATCH_SCORE) {
      return review("Property match is below automatic delivery threshold");
    }
    return auto("Verified low-risk outbound action meets confidence and safety thresholds");
  }

  if (input.actionType === "buyer_profile_activation") {
    if (conf >= AUTO_CONFIDENCE) return auto("Buyer Profile evidence is complete and high-confidence");
    if (conf >= REVIEW_CONFIDENCE) return review("Buyer Profile is suitable for quick review");
    return freddy("Buyer Profile confidence is too low for governed activation");
  }

  if (input.actionType === "pipeline_transition") {
    const from = stage(input.currentStage);
    const to = stage(input.targetStage);
    const safeForward = (from === "NEW" && to === "CONTACT") || (from === "CONTACT" && to === "QUALIFIED");
    if (safeForward && conf >= AUTO_CONFIDENCE) return auto("Low-risk forward pipeline transition is strongly supported");
    if (["WON", "LOST"].includes(to)) return freddy("Terminal pipeline stages require Freddy or an explicit governed outcome rule");
    return review("Pipeline transition needs review until stage-specific evidence rules are satisfied");
  }

  if (input.risk === "high") return freddy("High-risk action requires Freddy");
  if (input.risk === "medium") return review("Medium-risk action requires review");

  if (input.externalSideEffect && conf < AUTO_CONFIDENCE) {
    return review("External side effect does not meet automatic confidence threshold");
  }

  return auto("Low-risk action is safe for autonomous execution");
}

export function canExecuteAutomatically(input: AutopilotSafetyInput) {
  const decision = decideAutopilotTier(input);
  return decision.allowed && decision.tier === "AUTO";
}
