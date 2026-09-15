/**
 * General Agentic Approval Gateway.
 *
 * ÉN kø + ett audit trail for alle menneskelige godkjenninger. Approval is a
 * decision, never proof that the underlying action was executed.
 */

import type { ApprovalSubjectType, RiskLevel, RunOutcome } from "./schemas";

export interface ApprovalItem {
  id: string;
  runId?: string | null;
  correlationId?: string | null;
  title: string;
  gatedActionClass: string;
  subjectType: ApprovalSubjectType | string;
  subjectRef?: string | null;
  customerRef?: string | null;
  draftId?: string | null;
  reason?: string | null;
  risk?: RiskLevel | string | null;
  decisionMode?: string | null;
  confidence?: number | null;
  estimatedOpportunityEur?: number | null;
  status: "pending" | "approved" | "rejected" | "superseded" | string;
  createdAt?: string | null;
}

export type ApprovalDecision = "approve" | "reject";

export interface ApprovalGatewayStore {
  listPending(): Promise<ApprovalItem[]>;
  get(id: string): Promise<ApprovalItem | null>;
  markResolved(id: string, status: "approved" | "rejected", resolvedBy: string, at: string): Promise<void>;
}

export interface GatewayOutcomeEvent {
  approvalId: string;
  runId?: string;
  correlationId?: string;
  outcome: Extract<RunOutcome, "approved" | "rejected">;
  title: string;
  gatedActionClass: string;
  subjectType: string;
  subjectRef?: string;
  customerRef?: string;
  revenueImpactEur?: number;
}

export interface ApprovalGatewayDeps {
  store: ApprovalGatewayStore;
  publishEvent: (event: GatewayOutcomeEvent) => Promise<void>;
  now?: () => Date;
}

export interface ResolveResult {
  ok: boolean;
  status?: string;
  alreadyResolved?: boolean;
  error?: string;
}

export async function listApprovalQueue(deps: Pick<ApprovalGatewayDeps, "store">): Promise<ApprovalItem[]> {
  const items = await deps.store.listPending();
  const riskRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return items
    .slice()
    .sort((a, b) => (riskRank[String(a.risk)] ?? 4) - (riskRank[String(b.risk)] ?? 4) || (b.estimatedOpportunityEur ?? 0) - (a.estimatedOpportunityEur ?? 0));
}

export async function resolveApproval(
  deps: ApprovalGatewayDeps,
  args: { id: string; decision: ApprovalDecision; resolvedBy: string },
): Promise<ResolveResult> {
  const item = await deps.store.get(args.id);
  if (!item) return { ok: false, error: "NOT_FOUND" };
  if (item.status !== "pending") return { ok: true, status: item.status, alreadyResolved: true };

  const status = args.decision === "approve" ? "approved" : "rejected";
  const at = (deps.now?.() ?? new Date()).toISOString();
  await deps.store.markResolved(args.id, status, args.resolvedBy, at);

  await deps.publishEvent({
    approvalId: item.id,
    runId: item.runId ?? undefined,
    correlationId: item.correlationId ?? undefined,
    outcome: status,
    title: `${status === "approved" ? "GODKJENT" : "AVVIST"}: ${item.title}`,
    gatedActionClass: item.gatedActionClass,
    subjectType: String(item.subjectType),
    subjectRef: item.subjectRef ?? undefined,
    customerRef: item.customerRef ?? undefined,
    revenueImpactEur: item.estimatedOpportunityEur ?? undefined,
  });

  // Approval does not execute the action. A dedicated executor handles that
  // separately and is the only component allowed to emit an execution receipt.
  return { ok: true, status };
}
