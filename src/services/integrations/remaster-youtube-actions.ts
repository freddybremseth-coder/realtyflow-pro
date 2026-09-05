import { OAuth2Client } from "google-auth-library";
import { getGoogleCredentials } from "@/lib/oauth/providers";
import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";
import { createYoutubeOAuthClient } from "@/services/integrations/youtube-oauth-client";

const REMASTER_BRAND_ID = "remasterfreddy";

async function getVerifiedClient() {
  const channels = await getChannelsByBrand(REMASTER_BRAND_ID, "youtube");

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
      const client = createYoutubeOAuthClient(auth);
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

export async function listRemasterChannelVideos(maxResults = 50) {
  const { client, channelId, channelTitle } = await getVerifiedClient();
  const search = await client.search.list({
    part: ["snippet"],
    channelId,
    order: "date",
    type: ["video"],
    maxResults: Math.max(1, Math.min(maxResults, 50)),
  });
  const ids = (search.data.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
  if (!ids.length) return { channelId, channelTitle, videos: [] };

  const response = await client.videos.list({ part: ["snippet", "statistics"], id: ids });
  const videos = (response.data.items ?? []).filter((item) => item.id && item.snippet?.channelId === channelId).map((item) => ({
    videoId: String(item.id),
    title: item.snippet?.title || "Re-Master Freddy",
    publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
    description: item.snippet?.description || "",
    tags: item.snippet?.tags || [],
    viewCount: Number(item.statistics?.viewCount || 0),
    likeCount: Number(item.statistics?.likeCount || 0),
    commentCount: Number(item.statistics?.commentCount || 0),
  }));
  return { channelId, channelTitle, videos };
}

export async function listRemasterPlaylists(maxResults = 50) {
  const { client, channelId, channelTitle } = await getVerifiedClient();
  const response = await client.playlists.list({
    part: ["snippet", "contentDetails"],
    channelId,
    maxResults: Math.max(1, Math.min(maxResults, 50)),
  });
  return {
    channelId,
    channelTitle,
    playlists: (response.data.items ?? []).map((item) => ({
      playlistId: item.id || "",
      title: item.snippet?.title || "",
      description: item.snippet?.description || "",
      itemCount: Number(item.contentDetails?.itemCount || 0),
    })).filter((item) => item.playlistId),
  };
}

export async function addRemasterVideoToPlaylist(videoId: string, playlistId: string) {
  const { client, channelId, channelTitle } = await getVerifiedClient();
  const [videoResponse, playlistResponse] = await Promise.all([
    client.videos.list({ part: ["snippet"], id: [videoId] }),
    client.playlists.list({ part: ["snippet"], id: [playlistId] }),
  ]);
  const video = videoResponse.data.items?.[0];
  const playlist = playlistResponse.data.items?.[0];
  if (!video?.id || video.snippet?.channelId !== channelId) throw new Error("Videoen tilhører ikke verifisert Re-Master Freddy-kanal.");
  if (!playlist?.id || playlist.snippet?.channelId !== channelId) throw new Error("Spillelisten tilhører ikke verifisert Re-Master Freddy-kanal.");

  const existing = await client.playlistItems.list({ part: ["id"], playlistId, videoId, maxResults: 1 });
  if (existing.data.items?.length) {
    return { videoId, playlistId, channelId, channelTitle, duplicate: true };
  }

  await client.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    },
  });
  return { videoId, playlistId, channelId, channelTitle, duplicate: false };
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
