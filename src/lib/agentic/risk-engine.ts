/**
 * Agentic Core 1.0 — risiko-klassifisering.
 *
 * Risiko avledes av reversibilitet, antall mottakere, økonomisk konsekvens,
 * persondata, kanal og juridisk følsomhet — ikke av agentens confidence.
 * Kontrakt / bud / pris / betaling er alltid kritisk.
 */

import type { ActionClass, ActionContext, RiskLevel } from "./schemas";

const ALWAYS_CRITICAL: ActionClass[] = ["contract", "financial_transfer", "offer_response", "price_change"];

export function classifyRisk(ctx: ActionContext): RiskLevel {
  if (ALWAYS_CRITICAL.includes(ctx.actionClass)) return "critical";

  let score = 0;

  if (ctx.reversibility === "irreversible") score += 3;
  else if (ctx.reversibility === "partial") score += 1;

  const recipients = ctx.recipients ?? 1;
  if (recipients > 500) score += 3;
  else if (recipients > 50) score += 2;
  else if (recipients > 5) score += 1;

  const money = Math.abs(ctx.financialImpactEur ?? 0);
  if (money >= 50_000) score += 3;
  else if (money >= 5_000) score += 2;
  else if (money >= 500) score += 1;

  if (ctx.involvesPersonalData) score += 1;
  if (ctx.legalSensitive) score += 2;
  if (ctx.channel && ctx.channel !== "internal") score += 1;

  if (score >= 6) return "critical";
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}
