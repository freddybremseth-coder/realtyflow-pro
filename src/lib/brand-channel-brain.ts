import { OWNED_GROWTH_BRANDS, type GrowthBrandDefinition } from "@/lib/marketing/brand-registry";
import type { SocialAutopilotRow } from "@/lib/social-autopilot";

export const FREDDY_BRAND_IDS = ["freddyb", "freddypublishing", "freddyai"] as const;
export type FreddyBrandId = (typeof FREDDY_BRAND_IDS)[number];

export interface BrandChannelState {
  brand: GrowthBrandDefinition;
  connectedChannels: string[];
  pilotReadyChannels: string[];
  blockedChannels: Array<{ platform: string; reason: string }>;
  plannedOnlyChannels: string[];
}

export function freddyBrandDefinitions() {
  return FREDDY_BRAND_IDS.map((id) => OWNED_GROWTH_BRANDS.find((brand) => brand.id === id)).filter((brand): brand is GrowthBrandDefinition => Boolean(brand));
}

export function buildFreddyBrandChannelState(rows: SocialAutopilotRow[]): BrandChannelState[] {
  return freddyBrandDefinitions().map((brand) => {
    const brandRows = rows.filter((row) => row.brandId === brand.id);
    const connectedChannels = brandRows.filter((row) => row.connected && row.platform).map((row) => String(row.platform));
    const pilotReadyChannels = brandRows.filter((row) => row.pilotReady && row.platform).map((row) => String(row.platform));
    const blockedChannels = brandRows
      .filter((row) => row.connected && !row.pilotReady && row.platform && row.pilotBlockReason)
      .map((row) => ({ platform: String(row.platform), reason: String(row.pilotBlockReason) }));
    const plannedOnlyChannels = brand.plannedChannels.filter((channel) => !connectedChannels.includes(channel));
    return { brand, connectedChannels, pilotReadyChannels, blockedChannels, plannedOnlyChannels };
  });
}
