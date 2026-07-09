const BRAND_ALIASES: Record<string, string> = {
  zen: "zeneco",
  pinoso: "pinosoecolife",
  chat: "chatgenius",
  freddy: "freddy",
};

/**
 * Shared brand normalization for public lead-capture endpoints. Aliases exist
 * because the appointment app and older site forms send short brand codes
 * ("zen", "pinoso") instead of the canonical brand_id used in the CRM.
 */
export function normalizeBrand(rawBrand: unknown, fallback: string): string {
  const brand = String(rawBrand ?? "").trim().toLowerCase().slice(0, 60);
  if (!brand) return fallback;
  return BRAND_ALIASES[brand] || brand;
}
