/**
 * Property-driven Marketing OS adapter.
 *
 * Uses the SAME RealtyFlow inventory source as /inventory:
 *   public.properties + public.property_brand_visibility
 *
 * A resolved property supplies BOTH media and independent provenance for AI copy.
 * No fuzzy cross-brand selection: the property must be explicitly visible for the
 * requested brand and currently available.
 */
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export interface InventoryMarketingProperty {
  id: string;
  ref: string | null;
  title: string;
  description: string;
  location: string;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  plotM2: number | null;
  propertyType: string | null;
  energyRating: string | null;
  pool: boolean | null;
  garage: boolean | null;
  primaryImage: string;
  gallery: string[];
  source: string | null;
  factSources: Array<{ claim: string; source: string }>;
}

const isHttps = (value: unknown): value is string => typeof value === "string" && /^https:\/\//i.test(value);

function firstHttps(...values: unknown[]): string | null {
  for (const value of values) {
    if (isHttps(value)) return value;
    if (Array.isArray(value)) {
      const hit = value.find(isHttps);
      if (hit) return hit;
    }
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function propertyFacts(row: any): Array<{ claim: string; source: string }> {
  const source = `RealtyFlow Inventory property:${row.id}${row.ref ? ` ref:${row.ref}` : ""}`;
  const facts: Array<{ claim: string; source: string }> = [];
  const add = (claim: string | null) => { if (claim) facts.push({ claim, source }); };
  add(row.ref ? `Referanse: ${row.ref}` : null);
  add((row.title_no || row.title) ? `Tittel: ${row.title_no || row.title}` : null);
  add(row.location ? `Lokasjon: ${row.location}` : null);
  const price = asNumber(row.price);
  add(price != null && price > 0 ? `Pris: €${price}` : null);
  const bedrooms = asNumber(row.bedrooms);
  add(bedrooms != null && bedrooms > 0 ? `Soverom: ${bedrooms}` : null);
  const bathrooms = asNumber(row.bathrooms);
  add(bathrooms != null && bathrooms > 0 ? `Bad: ${bathrooms}` : null);
  const area = asNumber(row.built_area) ?? asNumber(row.area_m2);
  add(area != null && area > 0 ? `Boligareal: ${area} m²` : null);
  const plot = asNumber(row.plot_size);
  add(plot != null && plot > 0 ? `Tomt: ${plot} m²` : null);
  add(row.property_type || row.type ? `Boligtype: ${row.property_type || row.type}` : null);
  if (row.pool === true) add("Privat/felles basseng: ja");
  if (row.garage === true) add("Garasje/parkering oppgitt: ja");
  if (row.energy_rating && !/^(x|unknown|ukjent|-)$/i.test(String(row.energy_rating))) add(`Energimerking: ${row.energy_rating}`);
  if (row.description_no || row.description) add(`Inventory-beskrivelse: ${row.description_no || row.description}`);
  return facts;
}

function toResolved(row: any): InventoryMarketingProperty | null {
  const primaryImage = firstHttps(row.primary_image, row.images, row.gallery);
  if (!primaryImage) return null;
  const gallery = [
    ...(Array.isArray(row.images) ? row.images : []),
    ...(Array.isArray(row.gallery) ? row.gallery : []),
  ].filter(isHttps).filter((u, i, a) => u !== primaryImage && a.indexOf(u) === i);
  return {
    id: String(row.id),
    ref: row.ref ? String(row.ref) : null,
    title: String(row.title_no || row.title || "Eiendom"),
    description: String(row.description_no || row.description || ""),
    location: String(row.location || ""),
    price: asNumber(row.price),
    bedrooms: asNumber(row.bedrooms),
    bathrooms: asNumber(row.bathrooms),
    areaM2: asNumber(row.built_area) ?? asNumber(row.area_m2),
    plotM2: asNumber(row.plot_size),
    propertyType: row.property_type || row.type ? String(row.property_type || row.type) : null,
    energyRating: row.energy_rating ? String(row.energy_rating) : null,
    pool: typeof row.pool === "boolean" ? row.pool : null,
    garage: typeof row.garage === "boolean" ? row.garage : null,
    primaryImage,
    gallery,
    source: row.source ? String(row.source) : null,
    factSources: propertyFacts(row),
  };
}

async function loadProperty(supabase: MarketingSupabaseLike, propertyId: string): Promise<InventoryMarketingProperty | null> {
  const { data } = await supabase.from("properties").select("*").eq("id", propertyId).eq("status", "TILGJENGELIG").maybeSingle();
  return data ? toResolved(data) : null;
}

/**
 * Resolve one marketable property for a brand.
 * - explicit propertyId: must be visible for the brand (fail closed)
 * - automatic: walks the brand-visibility ranking and picks the first AVAILABLE
 *   property with a public HTTPS image.
 */
export async function resolveInventoryMarketingProperty(
  supabase: MarketingSupabaseLike,
  args: { brandId: string; propertyId?: string | null },
): Promise<InventoryMarketingProperty> {
  if (args.propertyId) {
    const { data: visibility } = await supabase.from("property_brand_visibility")
      .select("property_id, brand_id, visible")
      .eq("property_id", args.propertyId)
      .eq("brand_id", args.brandId)
      .eq("visible", true)
      .maybeSingle();
    if (!visibility) throw new Error(`INVENTORY_PROPERTY_NOT_VISIBLE: ${args.propertyId} er ikke synlig for ${args.brandId}`);
    const property = await loadProperty(supabase, args.propertyId);
    if (!property) throw new Error(`INVENTORY_PROPERTY_NOT_MARKETABLE: ${args.propertyId} mangler tilgjengelig status eller public HTTPS-bilde`);
    return property;
  }

  const { data: visibleRows, error } = await supabase.from("property_brand_visibility")
    .select("property_id, brand_id, visible, manual_override, score, updated_at")
    .eq("brand_id", args.brandId)
    .eq("visible", true)
    .order("manual_override", { ascending: false })
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`INVENTORY_VISIBILITY_LOOKUP_FAILED: ${error.message}`);

  for (const candidate of (visibleRows ?? []) as any[]) {
    if (!candidate?.property_id) continue;
    const property = await loadProperty(supabase, String(candidate.property_id));
    if (property) return property;
  }
  throw new Error(`INVENTORY_PROPERTY_NOT_FOUND: ingen tilgjengelig ${args.brandId}-bolig med public HTTPS-bilde`);
}
