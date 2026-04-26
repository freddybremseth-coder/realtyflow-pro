import { youtube, type youtube_v3 } from '@googleapis/youtube';
import { OAuth2Client } from 'google-auth-library';
import type { YouTubeVideoMetadata, YouTubeUploadResult } from '@/lib/types';
import { Readable } from 'stream';

// Cache per (brandId, token) so we can re-use OAuth clients but also invalidate
// when we fall back to a different token source.
const clientCache: Map<string, { client: youtube_v3.Youtube; refreshToken: string }> = new Map();

interface TokenCandidate {
  source: string;  // "brand:zeneco" | "_system" | "env:YOUTUBE_REFRESH_TOKEN"
  token: string;
}

function sanitizeToken(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Collect every refresh token that could serve this brand, in priority order:
 *   1. brand-specific row (if brandId set and row exists)
 *   2. _system row (global default)
 *   3. env YOUTUBE_REFRESH_TOKEN (last-resort fallback)
 *
 * The caller walks the list and tries each — needed because Google's 100-token
 * limit per client+user means older tokens get revoked silently when new ones
 * are issued, so a brand-specific token may be dead even though _system works.
 */
async function collectTokenCandidates(brandId?: string): Promise<TokenCandidate[]> {
  const candidates: TokenCandidate[] = [];

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const supabase = createClient(url, key);

      if (brandId && brandId !== '_system') {
        const { data: brandData } = await supabase
          .from('brand_settings')
          .select('settings')
          .eq('brand_id', brandId)
          .maybeSingle();
        const brandToken = sanitizeToken(brandData?.settings?.youtube_refresh_token);
        if (brandToken) candidates.push({ source: `brand:${brandId}`, token: brandToken });
      }

      const { data: sysData } = await supabase
        .from('brand_settings')
        .select('settings')
        .eq('brand_id', '_system')
        .maybeSingle();
      const sysToken = sanitizeToken(sysData?.settings?.youtube_refresh_token);
      if (sysToken && !candidates.some((c) => c.token === sysToken)) {
        candidates.push({ source: '_system', token: sysToken });
      }
    }
  } catch (err) {
    console.warn('[YouTube] Supabase token lookup failed:', err instanceof Error ? err.message : err);
  }

  const envToken = sanitizeToken(process.env.YOUTUBE_REFRESH_TOKEN);
  if (envToken && !candidates.some((c) => c.token === envToken)) {
    candidates.push({ source: 'env:YOUTUBE_REFRESH_TOKEN', token: envToken });
  }

  return candidates;
}

function buildOAuthClient(refreshToken: string): OAuth2Client {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('YouTube OAuth2 credentials not configured: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required');
  }
  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function buildYoutubeClient(brandId: string | undefined, candidate: TokenCandidate): youtube_v3.Youtube {
  const cacheKey = `${brandId || '_default'}|${candidate.token}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached.client;
  const oauth2Client = buildOAuthClient(candidate.token);
  const client = youtube({ version: 'v3', auth: oauth2Client });
  clientCache.set(cacheKey, { client, refreshToken: candidate.token });
  return client;
}

/**
 * Legacy single-token client resolver — kept for code paths that don't need
 * the invalid_grant fallback (channel info, list videos, etc.). New code
 * should use runWithTokenFallback instead.
 */
async function getClient(brandId?: string): Promise<youtube_v3.Youtube> {
  const candidates = await collectTokenCandidates(brandId);
  if (candidates.length === 0) {
    const hint = brandId
      ? `No YouTube refresh token found for brand "${brandId}". Set it in brand settings or configure YOUTUBE_REFRESH_TOKEN env var.`
      : 'No YouTube refresh token found. Set YOUTUBE_REFRESH_TOKEN env var or configure token in brand settings.';
    throw new Error(hint);
  }
  const first = candidates[0];
  console.log(`[YouTube] OAuth2 client for ${brandId || 'default'}, token source: ${first.source}`);
  return buildYoutubeClient(brandId, first);
}

/**
 * Run `work` against each candidate token, falling through to the next on
 * invalid_grant. Returns the result of the first successful call, or throws
 * the last error if every candidate fails.
 *
 * Retried errors:
 *   - invalid_grant (token revoked / expired)
 *   - invalid_client / unauthorized_client (rare, but not retryable — rethrow)
 */
function isInvalidGrantError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid[_\s]grant/i.test(msg) || /Token has been expired or revoked/i.test(msg);
}

async function runWithTokenFallback<T>(
  brandId: string | undefined,
  work: (client: youtube_v3.Youtube, source: string) => Promise<T>,
): Promise<T> {
  const candidates = await collectTokenCandidates(brandId);
  if (candidates.length === 0) {
    const hint = brandId
      ? `No YouTube refresh token found for brand "${brandId}". Set it in brand settings or configure YOUTUBE_REFRESH_TOKEN env var.`
      : 'No YouTube refresh token found. Set YOUTUBE_REFRESH_TOKEN env var or configure token in brand settings.';
    throw new Error(hint);
  }

  let lastErr: unknown = null;
  for (const candidate of candidates) {
    try {
      const client = buildYoutubeClient(brandId, candidate);
      console.log(`[YouTube] Attempting upload with token source: ${candidate.source}`);
      return await work(client, candidate.source);
    } catch (err) {
      lastErr = err;
      if (!isInvalidGrantError(err)) {
        // Non-auth error — don't retry with different token
        throw err;
      }
      console.warn(
        `[YouTube] Token from ${candidate.source} failed with invalid_grant, trying next candidate...`,
      );
    }
  }
  throw lastErr ?? new Error('All YouTube refresh tokens failed with invalid_grant');
}

/**
 * Upload a video to YouTube.
 */
export async function uploadVideo(
  videoBuffer: Buffer,
  metadata: YouTubeVideoMetadata,
  brandId?: string,
): Promise<YouTubeUploadResult> {
  // When publishAt is set we must upload as PRIVATE — YouTube rejects scheduling
  // on any other privacy status. Sanitize here so callers don't have to remember.
  const willSchedule = !!metadata.publishAt;
  const statusPayload: Record<string, unknown> = {
    privacyStatus: willSchedule ? 'private' : (metadata.privacyStatus || 'private'),
    selfDeclaredMadeForKids: false,
  };
  if (willSchedule) {
    statusPayload.publishAt = metadata.publishAt;
  }

  return runWithTokenFallback(brandId, async (youtube, source) => {
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
        status: statusPayload,
      },
      media: {
        body: Readable.from(videoBuffer),
        mimeType: 'video/mp4',
      },
    });

    const video = res.data;
    const videoId = video.id || '';
    console.log(`[YouTube] Upload OK via ${source}, videoId=${videoId}, channel=${video.snippet?.channelId}`);

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return {
      videoId,
      videoUrl: youtubeUrl,
      youtubeUrl,
      channelId: video.snippet?.channelId || '',
      publishedAt: video.snippet?.publishedAt || new Date().toISOString(),
      thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
    };
  });
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
  thumbnailBuffer: Buffer,
  brandId?: string,
): Promise<void> {
  const youtube = await getClient(brandId);
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
export async function getChannelInfo(brandId?: string): Promise<{
  id: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  thumbnailUrl: string;
}> {
  const youtube = await getClient(brandId);
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
export async function listVideos(maxResults = 20, brandId?: string): Promise<Array<{
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}>> {
  const youtube = await getClient(brandId);

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
 *
 * YouTube API requires that snippet updates ALWAYS include `title` and `categoryId`.
 * This function fetches the current video data first, then merges the changes
 * so required fields are never missing.
 */
export async function updateVideoMetadata(
  videoId: string,
  metadata: Partial<YouTubeVideoMetadata>
): Promise<void> {
  const youtube = await getClient();

  const wantsSnippet = !!(metadata.title || metadata.description || metadata.tags || metadata.categoryId);
  const wantsStatus = !!metadata.privacyStatus;

  if (!wantsSnippet && !wantsStatus) return;

  const updateData: any = { id: videoId };
  const parts: string[] = [];

  if (wantsSnippet) {
    // Fetch current video data so we can supply required fields (title, categoryId)
    const current = await youtube.videos.list({
      part: ['snippet'],
      id: [videoId],
    });
    const currentSnippet = current.data.items?.[0]?.snippet;
    if (!currentSnippet) {
      throw new Error(`Video ${videoId} not found on YouTube`);
    }

    updateData.snippet = {
      // Always include title and categoryId (YouTube requires them)
      title: metadata.title || currentSnippet.title || '',
      categoryId: metadata.categoryId || currentSnippet.categoryId || '10',
    };

    // Merge optional fields
    if (metadata.description !== undefined) {
      updateData.snippet.description = metadata.description;
    } else if (currentSnippet.description) {
      updateData.snippet.description = currentSnippet.description;
    }

    if (metadata.tags) {
      updateData.snippet.tags = metadata.tags;
    } else if (currentSnippet.tags) {
      updateData.snippet.tags = currentSnippet.tags;
    }

    parts.push('snippet');
  }

  if (wantsStatus) {
    updateData.status = { privacyStatus: metadata.privacyStatus };
    parts.push('status');
  }

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

export async function listPlaylists(brandId?: string): Promise<Array<{
  id: string;
  title: string;
  description: string;
  itemCount: number;
}>> {
  const yt = await getClient(brandId);
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

export async function createPlaylist(
  title: string,
  description: string,
  privacyStatus: 'public' | 'unlisted' | 'private' = 'public',
  brandId?: string,
): Promise<{ id: string; title: string }> {
  const yt = await getClient(brandId);
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

export async function addToPlaylist(playlistId: string, videoId: string, brandId?: string): Promise<void> {
  const yt = await getClient(brandId);
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
    (process.env.YOUTUBE_REFRESH_TOKEN || clientCache.size > 0)
  );
}
