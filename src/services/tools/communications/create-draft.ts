/**
 * Tool: create_draft.
 *
 * Lager et utkast til kundekommunikasjon. Prinsipp 6: sender ALDRI noe —
 * faktisk utsending er en egen handling som stopper ved approval/human.
 * Prinsipp 2: idempotent på correlationId (retry gir ikke duplikat-utkast).
 */

import { z } from "zod";
import { defineTool, type ToolContext } from "@/lib/agentic/tool-registry";

export const createDraftInput = z.object({
  correlationId: z.string().min(1), // sporing
  idempotencyKey: z.string().min(1), // operasjons-scoped dedupe (punkt 4)
  contactRef: z.string().optional(),
  channel: z.enum(["email", "whatsapp", "sms"]).default("email"),
  subject: z.string().optional(),
  body: z.string().min(1),
  propertyIds: z.array(z.string()).default([]),
});
export type CreateDraftInput = z.infer<typeof createDraftInput>;

export interface DraftRecord {
  id: string;
  created: boolean;
}

export interface CreateDraftDeps {
  findExisting: (idempotencyKey: string) => Promise<{ id: string } | null>;
  saveDraft: (input: CreateDraftInput, ctx: ToolContext) => Promise<{ id: string }>;
}

export function buildCreateDraftTool(deps: CreateDraftDeps) {
  return defineTool<CreateDraftInput, DraftRecord>({
    name: "create_draft",
    description: "Lager utkast til kundekommunikasjon (sender ikke). Idempotent på idempotencyKey.",
    input: createDraftInput,
    // Krever skrivetilgang til kommunikasjon (RBAC).
    permission: "communications.write",
    // Selve utkastet er en intern handling; SENDING (send_personal) gates separat.
    actionClass: "draft",
    risk: { reversibility: "reversible", channel: "internal", involvesPersonalData: true },
    handler: async (input, ctx) => {
      const existing = await deps.findExisting(input.idempotencyKey);
      if (existing) return { id: existing.id, created: false };
      const saved = await deps.saveDraft(input, ctx);
      return { id: saved.id, created: true };
    },
  });
}
