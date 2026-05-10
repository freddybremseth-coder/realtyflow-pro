/**
 * normalizeBrand — legacy brand-id matching for the social_accounts table.
 *
 * History: brand IDs were written inconsistently across the old code paths
 * (`zen-eco` vs `zeneco` vs `Zen Eco Homes`), so the publisher used this to
 * smash them all into a single comparison key. The new `social_channels`
 * table uses exact matches on `brand_id`, so this function only exists for
 * the LEGACY_FALLBACK branch in resolveChannel — once that goes away, this
 * file goes with it.
 *
 * Extracted into its own module so resolve-channel.ts can import it without
 * pulling in the full `services/publishing/publisher.ts` (which has Supabase
 * + Facebook helpers as side imports).
 */
export function normalizeBrand(b: string): string {
  return b
    .toLowerCase()
    .replace(/[-_.\s]/g, "")
    .replace(/homes$/, "")
    .replace(/pro$/, "");
}
