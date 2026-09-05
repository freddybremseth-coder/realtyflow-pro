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

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function listRemasterChannelVideos(maxResults = 50) {
  const { client, channelId, channelTitle } = await getVerifiedClient();
  const requested = Math.max(1, Math.min(maxResults, 500));

  const channelResponse = await client.channels.list({
    part: ["contentDetails"],
    id: [channelId],
  });
  const uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return { channelId, channelTitle, videos: [] };

  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < requested) {
    const page = await client.playlistItems.list({
      part: ["contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(50, requested - ids.length),
      pageToken,
    });
    for (const item of page.data.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
      if (ids.length >= requested) break;
    }
    pageToken = page.data.nextPageToken || undefined;
    if (!pageToken) break;
  }

  if (!ids.length) return { channelId, channelTitle, videos: [] };

  const itemById = new Map<string, any>();
  for (const batch of chunks(ids, 50)) {
    const response = await client.videos.list({ part: ["snippet", "statistics"], id: batch });
    for (const item of response.data.items ?? []) {
      if (item.id && item.snippet?.channelId === channelId) itemById.set(String(item.id), item);
    }
  }

  const videos = ids.flatMap((id) => {
    const item = itemById.get(id);
    if (!item) return [];
    return [{
      videoId: String(item.id),
      title: item.snippet?.title || "Re-Master Freddy",
      publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
      description: item.snippet?.description || "",
      tags: item.snippet?.tags || [],
      viewCount: Number(item.statistics?.viewCount || 0),
      likeCount: Number(item.statistics?.likeCount || 0),
      commentCount: Number(item.statistics?.commentCount || 0),
    }];
  });
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

export async function createRemasterPlaylist(input: { title: string; description: string }) {
  const { client, channelId, channelTitle } = await getVerifiedClient();
  const title = input.title.trim().slice(0, 150);
  const description = input.description.trim().slice(0, 5000);
  if (!title) throw new Error("Re-Master playlist title is required.");

  let pageToken: string | undefined;
  do {
    const page = await client.playlists.list({
      part: ["snippet"],
      channelId,
      maxResults: 50,
      pageToken,
    });
    const duplicate = (page.data.items ?? []).find((item) => item.snippet?.title?.trim().toLowerCase() === title.toLowerCase());
    if (duplicate?.id) {
      return { playlistId: duplicate.id, title, channelId, channelTitle, duplicate: true };
    }
    pageToken = page.data.nextPageToken || undefined;
  } while (pageToken);

  const response = await client.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title, description },
      status: { privacyStatus: "public" },
    },
  });
  const playlistId = response.data.id;
  if (!playlistId) throw new Error("YouTube created no playlist id for Re-Master Freddy.");
  if (response.data.snippet?.channelId && response.data.snippet.channelId !== channelId) {
    throw new Error("Created playlist did not resolve to the verified Re-Master Freddy channel.");
  }
  return { playlistId, title, channelId, channelTitle, duplicate: false };
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
