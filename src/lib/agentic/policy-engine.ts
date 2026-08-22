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
  live: number; // autonomi-score for auto-live
  draft: number; // autonomi-score for auto-draft
  bulkApprovalRecipients: number; // over dette → minst manual-review
}

export const DEFAULT_THRESHOLDS: PolicyThresholds = {
  live: 0.55,
  draft: 0.25,
  bulkApprovalRecipients: 200,
};

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
  } else if (score >= thresholds.live && risk === "low") {
    mode = "live";
    reason = "Høy autonomi-score og lav risiko — kan kjøre automatisk.";
  } else if (score >= thresholds.draft) {
    mode = "draft-first";
    reason = "Middels autonomi — genererer utkast for gjennomgang.";
  } else {
    mode = "manual-review";
    reason = "Lav autonomi-score — krever manuell gjennomgang.";
  }

  return { mode, autonomyScore: score, risk, factors, hardGate, reason };
}
