import { growthBrandDefinition, socialDestinationOwnerBrandId } from "@/lib/marketing/brand-registry";

type Binding = { brand_id: string; platform: string; external_id: string };

/** Only recognize sharing already defined by the brand registry and property scope.
 * This does not establish provider health or waive duplicate bindings per brand.
 */
export function isExpectedChannelSharing(bindings: Binding[]): boolean {
  if (bindings.length < 2) return false;
  const { platform, external_id: externalId } = bindings[0];
  if (!externalId || bindings.some((row) => row.platform !== platform || row.external_id !== externalId)) return false;
  if (bindings.some((row) => !growthBrandDefinition(row.brand_id))) return false;

  if (platform === "facebook" || platform === "instagram") {
    const owner = socialDestinationOwnerBrandId(bindings[0].brand_id, platform);
    // The owner must have this exact destination, not just a compatible brand name.
    return bindings.some((row) => row.brand_id === owner)
      && bindings.every((row) => socialDestinationOwnerBrandId(row.brand_id, platform) === owner);
  }

  if (platform === "google_search_console" && externalId.startsWith("sc-domain:")) {
    const domain = externalId.slice("sc-domain:".length).toLowerCase();
    if (!domain || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(domain)) return false;
    return bindings.every((row) => {
      const website = growthBrandDefinition(row.brand_id)?.website;
      if (!website) return false;
      try {
        const host = new URL(website).hostname.toLowerCase();
        return host === domain || host.endsWith(`.${domain}`);
      } catch { return false; }
    });
  }
  return false;
}
