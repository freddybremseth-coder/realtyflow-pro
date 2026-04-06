import { youtube, type youtube_v3 } from '@googleapis/youtube';
import { OAuth2Client } from 'google-auth-library';
import type { YouTubeVideoMetadata, YouTubeUploadResult } from '@/lib/types';
import { Readable } from 'stream';

let youtubeClient: youtube_v3.Youtube | null = null;
let cachedRefreshToken: string | null = null;

/**
 * Try to fetch the refresh token stored in Supabase by the OAuth callback.
 */
async function getRefreshTokenFromSupabase(): Promise<string | null> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from('brand_settings')
      .select('settings')
      .eq('brand_id', '_system')
      .single();
    return data?.settings?.youtube_refresh_token || null;
  } catch {
    return null;
  }
}

async function getOAuth2Client() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  let refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  // Fallback: try Supabase if env var is missing or previously failed
  if (!refreshToken) {
    refreshToken = await getRefreshTokenFromSupabase() || undefined;
  }

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('YouTube OAuth2 credentials not configured (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)');
  }

  // If token changed, invalidate cached client
  if (cachedRefreshToken && cachedRefreshToken !== refreshToken) {
    youtubeClient = null;
  }
  cachedRefreshToken = refreshToken;

  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

async function getClient(): Promise<youtube_v3.Youtube> {
  if (!youtubeClient) {
    const auth = await getOAuth2Client();
    youtubeClient = youtube({ version: 'v3', auth });
  }
  return youtubeClient;
}

/**
 * Upload a video to YouTube.
 */
export async function uploadVideo(
  videoBuffer: Buffer,
  metadata: YouTubeVideoMetadata
): Promise<YouTubeUploadResult> {
  const youtube = await getClient();

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: metadata.categoryId || '10', // Music category
        defaultLanguage: metadata.language || 'en',
      },
      status: {
        privacyStatus: metadata.privacyStatus || 'private',
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: Readable.from(videoBuffer),
      mimeType: 'video/mp4',
    },
  });

  const video = res.data;
  const videoId = video.id || '';

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return {
    videoId,
    videoUrl: youtubeUrl,
    youtubeUrl,
    channelId: video.snippet?.channelId || '',
    publishedAt: video.snippet?.publishedAt || new Date().toISOString(),
    thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
  };
}

/**
 * Upload a video from a URL (downloads first, then uploads to YouTube).
 */
export async function uploadVideoFromUrl(
  options: {
    videoUrl: string;
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
    privacyStatus?: string;
    thumbnailUrl?: string;
    channelId?: string;
  }
): Promise<YouTubeUploadResult> {
  const response = await fetch(options.videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video from URL: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const metadata: YouTubeVideoMetadata = {
    title: options.title,
    description: options.description,
    tags: options.tags,
    categoryId: options.categoryId,
    privacyStatus: (options.privacyStatus as YouTubeVideoMetadata['privacyStatus']) || 'private',
    thumbnailUrl: options.thumbnailUrl,
  };
  return uploadVideo(buffer, metadata);
}

/**
 * Set a custom thumbnail for a video.
 */
export async function setThumbnail(
  videoId: string,
  thumbnailBuffer: Buffer
): Promise<void> {
  const youtube = await getClient();
  await youtube.thumbnails.set({
    videoId,
    media: {
      body: Readable.from(thumbnailBuffer),
      mimeType: 'image/png',
    },
  });
}

/**
 * Get channel information for the authenticated user.
 */
export async function getChannelInfo(): Promise<{
  id: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  thumbnailUrl: string;
}> {
  const youtube = await getClient();
  const res = await youtube.channels.list({
    part: ['snippet', 'statistics'],
    mine: true,
  });

  const channel = res.data.items?.[0];
  if (!channel) throw new Error('No YouTube channel found for this account');

  return {
    id: channel.id || '',
    title: channel.snippet?.title || '',
    subscriberCount: Number(channel.statistics?.subscriberCount || 0),
    videoCount: Number(channel.statistics?.videoCount || 0),
    viewCount: Number(channel.statistics?.viewCount || 0),
    thumbnailUrl: channel.snippet?.thumbnails?.high?.url || '',
  };
}

/**
 * List recent videos from the authenticated channel.
 */
export async function listVideos(maxResults = 20): Promise<Array<{
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}>> {
  const youtube = await getClient();

  // First get the uploads playlist
  const channelRes = await youtube.channels.list({
    part: ['contentDetails'],
    mine: true,
  });

  const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];

  const playlistRes = await youtube.playlistItems.list({
    part: ['snippet'],
    playlistId: uploadsPlaylistId,
    maxResults,
  });

  const videoIds = (playlistRes.data.items || [])
    .map((item) => item.snippet?.resourceId?.videoId)
    .filter(Boolean) as string[];

  if (videoIds.length === 0) return [];

  const videosRes = await youtube.videos.list({
    part: ['snippet', 'statistics'],
    id: videoIds,
  });

  return (videosRes.data.items || []).map((video) => ({
    id: video.id || '',
    title: video.snippet?.title || '',
    description: video.snippet?.description || '',
    tags: video.snippet?.tags || [],
    publishedAt: video.snippet?.publishedAt || '',
    thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
    viewCount: Number(video.statistics?.viewCount || 0),
    likeCount: Number(video.statistics?.likeCount || 0),
    commentCount: Number(video.statistics?.commentCount || 0),
  }));
}

/**
 * Update video metadata.
 */
export async function updateVideoMetadata(
  videoId: string,
  metadata: Partial<YouTubeVideoMetadata>
): Promise<void> {
  const youtube = await getClient();
  const updateData: any = { id: videoId };

  if (metadata.title || metadata.description || metadata.tags) {
    updateData.snippet = {};
    if (metadata.title) updateData.snippet.title = metadata.title;
    if (metadata.description) updateData.snippet.description = metadata.description;
    if (metadata.tags) updateData.snippet.tags = metadata.tags;
    if (metadata.categoryId) updateData.snippet.categoryId = metadata.categoryId;
  }

  if (metadata.privacyStatus) {
    updateData.status = { privacyStatus: metadata.privacyStatus };
  }

  const parts: string[] = [];
  if (updateData.snippet) parts.push('snippet');
  if (updateData.status) parts.push('status');

  await youtube.videos.update({
    part: parts,
    requestBody: updateData,
  });
}

/**
 * Extract video ID from a YouTube URL.
 * Supports: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Delete a video from YouTube.
 */
export async function deleteVideo(videoId: string): Promise<void> {
  const youtube = await getClient();
  await youtube.videos.delete({ id: videoId });
  console.log(`[YouTube] Deleted video: ${videoId}`);
}

export async function listPlaylists(): Promise<Array<{
  id: string;
  title: string;
  description: string;
  itemCount: number;
}>> {
  const yt = await getClient();
  const res = await yt.playlists.list({
    part: ['snippet', 'contentDetails'],
    mine: true,
    maxResults: 50,
  });
  return (res.data.items || []).map((p) => ({
    id: p.id || '',
    title: p.snippet?.title || '',
    description: p.snippet?.description || '',
    itemCount: p.contentDetails?.itemCount || 0,
  }));
}

export async function createPlaylist(title: string, description: string, privacyStatus: 'public' | 'unlisted' | 'private' = 'public'): Promise<{ id: string; title: string }> {
  const yt = await getClient();
  const res = await yt.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description },
      status: { privacyStatus },
    },
  });
  console.log(`[YouTube] Created playlist: ${res.data.snippet?.title} (${res.data.id})`);
  return { id: res.data.id || '', title: res.data.snippet?.title || title };
}

export async function addToPlaylist(playlistId: string, videoId: string): Promise<void> {
  const yt = await getClient();
  await yt.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    },
  });
  console.log(`[YouTube] Added video ${videoId} to playlist ${playlistId}`);
}

/**
 * List comment threads for a specific video.
 */
export async function listVideoComments(videoId: string, maxResults = 20): Promise<Array<{
  id: string;
  authorName: string;
  authorProfileUrl: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  totalReplyCount: number;
}>> {
  const yt = await getClient();
  const res = await yt.commentThreads.list({
    part: ['snippet'],
    videoId,
    maxResults,
    order: 'time',
  });
  return (res.data.items || []).map((t) => ({
    id: t.id || '',
    authorName: t.snippet?.topLevelComment?.snippet?.authorDisplayName || '',
    authorProfileUrl: t.snippet?.topLevelComment?.snippet?.authorProfileImageUrl || '',
    text: t.snippet?.topLevelComment?.snippet?.textDisplay || '',
    likeCount: t.snippet?.topLevelComment?.snippet?.likeCount || 0,
    publishedAt: t.snippet?.topLevelComment?.snippet?.publishedAt || '',
    totalReplyCount: t.snippet?.totalReplyCount || 0,
  }));
}

/**
 * List recent comments across all channel videos.
 */
export async function listAllComments(maxVideos = 10, commentsPerVideo = 5): Promise<Array<{
  videoId: string;
  videoTitle: string;
  id: string;
  authorName: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  totalReplyCount: number;
}>> {
  const videos = await listVideos(maxVideos);
  const allComments: Array<{
    videoId: string;
    videoTitle: string;
    id: string;
    authorName: string;
    text: string;
    likeCount: number;
    publishedAt: string;
    totalReplyCount: number;
  }> = [];

  for (const video of videos) {
    if (video.commentCount === 0) continue;
    try {
      const comments = await listVideoComments(video.id, commentsPerVideo);
      for (const c of comments) {
        allComments.push({ videoId: video.id, videoTitle: video.title, ...c });
      }
    } catch {
      // Some videos may have comments disabled
    }
  }
  return allComments.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

/**
 * Reply to a comment thread.
 */
export async function replyToComment(commentId: string, text: string): Promise<{ id: string; text: string; publishedAt: string }> {
  const yt = await getClient();
  const res = await yt.comments.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        parentId: commentId,
        textOriginal: text,
      },
    },
  });
  console.log(`[YouTube] Replied to comment ${commentId}`);
  return {
    id: res.data.id || '',
    text: res.data.snippet?.textDisplay || text,
    publishedAt: res.data.snippet?.publishedAt || new Date().toISOString(),
  };
}

export function isConfigured(): boolean {
  // Check env vars synchronously; Supabase token is checked lazily at runtime
  return !!(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    (process.env.YOUTUBE_REFRESH_TOKEN || cachedRefreshToken)
  );
}
