/**
 * Agentic Core 1.0 — policy/autonomi-motor.
 *
 * Kombinerer risiko + autonomi-score + harde policy-regler til ett utfall:
 *   live | draft-first | manual-review | human-required
 *
 * Harde porter (overstyrer score alltid):
 *  - Kontrakt, betaling, budrespons, prisendring → human-required.
 *  - permission = forbidden → human-required (blokkert).
 *  - Utsending til mange mottakere → minst manual-review.
 */

import type { ActionClass, ActionContext, AutonomyDecision } from "./schemas";
import { classifyRisk } from "./risk-engine";
import { computeAutonomy } from "./confidence";

const ALWAYS_HUMAN: ActionClass[] = ["contract", "financial_transfer", "offer_response", "price_change"];

export interface PolicyThresholds {
  /** Minste autonomi-score for at en MEDIUM-risiko-handling auto-lager utkast. */
  draft: number;
  /** Over dette antall mottakere → minst manual-review. */
  bulkApprovalRecipients: number;
}

export const DEFAULT_THRESHOLDS: PolicyThresholds = {
  draft: 0.2,
  bulkApprovalRecipients: 200,
};

/**
 * Nøkkelidé: confidence-porten gjelder RISIKABLE handlinger. Lav-risiko/read-
 * only/interne handlinger (søk, klassifisering, tag, utkast internt) kjøres
 * automatisk uansett confidence. Medium/høy/kritisk gates av risiko + score.
 */
export function decideAutonomy(ctx: ActionContext, thresholds: PolicyThresholds = DEFAULT_THRESHOLDS): AutonomyDecision {
  const risk = classifyRisk(ctx);
  const autonomy = computeAutonomy(ctx, risk);
  const { score, ...factors } = autonomy;

  let hardGate: string | null = null;
  if (ALWAYS_HUMAN.includes(ctx.actionClass)) {
    hardGate = `Handlingsklasse «${ctx.actionClass}» krever alltid menneskelig godkjenning.`;
  } else if (ctx.permission === "forbidden") {
    hardGate = "Policy forbyr denne handlingen.";
  }

  let mode: AutonomyDecision["mode"];
  let reason: string;

  if (hardGate) {
    mode = "human-required";
    reason = hardGate;
  } else if (risk === "critical") {
    mode = "human-required";
    reason = "Kritisk risiko — krever menneske.";
  } else if ((ctx.recipients ?? 1) > thresholds.bulkApprovalRecipients) {
    mode = "manual-review";
    reason = `Utsending til ${ctx.recipients} mottakere — krever godkjenning.`;
  } else if (risk === "low") {
    mode = "live";
    reason = "Lav risiko — trygg å kjøre automatisk.";
  } else if (risk === "medium") {
    if (score >= thresholds.draft) {
      mode = "draft-first";
      reason = "Middels risiko — auto-utkast for menneskelig gjennomgang.";
    } else {
      mode = "manual-review";
      reason = "Middels risiko og lav autonomi — manuell gjennomgang.";
    }
  } else {
    mode = "manual-review";
    reason = "Høy risiko — krever godkjenning.";
  }

  return { mode, autonomyScore: score, risk, factors, hardGate, reason };
}
