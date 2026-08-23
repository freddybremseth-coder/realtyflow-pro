/**
 * Phase 7 — Strategy Update. Director skriver IKKE om strategien etter én post.
 * En StrategyChange må være eksplisitt og evidens-basert, og går gjennom Policy
 * Engine (via resolveMarketingAutonomy) — på copilot krever den godkjenning.
 */

import { evidenceRank } from "../value-score";
import { resolveMarketingAutonomy, type MarketingAutonomyResult } from "./autonomy";
import { StrategyChangeSchema, type AutonomyLevel, type StrategyChange } from "./schemas";

export interface StrategyProposal {
  change: StrategyChange;
  autonomy: MarketingAutonomyResult;
  /** Har endringen nok evidens til i det hele tatt å vurderes? */
  evidenceOk: boolean;
  reason: string;
}

export interface StrategyOptions {
  /** Minste evidensnivå for å foreslå en endring (default reliable). */
  minEvidence?: "insufficient" | "directional" | "promising" | "reliable" | "strong";
}

/**
 * Foreslå en strategiendring. Krever minst `reliable` evidens ELLER
 * eksperiment-bekreftelse; ellers avvises den før den når Policy Engine. Selve
 * autonomien avgjøres av Policy Engine + nivå-tak.
 */
export function proposeStrategyChange(rawChange: StrategyChange, level: AutonomyLevel, opts: StrategyOptions = {}): StrategyProposal {
  const change = StrategyChangeSchema.parse(rawChange);
  const minEvidence = opts.minEvidence ?? "reliable";
  const evidenceOk = change.experimentBacked || evidenceRank(change.evidenceLevel) >= evidenceRank(minEvidence);

  const autonomy = resolveMarketingAutonomy("strategy_change", level, {
    confidence: evidenceOk ? 0.8 : 0.3,
    // Irreversible strategiendringer er mer sensitive.
    legalSensitive: change.reversibility === "irreversible",
  });

  const reason = !evidenceOk
    ? `Avvist: for svak evidens (${change.evidenceLevel}${change.experimentBacked ? "" : ", ikke eksperiment-bekreftet"}) — minst ${minEvidence} kreves.`
    : autonomy.reason;

  return { change, autonomy, evidenceOk, reason };
}
