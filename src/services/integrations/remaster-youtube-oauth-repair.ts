import { getServiceSupabase } from "@/services/marketing/campaign-production";

const REMASTER_BRAND_ID = "remasterfreddy";
const PLAYLIST_DESCRIPTION =
  "Long-form Mediterranean deep-house mixes by Re-Master Freddy. Selected editions are presented with ZenEcoHomes Costa Blanca visuals.";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

interface YoutubePlaylistItem {
  id?: string;
  snippet?: { title?: string; channelId?: string };
}

async function youtubeJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${YOUTUBE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `YouTube API failed with ${response.status}`);
  }
  return data;
}

async function verifyChannel(accessToken: string, expectedChannelId: string) {
  const data = await youtubeJson<{ items?: Array<{ id?: string }> }>(
    accessToken,
    "/channels?part=id&mine=true&maxResults=1",
  );
  const actual = data.items?.[0]?.id || "";
  if (!actual) throw new Error("YouTube OAuth returned no managed channel.");
  if (actual !== expectedChannelId) {
    throw new Error(`YouTube channel mismatch: expected ${expectedChannelId}, got ${actual}.`);
  }
}

async function listPlaylists(accessToken: string, channelId: string) {
  const playlists = new Map<string, string>();
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      part: "snippet",
      channelId,
      maxResults: "50",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const data = await youtubeJson<{
      items?: YoutubePlaylistItem[];
      nextPageToken?: string;
    }>(accessToken, `/playlists?${query.toString()}`);
    for (const item of data.items || []) {
      if (item.id && item.snippet?.title) playlists.set(item.snippet.title, item.id);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return playlists;
}

async function createPlaylist(accessToken: string, title: string) {
  const data = await youtubeJson<{ id?: string }>(accessToken, "/playlists?part=snippet,status", {
    method: "POST",
    body: JSON.stringify({
      snippet: { title, description: PLAYLIST_DESCRIPTION },
      status: { privacyStatus: "public" },
    }),
  });
  if (!data.id) throw new Error(`YouTube created playlist ${title} without an id.`);
  return data.id;
}

async function videoBelongsToChannel(accessToken: string, videoId: string, channelId: string) {
  const query = new URLSearchParams({ part: "snippet", id: videoId });
  const data = await youtubeJson<{ items?: Array<{ snippet?: { channelId?: string } }> }>(
    accessToken,
    `/videos?${query.toString()}`,
  );
  return data.items?.[0]?.snippet?.channelId === channelId;
}

async function playlistContainsVideo(accessToken: string, playlistId: string, videoId: string) {
  const query = new URLSearchParams({
    part: "id",
    playlistId,
    videoId,
    maxResults: "1",
  });
  const data = await youtubeJson<{ items?: Array<{ id?: string }> }>(
    accessToken,
    `/playlistItems?${query.toString()}`,
  );
  return Boolean(data.items?.length);
}

async function addVideo(accessToken: string, playlistId: string, videoId: string) {
  await youtubeJson(accessToken, "/playlistItems?part=snippet", {
    method: "POST",
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    }),
  });
}

/**
 * Repair Re-Master playlists synchronously while the access token returned by
 * Google's authorization-code exchange is known-good. This deliberately does
 * not use OAuth2Client or a refresh token, so playlist bootstrap cannot be
 * blocked by a revoked/stale refresh-token path immediately after reconnect.
 */
export async function repairRemasterPlaylistsWithFreshAccessToken(input: {
  brandId: string;
  accessToken: string;
  channelId: string;
}) {
  if (input.brandId !== REMASTER_BRAND_ID) return { skipped: true, repaired: 0 };

  await verifyChannel(input.accessToken, input.channelId);

  const supabase = getServiceSupabase();
  if (!supabase) throw new Error("Supabase service client is not configured.");

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: jobs, error } = await supabase
    .from("remaster_mix_jobs")
    .select("id,playlist_name,youtube_video_id,status,updated_at")
    .eq("status", "completed")
    .not("youtube_video_id", "is", null)
    .not("playlist_name", "is", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Could not load completed Re-Master mixes: ${error.message}`);

  const playlists = await listPlaylists(input.accessToken, input.channelId);
  const createdThisRun = new Set<string>();
  let repaired = 0;
  let alreadyCorrect = 0;
  let failed = 0;

  for (const job of jobs || []) {
    const videoId = String(job.youtube_video_id || "").trim();
    const playlistName = String(job.playlist_name || "").trim();
    if (!videoId || !playlistName) continue;

    let playlistId = playlists.get(playlistName) || "";
    let playlistCreated = false;
    try {
      if (!playlistId) {
        playlistId = await createPlaylist(input.accessToken, playlistName);
        playlists.set(playlistName, playlistId);
        createdThisRun.add(playlistId);
        playlistCreated = true;
      }

      if (!(await videoBelongsToChannel(input.accessToken, videoId, input.channelId))) {
        throw new Error(`Video ${videoId} does not belong to the verified Re-Master channel.`);
      }

      const duplicate = createdThisRun.has(playlistId)
        ? false
        : await playlistContainsVideo(input.accessToken, playlistId, videoId);
      if (!duplicate) {
        await addVideo(input.accessToken, playlistId, videoId);
        repaired += 1;
      } else {
        alreadyCorrect += 1;
      }

      await supabase.from("remaster_playlist_recovery_audit").insert({
        job_id: job.id,
        youtube_video_id: videoId,
        playlist_name: playlistName,
        playlist_id: playlistId,
        playlist_created: playlistCreated,
        duplicate,
        ok: true,
      });
    } catch (error) {
      failed += 1;
      await supabase.from("remaster_playlist_recovery_audit").insert({
        job_id: job.id,
        youtube_video_id: videoId,
        playlist_name: playlistName,
        playlist_id: playlistId || null,
        playlist_created: playlistCreated,
        ok: false,
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { skipped: false, repaired, alreadyCorrect, failed };
}
