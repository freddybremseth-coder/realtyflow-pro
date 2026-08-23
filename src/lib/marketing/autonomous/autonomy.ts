/**
 * Phase 7 — autonomi-styring. ALL autonomi går gjennom den eksisterende
 * agentiske Policy Engine (decideAutonomy) — ingen egne autoPublish-booleaner.
 *
 * Autonomi-NIVÅET (observe/copilot/guarded/optimized) legger et TAK oppå policy-
 * beslutningen: på copilot kan AI generere internt, men publisering krever alltid
 * godkjenning; betaling krever alltid menneske. Systemet starter på copilot.
 */

import { decideAutonomy, type ActionContext, type AutonomyDecision } from "@/lib/agentic";
import type { MarketingChannel } from "../genome";
import type { AutonomyLevel } from "./schemas";

export const MARKETING_ACTIONS = [
  // Analyse / lav risiko — kan kjøre live.
  "analytics_ingest", "learning_refresh", "utm_creation", "content_classification", "seo_internal_links", "metric_collection",
  // Generering — utkast internt.
  "generate_social", "generate_article", "generate_video_script", "generate_landing_page", "generate_lead_magnet", "generate_lead_form",
  // Publisering — kundevendt, gated.
  "publish_social", "publish_article", "publish_listing",
  // Strategisk — godkjenning.
  "new_campaign", "sensitive_claim", "market_prediction", "brand_repositioning", "strategy_change",
  // Økonomisk — alltid menneske.
  "paid_budget_change", "contractual_claim", "pricing_commitment", "legal_statement",
] as const;
export type MarketingAction = (typeof MARKETING_ACTIONS)[number];

export type ActionCategory = "analysis" | "generation" | "publication" | "strategic" | "financial";

export function actionCategory(action: MarketingAction): ActionCategory {
  if (["analytics_ingest", "learning_refresh", "utm_creation", "content_classification", "seo_internal_links", "metric_collection"].includes(action)) return "analysis";
  if (action.startsWith("generate_")) return "generation";
  if (action.startsWith("publish_")) return "publication";
  if (["paid_budget_change", "contractual_claim", "pricing_commitment", "legal_statement"].includes(action)) return "financial";
  return "strategic";
}

export interface MarketingActionSignals {
  channel?: MarketingChannel;
  confidence?: number;
  dataQuality?: number;
  recipients?: number;
  financialImpactEur?: number;
  legalSensitive?: boolean;
  involvesPersonalData?: boolean;
  /** Guarded-nivå: format er forhåndsgodkjent playbook → kan publiseres live. */
  preapprovedFormat?: boolean;
}

/** Kartlegg en marketing-handling til agentisk ActionContext (for Policy Engine). */
export function toActionContext(action: MarketingAction, s: MarketingActionSignals = {}): ActionContext {
  const category = actionCategory(action);
  const base: ActionContext = {
    actionClass: "classify",
    agentId: "marketing-director",
    actorType: "ai",
    agentConfidence: s.confidence ?? 0.6,
    dataQuality: s.dataQuality ?? 0.7,
    reversibility: "reversible",
    permission: "allowed",
    channel: "internal",
  };
  switch (category) {
    case "analysis":
      return { ...base, actionClass: action === "utm_creation" ? "enrich" : "classify" };
    case "generation":
      return { ...base, actionClass: "draft", reversibility: "reversible", channel: "internal" };
    case "publication":
      return {
        ...base,
        actionClass: action === "publish_listing" ? "publish_listing" : "publish_social",
        channel: action === "publish_listing" ? "portal" : action === "publish_article" ? "web" : "social",
        reversibility: "partial",
        recipients: s.recipients,
        involvesPersonalData: s.involvesPersonalData,
        legalSensitive: s.legalSensitive,
      };
    case "financial":
      return {
        ...base,
        actionClass: action === "paid_budget_change" ? "financial_transfer" : action === "pricing_commitment" ? "price_change" : "contract",
        legalSensitive: true,
        financialImpactEur: s.financialImpactEur,
        reversibility: "irreversible",
      };
    case "strategic":
    default:
      return { ...base, actionClass: action === "new_campaign" ? "schedule" : "notify", legalSensitive: action === "market_prediction" || action === "brand_repositioning" };
  }
}

const MODE_RANK: Record<string, number> = { live: 0, "draft-first": 1, "manual-review": 2, "human-required": 3, blocked: 4 };
const MODES = ["live", "draft-first", "manual-review", "human-required", "blocked"] as const;
export type MarketingMode = (typeof MODES)[number];

function strictest(a: MarketingMode, b: MarketingMode): MarketingMode {
  return MODE_RANK[a] >= MODE_RANK[b] ? a : b;
}

export interface MarketingAutonomyResult {
  action: MarketingAction;
  category: ActionCategory;
  level: AutonomyLevel;
  /** Endelig utfall etter nivå-tak. */
  mode: MarketingMode;
  /** Policy Engine sitt utfall før nivå-tak. */
  policyMode: AutonomyDecision["mode"];
  risk: AutonomyDecision["risk"];
  autonomyScore: number;
  reason: string;
}

/**
 * Endelig autonomi-beslutning: Policy Engine + nivå-tak. Harde porter (betaling/
 * kontrakt/pris) forblir human-required uansett nivå.
 */
export function resolveMarketingAutonomy(
  action: MarketingAction,
  level: AutonomyLevel,
  signals: MarketingActionSignals = {},
): MarketingAutonomyResult {
  const category = actionCategory(action);
  const ctx = toActionContext(action, signals);
  const decision = decideAutonomy(ctx);
  let mode: MarketingMode = decision.mode as MarketingMode;
  let reason = decision.reason;

  if (level === "observe") {
    if (category !== "analysis") {
      mode = "blocked";
      reason = "Observe-nivå: AI analyserer og anbefaler, men genererer/publiserer ikke.";
    }
  } else if (level === "copilot") {
    if (category === "generation") {
      // Generering internt er OK (utkast). Ingen skjerping.
    } else if (category === "publication" || category === "strategic") {
      mode = strictest(mode, "manual-review");
      reason = "Copilot: kundevendt/strategisk handling krever menneskelig godkjenning.";
    }
  } else if (level === "guarded") {
    if (category === "publication") {
      if (signals.preapprovedFormat && MODE_RANK[mode] <= MODE_RANK["draft-first"] && decision.risk !== "high") {
        mode = "live";
        reason = "Guarded: forhåndsgodkjent lavrisiko-format kan publiseres.";
      } else {
        mode = strictest(mode, "manual-review");
        reason = "Guarded: nytt/sensitivt innhold krever godkjenning.";
      }
    } else if (category === "strategic") {
      mode = strictest(mode, "manual-review");
    }
  }
  // optimized: policy-beslutningen står (harde porter gjelder fortsatt).

  return { action, category, level, mode, policyMode: decision.mode, risk: decision.risk, autonomyScore: decision.autonomyScore, reason };
}
