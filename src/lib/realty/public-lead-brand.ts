import { normalizeBrandId } from "@/lib/realty/brand-rules";

export const PUBLIC_REAL_ESTATE_BRANDS = ["zeneco", "soleada", "pinosoecolife"] as const;
export type PublicRealEstateBrand = (typeof PUBLIC_REAL_ESTATE_BRANDS)[number];

const ALLOWED_BRANDS = new Set<string>(PUBLIC_REAL_ESTATE_BRANDS);

export const PUBLIC_REAL_ESTATE_BRAND_LABELS: Record<PublicRealEstateBrand, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

function fold(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function resolvePublicLeadBrand(
  requestedBrand?: string | null,
  source?: string | null,
): PublicRealEstateBrand {
  const direct = normalizeBrandId(requestedBrand);
  if (ALLOWED_BRANDS.has(direct)) return direct as PublicRealEstateBrand;

  const requestedText = fold(requestedBrand);
  if (requestedText.includes("soleada")) return "soleada";
  if (requestedText.includes("pinoso") || requestedText.includes("ecolife")) return "pinosoecolife";
  if (requestedText.includes("zeneco")) return "zeneco";

  const sourceText = fold(source);
  if (sourceText.includes("soleada")) return "soleada";
  if (sourceText.includes("pinoso") || sourceText.includes("ecolife")) return "pinosoecolife";
  return "zeneco";
}
