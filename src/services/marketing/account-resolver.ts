/**
 * Phase 7.1C — PublishingAccountResolver. Oversetter brand + kanal → riktig
 * KONTO (eksplisitt external_id) fra eksisterende social_channels. Publisher får
 * aldri generelle credentials og «velger» — den får en eksplisitt account_id.
 * Fail closed: ingen aktiv konto → ACCOUNT_NOT_FOUND (publiserer aldri på gjett).
 */

import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

/** Marketing-kanal → social_channels.platform. */
const CHANNEL_TO_PLATFORM: Record<string, string> = {
  instagram: "instagram",
  facebook: "facebook",
  linkedin: "linkedin",
  youtube: "youtube",
  youtube_shorts: "youtube",
  tiktok: "tiktok",
};

export interface ResolvedAccount {
  brandId: string;
  channel: string;
  platform: string;
  accountId: string; // external_id — den faktiske kontoen/siden
  displayName: string;
}

export async function resolvePublishingAccount(
  supabase: MarketingSupabaseLike,
  args: { brandId: string; channel: string },
): Promise<ResolvedAccount> {
  const platform = CHANNEL_TO_PLATFORM[args.channel];
  if (!platform) throw new Error(`ACCOUNT_NOT_FOUND: ukjent kanal «${args.channel}».`);

  const { data } = await supabase
    .from("social_channels")
    .select("brand_id, platform, external_id, display_name, is_active")
    .eq("brand_id", args.brandId)
    .eq("platform", platform)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) throw new Error(`ACCOUNT_NOT_FOUND: ingen aktiv ${platform}-konto for brand «${args.brandId}».`);
  // P0: kontoen MÅ tilhøre det etterspurte brandet.
  if (data.brand_id !== args.brandId) throw new Error(`BRAND_MISMATCH: konto tilhører «${data.brand_id}», ikke «${args.brandId}».`);

  return { brandId: data.brand_id, channel: args.channel, platform, accountId: String(data.external_id), displayName: data.display_name };
}
