export const ZENECO_HEADER_DARK_SVG_URL = "https://www.zenecohomes.com/assets/zeneco-header-dark.svg?v=20260926-3";
export const ZENECO_HEADER_LIGHT_SVG_URL = "https://www.zenecohomes.com/assets/zeneco-header-light.svg?v=20260926-3";
export const ZENECO_MARK_SVG_URL = "https://www.zenecohomes.com/assets/zeneco-mark.svg?v=20260926-3";
export const ZENECO_WATERMARK_SVG_URL = "https://www.zenecohomes.com/assets/zeneco-watermark.svg?v=20260926-3";
export const ZENECO_FULL_LOGO_SVG_URL = "https://www.zenecohomes.com/assets/zeneco-logo.svg?v=20260926-2";

export function canonicalBrandLogoUrl(
  brandId: string,
  use: "header" | "header_light" | "mark" | "watermark" | "full" = "header",
): string | null {
  const id = String(brandId || "").trim().toLowerCase().replace(/[._\s-]+/g, "");
  if (id !== "zeneco" && id !== "zenecohomes") return null;
  if (use === "header_light") return ZENECO_HEADER_LIGHT_SVG_URL;
  if (use === "mark") return ZENECO_MARK_SVG_URL;
  if (use === "watermark") return ZENECO_WATERMARK_SVG_URL;
  if (use === "full") return ZENECO_FULL_LOGO_SVG_URL;
  return ZENECO_HEADER_DARK_SVG_URL;
}
