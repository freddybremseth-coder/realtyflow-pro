/**
 * Phase 7.1 — markedsføringsapproval koblet DIREKTE til den eksisterende
 * General Approval Gateway (agentic_approvals). Ingen parallell kø. Idempotent
 * per publisering (operationIdempotencyKey) — retry lager ikke duplikat.
 */

import { operationIdempotencyKey } from "@/lib/agentic";
import { makeApprovalStore, type SupabaseLike } from "@/services/agentic/adapters";
import type { RequestApprovalInput } from "@/services/tools/crm/request-approval";

/**
 * Phase 7.1I — agent-run-BRO. agentic_approvals.run_id har FK → agent_runs.id,
 * men en Marketing Growth OS-run lever i marketing_runs. Vi lager derfor ÉN
 * kanonisk agent_runs-konvolutt per marketing-run FØR noen approval kan opprettes.
 *
 * agent_runs.id er text → vi bruker BEVISST samme ID (agentRunId = marketingRunId):
 * broen og marketing-runen deler ID og correlation. marketing_publications peker
 * fortsatt til marketing_runs; agentic_approvals peker til agent_runs (broen).
 * Idempotent (onConflict id). Fail closed hvis persisteringen feiler.
 */
export async function ensureMarketingAgentRun(
  supabase: SupabaseLike,
  args: { marketingRunId: string; correlationId: string; now?: string | Date },
): Promise<{ agentRunId: string }> {
  const agentRunId = args.marketingRunId;
  const nowIso = new Date(args.now ?? new Date()).toISOString();
  const { error } = await supabase.from("agent_runs").upsert(
    {
      id: agentRunId,
      agent_id: "marketing-growth-os",
      goal: "campaign/publish approval orchestration",
      status: "running",
      correlation_id: args.correlationId,
      idempotency_key: operationIdempotencyKey(args.marketingRunId, "agent-run-bridge"),
      decision: { marketing_run_id: args.marketingRunId, bridge: "marketing-growth-os" },
      started_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`AGENT_RUN_BRIDGE_FAILED: ${error.message}`);
  return { agentRunId };
}

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
  /** Eksakt caption som sendes til Meta — vises i kortet, må matche hashet payload. */
  caption?: string;
  accountId?: string;
  service?: string;
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
    // Approval-kortet skal vise EKSAKT det som publiseres (samme payload som hashen).
    const cardReason = input.caption
      ? [
          `FINAL ${input.channel.toUpperCase()} CAPTION`,
          "-----------------------",
          input.caption,
          "",
          input.accountId ? `Konto: ${input.accountId}` : null,
          input.service ? `Service: ${input.service}` : null,
          `— ${input.reason}`,
        ].filter(Boolean).join("\n")
      : input.reason;
    const res = await store.saveApproval({
      correlationId: opts.correlationId,
      idempotencyKey,
      runId: opts.runId,
      title: `Publisering: ${input.channel} — ${input.contentId}`,
      gatedActionClass: input.gatedActionClass ?? "publish_social",
      subjectType: "generic_agent_action",
      subjectRef: input.publicationId,
      reason: cardReason,
      risk: input.risk as RequestApprovalInput["risk"],
      decisionMode: input.decisionMode as RequestApprovalInput["decisionMode"],
      confidence: input.confidence,
      estimatedOpportunityEur: input.estimatedOpportunityEur,
    });
    return res.id;
  };
}
