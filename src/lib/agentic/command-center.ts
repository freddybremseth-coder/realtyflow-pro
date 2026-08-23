/**
 * Revenue Command Center 2027 — agentic-lag.
 *
 * Aggregerer agent-signalene (ventende godkjenninger + revenue_events fra
 * agenter) til et inntekts-først sammendrag for startsiden: «hva bør jeg gjøre
 * nå for å skape eller sikre inntekt». Ren logikk, testbar; API-et mater den
 * med data fra Supabase.
 */

import type { ApprovalItem } from "./approval-gateway";

export interface RevenueEventLite {
  eventType: string;
  outcome?: string | null; // agentic_outcome fra metadata
  revenueImpactEur?: number | null;
  actorType?: string | null;
  occurredAt?: string | null;
}

export interface CommandCenterInput {
  pendingApprovals: ApprovalItem[];
  recentEvents: RevenueEventLite[];
}

export interface NextBestAction {
  id: string;
  title: string;
  subjectType: string;
  risk?: string | null;
  opportunityEur?: number | null;
}

export interface CommandCenterSummary {
  pendingCount: number;
  pendingOpportunityEur: number;
  agentRecommended: number;
  agentExecuted: number;
  attributedRevenueEur: number;
  nextBestActions: NextBestAction[];
}

const RISK_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function buildCommandCenter(input: CommandCenterInput): CommandCenterSummary {
  const pending = input.pendingApprovals ?? [];
  const events = input.recentEvents ?? [];

  const pendingOpportunityEur = pending.reduce((s, a) => s + (a.estimatedOpportunityEur ?? 0), 0);

  const agentRecommended = events.filter((e) => e.outcome === "recommended").length;
  const agentExecuted = events.filter((e) => e.outcome === "executed").length;
  // Attribuert inntekt: eksekvert/godkjent med reell revenue-impact.
  const attributedRevenueEur = events
    .filter((e) => (e.outcome === "executed" || e.outcome === "approved") && (e.revenueImpactEur ?? 0) > 0)
    .reduce((s, e) => s + (e.revenueImpactEur ?? 0), 0);

  const nextBestActions: NextBestAction[] = pending
    .slice()
    .sort((a, b) => (RISK_RANK[String(a.risk)] ?? 4) - (RISK_RANK[String(b.risk)] ?? 4) || (b.estimatedOpportunityEur ?? 0) - (a.estimatedOpportunityEur ?? 0))
    .slice(0, 5)
    .map((a) => ({ id: a.id, title: a.title, subjectType: String(a.subjectType), risk: a.risk ?? null, opportunityEur: a.estimatedOpportunityEur ?? null }));

  return {
    pendingCount: pending.length,
    pendingOpportunityEur,
    agentRecommended,
    agentExecuted,
    attributedRevenueEur,
    nextBestActions,
  };
}
