import { decideAutopilotTier, type AutopilotSafetyDecision } from "@/lib/autopilot/safety-model";
import type { PersonaBackfillCandidate } from "@/lib/persona-backfill";

export type BuyerProfileAutoActivationDecision = {
  safety: AutopilotSafetyDecision;
  canAutoActivate: boolean;
  requiredDataComplete: boolean;
  confidence: number;
  reason: string;
};

export function decideBuyerProfileAutoActivation(
  candidate: PersonaBackfillCandidate,
): BuyerProfileAutoActivationDecision {
  const confidence = Math.max(0, Math.min(1, Number(candidate.confidence || 0) / 100));
  const hasPersona = Boolean(candidate.persona);
  const requiredDataComplete = hasPersona && candidate.missingInformation.length === 0;

  const safety = decideAutopilotTier({
    actionType: "buyer_profile_activation",
    risk: "low",
    confidence,
    externalSideEffect: false,
    irreversible: false,
    // When there is no deterministic persona the low confidence must drive the
    // central policy to FREDDY rather than treating missing profile fields as a
    // merely incomplete-but-reviewable candidate.
    requiredDataComplete: hasPersona ? requiredDataComplete : true,
  });

  const canAutoActivate = Boolean(
    hasPersona
    && requiredDataComplete
    && safety.allowed
    && safety.tier === "AUTO",
  );

  const reason = canAutoActivate
    ? "Complete Buyer Profile Persona evidence meets the central 95% AUTO gate."
    : !hasPersona
      ? "No deterministic Persona is available for autonomous activation."
      : !requiredDataComplete
        ? `Required Buyer Profile evidence is incomplete: ${candidate.missingInformation.join(", ") || "unknown fields"}.`
        : safety.reason;

  return {
    safety,
    canAutoActivate,
    requiredDataComplete,
    confidence,
    reason,
  };
}
