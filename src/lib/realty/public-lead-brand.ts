import { normalizeBrandId } from "@/lib/realty/brand-rules";

export const PUBLIC_REAL_ESTATE_BRANDS = ["zeneco", "soleada", "pinosoecolife"] as const;
export type PublicRealEstateBrand = (typeof PUBLIC_REAL_ESTATE_BRANDS)[number];

const ALLOWED_BRANDS = new Set<string>(PUBLIC_REAL_ESTATE_BRANDS);

export const PUBLIC_REAL_ESTATE_BRAND_LABELS: Record<PublicRealEstateBrand, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

export function resolvePublicLeadBrand(
  requestedBrand?: string | null,
  source?: string | null,
): PublicRealEstateBrand {
  const direct = normalizeBrandId(requestedBrand);
  if (ALLOWED_BRANDS.has(direct)) return direct as PublicRealEstateBrand;

  const sourceText = String(source || "").toLowerCase();
  if (sourceText.includes("soleada")) return "soleada";
  if (sourceText.includes("pinoso") || sourceText.includes("ecolife")) return "pinosoecolife";
  return "zeneco";
}
