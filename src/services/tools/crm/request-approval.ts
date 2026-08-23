/**
 * Tool: request_approval.
 *
 * Legger en handling i den menneskelige godkjenningskøen (Approval Gateway).
 * Selve enqueueingen er intern/lav risiko; risikoen for den UNDERLIGGENDE
 * handlingen (f.eks. send_personal) bæres i payloaden. Idempotent (prinsipp 2).
 */

import { z } from "zod";
import { defineTool, type ToolContext } from "@/lib/agentic/tool-registry";
import { APPROVAL_SUBJECT_TYPES, AUTONOMY_MODES, RISK_LEVELS } from "@/lib/agentic/schemas";

export const requestApprovalInput = z.object({
  correlationId: z.string().min(1), // sporing
  idempotencyKey: z.string().min(1), // operasjons-scoped dedupe (punkt 4)
  runId: z.string().min(1),
  title: z.string().min(1),
  /** Handlingsklassen som faktisk gates (f.eks. "send_personal"). */
  gatedActionClass: z.string().min(1),
  /**
   * Unifisert approval (punkt 6): pek til et EKSISTERENDE RealtyFlow-approval-
   * objekt (buyer_profile/shortlist/presentation/message_draft) i stedet for å
   * lage en parallell kø. `generic_agent_action` for nye agent-handlinger.
   */
  subjectType: z.enum(APPROVAL_SUBJECT_TYPES),
  subjectRef: z.string().optional(),
  customerRef: z.string().optional(),
  draftId: z.string().optional(),
  reason: z.string().optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  decisionMode: z.enum(AUTONOMY_MODES).optional(),
  confidence: z.number().optional(),
  estimatedOpportunityEur: z.number().optional(),
});
export type RequestApprovalInput = z.infer<typeof requestApprovalInput>;

export interface ApprovalRecord {
  id: string;
  created: boolean;
}

export interface RequestApprovalDeps {
  findExisting: (idempotencyKey: string) => Promise<{ id: string } | null>;
  saveApproval: (input: RequestApprovalInput, ctx: ToolContext) => Promise<{ id: string }>;
}

export function buildRequestApprovalTool(deps: RequestApprovalDeps) {
  return defineTool<RequestApprovalInput, ApprovalRecord>({
    name: "request_approval",
    description: "Legger/aggregerer en handling i den ene menneskelige godkjenningskøen. Idempotent på idempotencyKey.",
    input: requestApprovalInput,
    permission: "execution.write",
    actionClass: "notify",
    risk: { reversibility: "reversible", channel: "internal" },
    handler: async (input, ctx) => {
      const existing = await deps.findExisting(input.idempotencyKey);
      if (existing) return { id: existing.id, created: false };
      const saved = await deps.saveApproval(input, ctx);
      return { id: saved.id, created: true };
    },
  });
}
