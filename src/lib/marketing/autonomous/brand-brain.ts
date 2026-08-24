/**
 * Phase 7.1 — Brand Brain. Ett strukturert brand-context per merke, hentet
 * automatisk av Marketing Director og Creative Generator. Ingen brand-hardcoding
 * i prompts. Inneholder også allowed/forbidden claims som håndheves før publisering.
 */

import { z } from "zod";

export const BrandContextSchema = z.object({
  brandId: z.string().min(1),
  brandName: z.string().min(1),
  voice: z.string().default(""),
  audience: z.string().default(""),
  languages: z.array(z.string()).default(["no"]),
  markets: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  valueProposition: z.string().default(""),
  allowedClaims: z.array(z.string()).default([]),
  forbiddenClaims: z.array(z.string()).default([]),
  preferredCta: z.string().default(""),
  visualDirection: z.string().default(""),
  locations: z.array(z.string()).default([]),
  urls: z.array(z.string()).default([]),
  contact: z.object({ email: z.string().optional(), phone: z.string().optional(), website: z.string().optional() }).default({}),
  /** Eksplisitt mapping til eksisterende systemer (aldri fuzzy-match på tvers av brands). */
  contentHubOrgId: z.string().optional(),
  adCampaignIds: z.array(z.string()).default([]),
});
export type BrandContext = z.infer<typeof BrandContextSchema>;

export function parseBrandContext(input: unknown): BrandContext {
  return BrandContextSchema.parse(input);
}

export interface ClaimCheck {
  ok: boolean;
  forbiddenHits: string[];
}

/**
 * Sjekk tekst mot merkets forbidden claims. Treff → må godkjennes (fail-safe):
 * AI skal ikke autonomt publisere påstander merket har forbudt.
 */
export function checkClaims(text: string, brand: Pick<BrandContext, "forbiddenClaims">): ClaimCheck {
  const lower = (text ?? "").toLowerCase();
  const forbiddenHits = (brand.forbiddenClaims ?? []).filter((c) => c.trim() && lower.includes(c.toLowerCase()));
  return { ok: forbiddenHits.length === 0, forbiddenHits };
}
