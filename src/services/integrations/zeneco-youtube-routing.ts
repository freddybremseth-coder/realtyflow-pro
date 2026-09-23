/**
 * Immutable upload destination for Zen Eco Homes.
 * Human-facing handle: https://www.youtube.com/@ZenEcoHomes.
 * YouTube handles may change; the stable channel ID is what we verify
 * against the connected OAuth account before any video is uploaded.
 */
export const ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID = "UCT5vAXY68LUXewOBF9onYew";

export function requiresZenecoCanonicalYoutubeChannel(brandId?: string): boolean {
  return String(brandId ?? "").trim().toLowerCase() === "zeneco";
}

export function assertZenecoYoutubeUploadDestination(
  brandId: string | undefined,
  authenticatedChannelId: string | null | undefined,
  activeChannelIds: readonly string[],
): void {
  if (!requiresZenecoCanonicalYoutubeChannel(brandId)) return;
  const actual = String(authenticatedChannelId ?? "").trim();
  if (!actual || actual !== ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID) {
    throw new Error(
      `ZENECO_YOUTUBE_CHANNEL_MISMATCH: Den innloggede YouTube-kontoen peker mot ${actual || "ukjent kanal"}, ikke @ZenEcoHomes (${ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID}). Ingen video ble lastet opp. Koble riktig kanal under RealtyFlow → Tilkoblinger.`,
    );
  }
  if (activeChannelIds.length !== 1 || activeChannelIds[0] !== ZENECO_CANONICAL_YOUTUBE_CHANNEL_ID) {
    throw new Error(
      "ZENECO_YOUTUBE_CHANNEL_CONFIGURATION: RealtyFlow må ha nøyaktig én aktiv Zen Eco Homes YouTube-kanal, @ZenEcoHomes. Ingen video ble lastet opp.",
    );
  }
}
