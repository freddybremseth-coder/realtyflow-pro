import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { OAuth2Client } from "google-auth-library";
import { getGoogleCredentials } from "@/lib/oauth/providers";
import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";
import { createYoutubeOAuthClient } from "@/services/integrations/youtube-oauth-client";

const REMASTER_BRAND_ID = "remasterfreddy";

type PrivacyStatus = "private" | "unlisted" | "public";

async function getVerifiedLongFormClient() {
  const channels = await getChannelsByBrand(REMASTER_BRAND_ID, "youtube");
  if (channels.length === 0) throw new Error("Re-Master Freddy har ingen aktiv YouTube-kanaltilkobling.");

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

function sanitizeText(value: string, maxLength: number) {
  return String(value || "").replace(/[<>]/g, "").slice(0, maxLength).trim();
}

function sanitizeTags(tags: string[]) {
  const output: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const raw of tags || []) {
    const tag = String(raw).replace(/[<>#"]/g, "").trim().slice(0, 90);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    const nextTotal = total + tag.length + 1;
    if (nextTotal > 450) break;
    seen.add(tag.toLowerCase());
    output.push(tag);
    total = nextTotal;
  }
  return output;
}

/**
 * Streams an MP4 from disk to YouTube. This avoids Buffering a 1–3 hour video
 * in Node memory. The connected Re-Master channel is verified before upload.
 */
export async function uploadRemasterLongFormFile(input: {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus?: PrivacyStatus;
}) {
  const file = await stat(input.videoPath);
  if (!file.isFile() || file.size < 1024 * 1024) throw new Error("Long-form MP4 is missing or unexpectedly small.");

  const { client, channelId, channelTitle } = await getVerifiedLongFormClient();
  const safeTitle = sanitizeText(input.title, 100) || "Re-Master Freddy Mediterranean Mix";
  const safeDescription = sanitizeText(input.description, 4900);
  const safeTags = sanitizeTags(input.tags);
  const privacyStatus = input.privacyStatus || "private";

  const upload = await client.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: safeTitle,
        description: safeDescription,
        tags: safeTags,
        categoryId: "10",
        defaultLanguage: "en",
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: createReadStream(input.videoPath),
      mimeType: "video/mp4",
    },
  });

  const videoId = upload.data.id || "";
  if (!videoId) throw new Error("YouTube upload completed without a video id.");

  const verify = await client.videos.list({ part: ["snippet", "status"], id: [videoId] });
  const video = verify.data.items?.[0];
  if (!video?.id) throw new Error(`YouTube returned ${videoId}, but verification did not find the video.`);
  if (video.snippet?.channelId !== channelId) {
    throw new Error(`Long-form upload landed on the wrong channel (${video.snippet?.channelId || "unknown"}).`);
  }

  return {
    videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    channelId,
    channelTitle,
    privacyStatus: video.status?.privacyStatus || privacyStatus,
    fileSizeBytes: file.size,
  };
}

export async function ensureRemasterLongFormPlaylist(title: string, description: string) {
  const { client, channelId } = await getVerifiedLongFormClient();
  let pageToken: string | undefined;
  do {
    const response = await client.playlists.list({
      part: ["snippet"],
      channelId,
      maxResults: 50,
      pageToken,
    });
    const found = response.data.items?.find((item) => item.snippet?.title === title);
    if (found?.id) return { playlistId: found.id, created: false };
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  const created = await client.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: sanitizeText(title, 150),
        description: sanitizeText(description, 4900),
      },
      status: { privacyStatus: "public" },
    },
  });
  if (!created.data.id) throw new Error("YouTube playlist creation returned no id.");
  return { playlistId: created.data.id, created: true };
}

export async function addRemasterLongFormToPlaylist(videoId: string, playlistId: string) {
  const { client, channelId } = await getVerifiedLongFormClient();
  const [videoResponse, playlistResponse] = await Promise.all([
    client.videos.list({ part: ["snippet"], id: [videoId] }),
    client.playlists.list({ part: ["snippet"], id: [playlistId] }),
  ]);
  if (videoResponse.data.items?.[0]?.snippet?.channelId !== channelId) {
    throw new Error("Long-form video does not belong to the verified Re-Master channel.");
  }
  if (playlistResponse.data.items?.[0]?.snippet?.channelId !== channelId) {
    throw new Error("Long-form playlist does not belong to the verified Re-Master channel.");
  }

  const existing = await client.playlistItems.list({ part: ["id"], playlistId, videoId, maxResults: 1 });
  if (existing.data.items?.length) return { duplicate: true };

  await client.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    },
  });
  return { duplicate: false };
}

export async function createRemasterTopLevelComment(videoId: string, text: string) {
  const { client, channelId } = await getVerifiedLongFormClient();
  const videoResponse = await client.videos.list({ part: ["snippet"], id: [videoId] });
  if (videoResponse.data.items?.[0]?.snippet?.channelId !== channelId) {
    throw new Error("Cannot comment on a video outside the verified Re-Master channel.");
  }

  const response = await client.commentThreads.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        videoId,
        topLevelComment: {
          snippet: { textOriginal: sanitizeText(text, 9000) },
        },
      },
    },
  });
  return { commentThreadId: response.data.id || null };
}
