/**
 * Tool: save_buyer_profile (Hardening 1.1, punkt 2).
 *
 * Buyer profile skal IKKE være en parallell, forenklet in-memory-modell.
 * Den persisteres gjennom Lead Intelligence (system-of-record) med status,
 * versjon og provenance. Property matching kan bruke draft-data internt, men
 * det skal alltid være tydelig om profilen er AI-generert, gjennomgått eller
 * godkjent. Idempotent (punkt 4).
 */

import { z } from "zod";
import { defineTool, type ToolContext } from "@/lib/agentic/tool-registry";

/** Provenance — gjenbruker Lead Intelligence sitt CriterionSource-vokabular. */
export const PROFILE_PROVENANCE = ["ai_suggestion", "manual", "customer_confirmed"] as const;
/** Status — delmengde av Lead Intelligence sin ApprovalStatus. */
export const PROFILE_STATUS = ["ai_draft", "needs_review", "approved"] as const;

export const saveBuyerProfileInput = z.object({
  correlationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  brandId: z.string().optional(),
  contactRef: z.string().optional(),
  name: z.string().optional(),
  budgetMaxEur: z.number().optional(),
  budgetMinEur: z.number().optional(),
  areas: z.array(z.string()).default([]),
  propertyType: z.string().optional(),
  bedroomsMin: z.number().optional(),
  mustHaves: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  provenance: z.enum(PROFILE_PROVENANCE).default("ai_suggestion"),
  status: z.enum(PROFILE_STATUS).default("ai_draft"),
});
export type SaveBuyerProfileInput = z.infer<typeof saveBuyerProfileInput>;

export interface BuyerProfileRecord {
  id: string;
  version: number;
  status: string;
  created: boolean;
}

export interface SaveBuyerProfileDeps {
  findExisting: (idempotencyKey: string) => Promise<{ id: string; version: number; status: string } | null>;
  /** Persister via eksisterende Lead Intelligence-kontrakter (system-of-record). */
  saveProfile: (input: SaveBuyerProfileInput, ctx: ToolContext) => Promise<{ id: string; version: number; status: string }>;
}

export function buildSaveBuyerProfileTool(deps: SaveBuyerProfileDeps) {
  return defineTool<SaveBuyerProfileInput, BuyerProfileRecord>({
    name: "save_buyer_profile",
    description: "Persister buyer profile via Lead Intelligence (status/version/provenance). Idempotent.",
    input: saveBuyerProfileInput,
    permission: "customers.write",
    actionClass: "enrich",
    risk: { reversibility: "reversible", channel: "internal", involvesPersonalData: true },
    handler: async (input, ctx) => {
      const existing = await deps.findExisting(input.idempotencyKey);
      if (existing) return { ...existing, created: false };
      const saved = await deps.saveProfile(input, ctx);
      return { ...saved, created: true };
    },
  });
}
