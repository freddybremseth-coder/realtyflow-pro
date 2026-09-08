import { decideAutopilotTier, type AutopilotSafetyDecision } from "@/lib/autopilot/safety-model";
import type { PersonaBackfillCandidate } from "@/lib/persona-backfill";

export type BuyerProfileCompletenessInput = {
  score: number;
  missing: string[];
};

export type BuyerProfileAutoActivationDecision = {
  safety: AutopilotSafetyDecision;
  personaAutoEligible: boolean;
  canAutoActivate: boolean;
  personaEvidenceComplete: boolean;
  profileComplete: boolean;
  confidence: number;
  reason: string;
};

export function decideBuyerProfileAutoActivation(
  candidate: PersonaBackfillCandidate,
  completeness: BuyerProfileCompletenessInput,
): BuyerProfileAutoActivationDecision {
  const confidence = Math.max(0, Math.min(1, Number(candidate.confidence || 0) / 100));
  const hasPersona = Boolean(candidate.persona);
  const personaEvidenceComplete = hasPersona && candidate.missingInformation.length === 0;
  const profileComplete = Number(completeness.score || 0) === 100 && completeness.missing.length === 0;
  const requiredDataComplete = personaEvidenceComplete && profileComplete;

  const safety = decideAutopilotTier({
    actionType: "buyer_profile_activation",
    risk: "low",
    confidence,
    externalSideEffect: false,
    irreversible: false,
    // A candidate without a deterministic persona should be governed by its
    // low confidence rather than promoted to REVIEW only because fields are
    // incomplete.
    requiredDataComplete: hasPersona ? requiredDataComplete : true,
  });

  const personaAutoEligible = Boolean(
    hasPersona
    && personaEvidenceComplete
    && confidence >= 0.95,
  );

  const canAutoActivate = Boolean(
    personaAutoEligible
    && profileComplete
    && safety.allowed
    && safety.tier === "AUTO",
  );

  const reason = canAutoActivate
    ? "Buyer Profile is 100% complete by the Customer 360 contract and Persona evidence meets the central 95% AUTO gate."
    : !hasPersona
      ? "No deterministic Persona is available for autonomous activation."
      : !personaEvidenceComplete
        ? `Persona evidence is incomplete: ${candidate.missingInformation.join(", ") || "unknown fields"}.`
        : !profileComplete
          ? `Buyer Profile is not complete by the Customer 360 contract: ${completeness.missing.join(", ") || "completeness below 100%"}.`
          : safety.reason;

  return {
    safety,
    personaAutoEligible,
    canAutoActivate,
    personaEvidenceComplete,
    profileComplete,
    confidence,
    reason,
  };
}
