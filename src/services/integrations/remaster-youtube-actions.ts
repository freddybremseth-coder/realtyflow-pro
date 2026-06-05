import { youtube } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import { getGoogleCredentials } from "@/lib/oauth/providers";
import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";

const BRAND_IDS = ["remasterfreddy", "neuralbeat"];

async function getVerifiedClient() {
  const channelLists = await Promise.all(
    BRAND_IDS.map((brandId) => getChannelsByBrand(brandId, "youtube")),
  );
  const channels = channelLists.flat().filter(
    (channel, index, all) => all.findIndex((item) => item.id === channel.id) === index,
  );

  if (channels.length === 0) {
    throw new Error("Re-Master Freddy har ingen aktiv YouTube-kanaltilkobling.");
  }

  const credentials = getGoogleCredentials();
  for (const channel of channels) {
    const tokens = await getDecryptedTokens(channel.id);
    const refreshToken = tokens?.refreshToken?.trim();
    if (!refreshToken) continue;

    try {
      const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
      auth.setCredentials({ refresh_token: refreshToken });
      await auth.getAccessToken();
      const client = youtube({ version: "v3", auth });
      const mine = await client.channels.list({ part: ["snippet"], mine: true });
      const verified = mine.data.items?.[0];
      if (!verified?.id) continue;
      if (channel.external_id && channel.external_id !== verified.id) continue;
      return {
        client,
        channelId: verified.id,
        channelTitle: verified.snippet?.title || channel.display_name,
      };
    } catch {
      continue;
    }
  }

  throw new Error("Re-Master Freddy YouTube-tilkoblingen er utløpt eller peker mot feil kanal.");
}

export async function updateRemasterVideoMetadata(
  videoId: string,
  metadata: { title?: string; description?: string; tags?: string[] },
) {
  const { client, channelId, channelTitle } = await getVerifiedClient();
  const currentResponse = await client.videos.list({
    part: ["snippet", "status"],
    id: [videoId],
  });
  const current = currentResponse.data.items?.[0];
  if (!current?.id || current.snippet?.channelId !== channelId) {
    throw new Error(`Videoen tilhører ikke den verifiserte Re-Master Freddy-kanalen (${channelTitle}).`);
  }

  const snippet = current.snippet;
  await client.videos.update({
    part: ["snippet"],
    requestBody: {
      id: videoId,
      snippet: {
        title: metadata.title || snippet.title || "Re-Master Freddy",
        description: metadata.description ?? snippet.description ?? "",
        tags: metadata.tags || snippet.tags || [],
        categoryId: snippet.categoryId || "10",
        defaultLanguage: snippet.defaultLanguage || "en",
      },
    },
  });

  return { videoId, channelId, channelTitle };
}
