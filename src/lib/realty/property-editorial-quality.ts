import { propertyEditorialSource, type PropertyEditorialNo } from "./property-editorial-no";

const UNKNOWN = /^(?:ukjent|unknown|ikke angitt|n\/a|na|-)?$/i;
const PROMOTIONAL = /\b(?:drømmebolig|fantastisk|unik|eksklusiv|spektakulær|perfekt|førsteklasses|attraktiv(?:t|e)?|mest populære|svært populær|fredelig)\b/i;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizePropertyTypeNo(value: unknown): string {
  const raw = clean(value);
  const v = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!v) return "Eiendom";
  if (/top floor bungalow/.test(v)) return "Bungalow i toppetasje";
  if (/ground floor bungalow/.test(v)) return "Bungalow";
  if (/penthouse|ático|atico/.test(v)) return "Toppleilighet";
  if (/semi detached|semidetached|pareado|tomannsbolig/.test(v)) return "Tomannsbolig";
  if (/quad|townhouse|terraced|adosado|rekkehus/.test(v)) return "Rekkehus";
  if (/apartment|apartments|flat|wohnung|leilighet|apartamento/.test(v)) return "Leilighet";
  if (/duplex|dúplex/.test(v)) return "Dupleks";
  if (/bungalow/.test(v)) return "Bungalow";
  if (/plot|land|grundst|tomt|terreno|parcela/.test(v)) return "Tomt";
  if (/finca|country house|cortijo/.test(v)) return "Finca";
  if (/villa|detached|chalet/.test(v)) return "Villa";
  if (/commercial|business|local comercial/.test(v)) return "Næringseiendom";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function normalizePropertyLocationNo(value: unknown): string {
  const raw = clean(value);
  if (!raw || UNKNOWN.test(raw)) return "Ikke angitt";
  const v = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (v === "costa blanca south - inland" || v === "costa blanca south – inland") return "Costa Blanca sør – innland";
  if (v === "costa blanca north - inland" || v === "costa blanca north – inland") return "Costa Blanca nord – innland";
  if (v === "costa blanca south") return "Costa Blanca sør";
  if (v === "costa blanca north") return "Costa Blanca nord";
  if (v === "costa calida" || v === "costa cálida") return "Costa Cálida";
  return raw;
}

export function normalizePropertyForEditorial(property: Record<string, unknown>): Record<string, unknown> {
  return {
    ...property,
    property_type: normalizePropertyTypeNo(property.property_type ?? property.type),
    location: normalizePropertyLocationNo(property.location),
  };
}

function numberTokens(value: string): Set<string> {
  const result = new Set<string>();
  for (const token of value.match(/\d+(?:[.,]\d+)?/g) || []) {
    const normalized = token.replace(",", ".").replace(/^0+(?=\d)/, "");
    result.add(normalized);
  }
  return result;
}

export type EditorialApproval = {
  approved: boolean;
  status: "auto_approved" | "needs_review";
  reasons: string[];
};

export function evaluatePropertyEditorialApproval(
  property: Record<string, unknown>,
  editorial: Pick<PropertyEditorialNo, "headline_no" | "intro_no" | "bullets_no" | "orientation_no">,
): EditorialApproval {
  const normalizedProperty = normalizePropertyForEditorial(property);
  const source = propertyEditorialSource(normalizedProperty);
  const reasons: string[] = [];
  const publicText = [editorial.headline_no, editorial.intro_no, ...editorial.bullets_no].join(" ").replace(/\s+/g, " ").trim();

  if (!clean(property.ref)) reasons.push("missing_ref");
  if (!source.rawDescription || source.rawDescription.length < 40) reasons.push("weak_source_description");
  if (source.area === "Ikke angitt") reasons.push("unknown_location");
  if (!publicText) reasons.push("empty_editorial");
  if (/\b(?:ukjent|ikke angitt)\b/i.test(publicText)) reasons.push("public_unknown_placeholder");
  if (PROMOTIONAL.test(publicText)) reasons.push("promotional_language");
  if (editorial.orientation_no !== "Ikke angitt" && !source.usage) reasons.push("unsupported_usage_orientation");

  const sourceNumberText = [
    source.rawDescription,
    source.beds ?? "",
    source.baths ?? "",
    source.m2 ?? "",
    source.price ?? "",
    source.floor,
    source.epc,
    source.features.join(" "),
  ].join(" ");
  const sourceNumbers = numberTokens(sourceNumberText);
  const outputNumbers = numberTokens(publicText);
  const unsupportedNumbers = [...outputNumbers].filter((token) => !sourceNumbers.has(token));
  if (unsupportedNumbers.length) reasons.push(`unsupported_numbers:${unsupportedNumbers.join(",")}`);

  return {
    approved: reasons.length === 0,
    status: reasons.length === 0 ? "auto_approved" : "needs_review",
    reasons,
  };
}
