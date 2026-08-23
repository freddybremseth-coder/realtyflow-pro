/**
 * Phase 7.1 — markedsføringsapproval koblet DIREKTE til den eksisterende
 * General Approval Gateway (agentic_approvals). Ingen parallell kø. Idempotent
 * per publisering (operationIdempotencyKey) — retry lager ikke duplikat.
 */

import { operationIdempotencyKey } from "@/lib/agentic";
import { makeApprovalStore, type SupabaseLike } from "@/services/agentic/adapters";
import type { RequestApprovalInput } from "@/services/tools/crm/request-approval";

export interface MarketingApprovalRequest {
  publicationId: string;
  contentId: string;
  channel: string;
  reason: string;
  gatedActionClass?: string;
  risk?: string;
  decisionMode?: string;
  confidence?: number;
  estimatedOpportunityEur?: number;
}

/**
 * Lag en approval-requester som skriver til agentic_approvals. Kaster hvis
 * lagringen feiler — fail-closed (ikke stille draft).
 */
export function makeMarketingApprovalRequester(supabase: SupabaseLike, opts: { runId: string; correlationId: string }) {
  const store = makeApprovalStore(supabase);
  return async (input: MarketingApprovalRequest): Promise<string> => {
    const idempotencyKey = operationIdempotencyKey(opts.runId, `approve-publish:${input.publicationId}`);
    const existing = await store.findExisting(idempotencyKey);
    if (existing) return existing.id;
    const res = await store.saveApproval({
      correlationId: opts.correlationId,
      idempotencyKey,
      runId: opts.runId,
      title: `Publisering: ${input.channel} — ${input.contentId}`,
      gatedActionClass: input.gatedActionClass ?? "publish_social",
      subjectType: "generic_agent_action",
      subjectRef: input.publicationId,
      reason: input.reason,
      risk: input.risk as RequestApprovalInput["risk"],
      decisionMode: input.decisionMode as RequestApprovalInput["decisionMode"],
      confidence: input.confidence,
      estimatedOpportunityEur: input.estimatedOpportunityEur,
    });
    return res.id;
  };
}
