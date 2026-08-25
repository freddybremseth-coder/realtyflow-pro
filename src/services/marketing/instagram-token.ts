import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";

export async function resolveBrandInstagramAccessToken(brandId: string): Promise<{ accessToken: string; channelId: string; accountId: string }> {
  const id = brandId?.trim();
  if (!id) throw new Error("INSTAGRAM_TOKEN_BRAND_REQUIRED");

  const channels = await getChannelsByBrand(id, "instagram");
  if (channels.length !== 1) {
    throw new Error(channels.length === 0
      ? `INSTAGRAM_CHANNEL_MISSING: ${id}`
      : `INSTAGRAM_CHANNEL_AMBIGUOUS: ${id} har ${channels.length} aktive Instagram-kanaler`);
  }

  const channel = channels[0];
  const tokens = await getDecryptedTokens(channel.id);
  const accessToken = tokens?.accessToken?.trim();
  if (!accessToken) throw new Error(`INSTAGRAM_ACCESS_TOKEN_MISSING: ${id}`);

  return {
    accessToken,
    channelId: String(channel.id),
    accountId: String(channel.external_id ?? ""),
  };
}
