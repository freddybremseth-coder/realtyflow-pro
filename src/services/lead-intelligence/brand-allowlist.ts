import { z } from "zod";
import { BRANDS } from "@/lib/constants";
import { LEAD_INTELLIGENCE_LIMITS } from "./contracts";

export const LEAD_INTELLIGENCE_REAL_ESTATE_BRANDS = BRANDS
  .filter((brand) => brand.type === "real_estate")
  .map((brand) => brand.id) as [string, ...string[]];

const allowedBrandSet = new Set<string>(LEAD_INTELLIGENCE_REAL_ESTATE_BRANDS);

export function isLeadIntelligenceRealEstateBrand(value: unknown) {
  return typeof value === "string" && allowedBrandSet.has(value.trim());
}

export const LeadIntelligenceRealEstateBrandSchema = z
  .string()
  .trim()
  .min(1)
  .max(LEAD_INTELLIGENCE_LIMITS.brand)
  .refine(isLeadIntelligenceRealEstateBrand, "Lead Intelligence brand is not allowed");
