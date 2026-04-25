/**
 * Match a property's `location` string against the brand's area profiles.
 *
 * The agent often types the location as "Calpe, Costa Blanca" or
 * "Urb. La Manzanera, Calpe", so a strict slug-equal lookup misses. This
 * helper pulls every profile for the brand, then picks the best match by:
 *
 *   1. exact slug equality                      (calpe == calpe)
 *   2. profile slug appears as a dash-separated  (calpe-costa-blanca contains
 *      token in the location slug                "calpe")
 *   3. profile name appears as a whitespace-     ("Urb. La Manzanera, Calpe"
 *      separated token in the location           contains "calpe")
 *
 * Longer profile slugs win — so "calpe-norte" beats "calpe" when both match,
 * to give the most specific area.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PdfAreaProfile } from "./property-prospect";

function fold(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(s: string | undefined | null): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function rowToProfile(a: Record<string, unknown>): PdfAreaProfile {
  return {
    name: String(a.name || ""),
    slug: String(a.slug || ""),
    country: (a.country as string | null) ?? null,
    region: (a.region as string | null) ?? null,
    hero_blurb: (a.hero_blurb as string | null) ?? null,
    description: (a.description as string | null) ?? null,
    highlights: Array.isArray(a.highlights) ? (a.highlights as string[]) : [],
    climate: (a.climate as string | null) ?? null,
    lifestyle: (a.lifestyle as string | null) ?? null,
    photo_url: (a.photo_url as string | null) ?? null,
  };
}

function scoreMatch(profile: PdfAreaProfile, location: string): number {
  const locSlug = slugify(location);
  const locFolded = fold(location);
  const pSlug = profile.slug || slugify(profile.name);
  const pName = fold(profile.name);
  if (!pSlug && !pName) return 0;

  // 1. exact slug
  if (pSlug && locSlug === pSlug) return 100 + pSlug.length;

  // 2. dash-separated token in location slug
  if (pSlug) {
    const tokens = locSlug.split("-").filter(Boolean);
    if (tokens.includes(pSlug)) return 80 + pSlug.length;
    // multi-word slug as substring on a token boundary
    if (
      locSlug === pSlug ||
      locSlug.startsWith(`${pSlug}-`) ||
      locSlug.endsWith(`-${pSlug}`) ||
      locSlug.includes(`-${pSlug}-`)
    ) {
      return 70 + pSlug.length;
    }
  }

  // 3. profile name as a whole-word token in folded location
  if (pName) {
    const re = new RegExp(`(^|[^a-z0-9])${pName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(locFolded)) return 50 + pName.length;
  }

  return 0;
}

/**
 * Fetch all area profiles for the brand and return the best match for the
 * given property location, or null if none score above zero.
 */
export async function findAreaProfileForLocation(
  supabase: SupabaseClient,
  brandId: string,
  location: string | undefined | null,
): Promise<PdfAreaProfile | null> {
  if (!brandId || !location) return null;
  const { data } = await supabase
    .from("area_profiles")
    .select("*")
    .eq("brand_id", brandId);
  const rows = (data || []) as Record<string, unknown>[];
  if (rows.length === 0) return null;

  let best: PdfAreaProfile | null = null;
  let bestScore = 0;
  for (const r of rows) {
    const profile = rowToProfile(r);
    const score = scoreMatch(profile, location);
    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Same logic for the multi-property PDF: returns a map keyed by the
 * slugified property location → best matching profile. The PDF renderer
 * only knows how to look up by slug, so we key the result by the slug it
 * already computes per property.
 */
export async function findAreaProfilesForLocations(
  supabase: SupabaseClient,
  brandId: string,
  locations: (string | undefined | null)[],
): Promise<Record<string, PdfAreaProfile>> {
  if (!brandId || locations.length === 0) return {};
  const { data } = await supabase
    .from("area_profiles")
    .select("*")
    .eq("brand_id", brandId);
  const rows = (data || []) as Record<string, unknown>[];
  if (rows.length === 0) return {};

  const profiles = rows.map(rowToProfile);
  const out: Record<string, PdfAreaProfile> = {};
  const seen = new Set<string>();

  for (const loc of locations) {
    if (!loc) continue;
    const locSlug = slugify(loc);
    if (!locSlug || seen.has(locSlug)) continue;
    seen.add(locSlug);

    let best: PdfAreaProfile | null = null;
    let bestScore = 0;
    for (const p of profiles) {
      const score = scoreMatch(p, loc);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (best) out[locSlug] = best;
  }
  return out;
}
