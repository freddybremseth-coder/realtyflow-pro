/**
 * Agentic Core 1.0 — autonomi-formelen.
 *
 * AUTONOMY = Confidence × Historical Accuracy × Data Quality
 *          × Reversibility × Permission × Risk
 *
 * Hver faktor er 0..1. Produktet gir en autonomi-score (0..1). En agent kan
 * være 99 % korrekt og likevel gjøre én dyr feil — derfor senker høy risiko og
 * lav reversibilitet autonomien multiplikativt, i stedet for at confidence
 * alene gir fullmakt.
 */

import type { ActionContext, AutonomyFactors, RiskLevel } from "./schemas";
import { classifyRisk } from "./risk-engine";

/** Godtar 0..1 eller 0..100 og klemmer til [0,1]. */
export function norm01(value: number | undefined, fallback = 0.5): number {
  if (value == null || Number.isNaN(value)) return fallback;
  const v = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, v));
}

export function reversibilityFactor(ctx: ActionContext): number {
  switch (ctx.reversibility) {
    case "irreversible":
      return 0.2;
    case "partial":
      return 0.6;
    default:
      return 1; // reversible eller ukjent → anta reversibel
  }
}

export function permissionFactor(ctx: ActionContext): number {
  switch (ctx.permission) {
    case "forbidden":
      return 0;
    case "requires-approval":
      return 0.4;
    default:
      return 1;
  }
}

export function riskFactor(risk: RiskLevel): number {
  switch (risk) {
    case "critical":
      return 0; // tvinger produktet til 0 → aldri auto
    case "high":
      return 0.35;
    case "medium":
      return 0.7;
    default:
      return 1;
  }
}

export function computeAutonomy(ctx: ActionContext, risk: RiskLevel = classifyRisk(ctx)): AutonomyFactors & { score: number } {
  const factors: AutonomyFactors = {
    confidence: norm01(ctx.agentConfidence, 0.6),
    historicalAccuracy: norm01(ctx.historicalAccuracy, 0.7),
    dataQuality: norm01(ctx.dataQuality, 0.7),
    reversibility: reversibilityFactor(ctx),
    permission: permissionFactor(ctx),
    risk: riskFactor(risk),
  };
  const score = Object.values(factors).reduce((product, f) => product * f, 1);
  return { ...factors, score: Math.max(0, Math.min(1, score)) };
}
