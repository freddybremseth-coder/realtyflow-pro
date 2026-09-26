export const ZENECO_LOGO_PNG_URL = "https://www.zenecohomes.com/api/brand-assets/zeneco-logo";
export const ZENECO_LOGO_SVG_URL = "https://www.zenecohomes.com/assets/zeneco-logo.svg?v=20260926-2";

export function canonicalBrandLogoUrl(brandId: string, format: "png" | "svg" = "png"): string | null {
  const id = String(brandId || "").trim().toLowerCase().replace(/[._\s-]+/g, "");
  if (id === "zeneco" || id === "zenecohomes") {
    return format === "svg" ? ZENECO_LOGO_SVG_URL : ZENECO_LOGO_PNG_URL;
  }
  return null;
}
