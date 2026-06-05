import { youtube } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { getGoogleCredentials } from "@/lib/oauth/providers";

interface Candidate {
  source: string;
  refreshToken: string;
  expectedChannelId?: string;
}

const ALIASES: Record<string, string[]> = {
  remasterfreddy: ["neuralbeat"],
  neuralbeat: ["remasterfreddy"],
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/^["']|["']$/g, "").trim() : "";
}

async function candidatesForBrand(brandId: string): Promise<Candidate[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service configuration is missing");

  const results: Candidate[] = [];
  const seen = new Set<string>();
  const supabase = createClient(url, key);

  try {
    const { getChannelsByBrand, getDecryptedTokens } = await import("@/lib/oauth/channels");
    const channels = await getChannelsByBrand(brandId, "youtube");
    for (const channel of channels) {
      const tokens = await getDecryptedTokens(channel.id);
      const refreshToken = clean(tokens?.refreshToken);
      if (!refreshToken || seen.has(refreshToken)) continue;
      seen.add(refreshToken);
      results.push({
        source: `oauth_tokens:${channel.display_name}`,
        refreshToken,
        expectedChannelId: channel.external_id || undefined,
      });
    }
  } catch (error) {
    console.warn("[YouTube Health] Channel token lookup failed:", error instanceof Error ? error.message : error);
  }

  for (const candidateBrandId of [brandId, ...(ALIASES[brandId] || [])]) {
    const { data } = await supabase
      .from("brand_settings")
      .select("settings")
      .eq("brand_id", candidateBrandId)
      .maybeSingle();
    const refreshToken = clean(data?.settings?.youtube_refresh_token);
    if (!refreshToken || seen.has(refreshToken)) continue;
    seen.add(refreshToken);
    results.push({ source: `brand:${candidateBrandId}`, refreshToken });
  }

  return results;
}

function isRevoked(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid[_\s]grant|expired|revoked/i.test(message);
}

export async function checkBrandYouTubeHealth(brandId: string) {
  const candidates = await candidatesForBrand(brandId);
  if (candidates.length === 0) {
    return {
      connected: false,
      configured: false,
      reason: "missing_brand_token",
      message: "Ingen brand-spesifikk YouTube-tilkobling er lagret.",
    };
  }

  const credentials = getGoogleCredentials();
  let sawRevokedToken = false;

  for (const candidate of candidates) {
    try {
      const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
      auth.setCredentials({ refresh_token: candidate.refreshToken });
      await auth.getAccessToken();

      const client = youtube({ version: "v3", auth });
      const result = await client.channels.list({
        part: ["snippet", "statistics"],
        mine: true,
      });
      const item = result.data.items?.[0];
      if (!item?.id) continue;
      if (candidate.expectedChannelId && candidate.expectedChannelId !== item.id) continue;

      return {
        connected: true,
        configured: true,
        tokenSource: candidate.source,
        channel: {
          id: item.id,
          title: item.snippet?.title || "",
          thumbnailUrl: item.snippet?.thumbnails?.high?.url || "",
          subscriberCount: Number(item.statistics?.subscriberCount || 0),
          videoCount: Number(item.statistics?.videoCount || 0),
          viewCount: Number(item.statistics?.viewCount || 0),
        },
      };
    } catch (error) {
      if (isRevoked(error)) sawRevokedToken = true;
    }
  }

  return {
    connected: false,
    configured: true,
    reason: sawRevokedToken ? "token_expired_or_revoked" : "connection_failed",
    message: sawRevokedToken
      ? "YouTube-tokenet er utløpt eller tilbakekalt."
      : "Ingen brand-spesifikk YouTube-tilkobling kunne verifiseres.",
  };
}
