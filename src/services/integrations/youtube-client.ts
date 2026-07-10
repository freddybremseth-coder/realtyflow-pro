import { youtube, type youtube_v3 } from '@googleapis/youtube';
import { OAuth2Client } from 'google-auth-library';
import type { YouTubeVideoMetadata, YouTubeUploadResult } from '@/lib/types';
import { BRANDS } from '@/lib/constants';
import {
  isRemasterBrand,
  REMASTER_OAUTH_RETURN_PATH,
} from '@/lib/remaster/oauth-return';
import { Readable } from 'stream';

// Cache per (brandId, token) so we can re-use OAuth clients but also invalidate
// when we fall back to a different token source.
const clientCache: Map<string, { client: youtube_v3.Youtube; refreshToken: string }> = new Map();

interface TokenCandidate {
  source: string;  // "brand:zeneco" | "_system" | "env:YOUTUBE_REFRESH_TOKEN"
  token: string;
}

const BRAND_TOKEN_ALIASES: Record<string, string[]> = {
  neuralbeat: ['remasterfreddy'],
  remasterfreddy: ['neuralbeat'],
};

function reconnectUrlForBrand(brandId: string) {
  const returnTo = isRemasterBrand(brandId)
    ? REMASTER_OAUTH_RETURN_PATH
    : '/settings?tab=sosiale-medier';
  return `/api/oauth/google?brand=${encodeURIComponent(brandId)}&return_to=${encodeURIComponent(returnTo)}`;
}

function getBrandDisplayName(brandId?: string) {
  const normalized = `${brandId || ''}`.trim().toLowerCase();
  return BRANDS.find((brand) => brand.id.toLowerCase() === normalized)?.name || brandId || 'ukjent brand';
}

function sanitizeToken(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Collect every refresh token that could serve this brand, in priority order:
 *   1. NEW: oauth_tokens row(s) for active social_channels matching this brand
 *      and platform=youtube (Phase 4 — preferred path).
 *   2. brand_settings row for this brand (legacy, written to by the
 *      finalize step in src/lib/oauth/google.ts as a transition aid).
 *   3. brand_settings rows for the alias brands.
 *   4. brand_settings _system row (global default fallback).
 *   5. env YOUTUBE_REFRESH_TOKEN / no env name change so old prod keys still
 *      work; renamed env vars (GOOGLE_*) only affect the OAuth client below.
 *
 * The caller walks the list and tries each — needed because Google's 100-token
 * limit per client+user means older tokens get revoked silently when new ones
 * are issued, so a brand-specific token may be dead even though _system works.
 *
 * Important: we deduplicate by token value, so when finalizeGoogleChannel
 * mirrors the same refresh token to brand_settings AND oauth_tokens (Phase 4
 * dual-write), we don't try the same token twice.
 */
async function collectTokenCandidates(brandId?: string): Promise<TokenCandidate[]> {
  const candidates: TokenCandidate[] = [];

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const supabase = createClient(url, key);

      // ─── 1. New tables: oauth_tokens for active YT channels of this brand ─
      // We look up by brand_id + platform=youtube and decrypt the refresh
      // token. There can be more than one channel for a brand (e.g. main +
      // secondary) — we add all of them, in display_name order, so the
      // fallback walker can try each.
      if (brandId) {
        try {
          const { getChannelsByBrand, getDecryptedTokens } = await import('@/lib/oauth/channels');
          const channels = await getChannelsByBrand(brandId, 'youtube');
          for (const ch of channels) {
            const tokens = await getDecryptedTokens(ch.id);
            const refresh = tokens?.refreshToken;
            if (refresh && !candidates.some((c) => c.token === refresh)) {
              candidates.push({ source: `oauth_tokens:${ch.display_name}`, token: refresh });
            }
          }
        } catch (err) {
          // Not fatal — we just fall through to the legacy paths.
          console.warn(
            '[YouTube] oauth_tokens lookup failed (falling back to brand_settings):',
            err instanceof Error ? err.message : err,
          );
        }
      }

      // ─── 2-4. Legacy brand_settings paths ────────────────────────────────
      const candidateBrandIds = brandId && brandId !== '_system'
        ? [brandId, ...(BRAND_TOKEN_ALIASES[brandId] || [])]
        : [];

      for (const candidateBrandId of candidateBrandIds) {
        const { data: brandData } = await supabase
          .from('brand_settings')
          .select('settings')
          .eq('brand_id', candidateBrandId)
          .maybeSingle();
        const brandToken = sanitizeToken(brandData?.settings?.youtube_refresh_token);
        if (brandToken && !candidates.some((c) => c.token === brandToken)) {
          candidates.push({ source: `brand:${candidateBrandId}`, token: brandToken });
        }
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

  // ─── 5. env fallback ───────────────────────────────────────────────────
  const envToken = sanitizeToken(process.env.YOUTUBE_REFRESH_TOKEN);
  if (envToken && !candidates.some((c) => c.token === envToken)) {
    candidates.push({ source: 'env:YOUTUBE_REFRESH_TOKEN', token: envToken });
  }

  return candidates;
}

function buildOAuthClient(refreshToken: string): OAuth2Client {
  // Phase 4 rename: prefer the canonical GOOGLE_* names. The deprecated
  // YOUTUBE_* names are accepted as a fallback for one release so the
  // existing Vercel env vars keep working until they're renamed.
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth credentials not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or legacy YOUTUBE_CLIENT_ID/SECRET).',
    );
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
  const msg = [
    err instanceof Error ? err.message : String(err),
    (() => {
      try {
        return JSON.stringify((err as { response?: { data?: unknown } })?.response?.data || {});
      } catch {
        return '';
      }
    })(),
  ].join(' ');
  return /invalid[_\s]grant/i.test(msg) || /Token has been expired or revoked/i.test(msg);
}

async function runWithTokenFallback<T>(
  brandId: string | undefined,
  work: (client: youtube_v3.Youtube, source: string) => Promise<T>,
  options?: { requireBrandToken?: boolean },
): Promise<T> {
  const allCandidates = await collectTokenCandidates(brandId);
  const isBrandSpecificSource = (source: string) =>
    source.startsWith('brand:') || source.startsWith('oauth_tokens:');
  const candidates = options?.requireBrandToken
    ? allCandidates.filter((candidate) => isBrandSpecificSource(candidate.source))
    : allCandidates;
  if (candidates.length === 0) {
    const hint = brandId
      ? options?.requireBrandToken
        ? `No brand-specific YouTube refresh token found for brand "${brandId}". Reconnect Google/YouTube for this brand before processing videos.`
        : `No YouTube refresh token found for brand "${brandId}". Set it in brand settings or configure YOUTUBE_REFRESH_TOKEN env var.`
      : 'No YouTube refresh token found. Set YOUTUBE_REFRESH_TOKEN env var or configure token in brand settings.';
    throw new Error(hint);
  }

  let lastErr: unknown = null;
  for (const candidate of candidates) {
    try {
      const client = buildYoutubeClient(brandId, candidate);
      console.log(`[YouTube] Attempting API call with token source: ${candidate.source}`);
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
  if (options?.requireBrandToken && brandId && lastErr && isInvalidGrantError(lastErr)) {
    const brandName = getBrandDisplayName(brandId);
    throw new Error(
      `YouTube-token for ${brandName} (${brandId}) er utløpt eller tilbakekalt (invalid_grant). Koble dette brandet til Google/YouTube på nytt: ${reconnectUrlForBrand(brandId)}`,
    );
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
  options?: { requireBrandToken?: boolean },
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

  const hasLocalizations = metadata.localizations && Object.keys(metadata.localizations).length > 0;

  return runWithTokenFallback(brandId, async (youtube, source) => {
    const insertWith = (withLocalizations: boolean) =>
      youtube.videos.insert({
        part: withLocalizations ? ['snippet', 'status', 'localizations'] : ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            categoryId: metadata.categoryId || '10', // Music category
            defaultLanguage: metadata.language || 'en',
            ...(metadata.defaultAudioLanguage ? { defaultAudioLanguage: metadata.defaultAudioLanguage } : {}),
          },
          ...(withLocalizations ? { localizations: metadata.localizations } : {}),
          status: statusPayload,
        },
        media: {
          body: Readable.from(videoBuffer),
          mimeType: 'video/mp4',
        },
      });

    let res;
    try {
      res = await insertWith(!!hasLocalizations);
    } catch (err) {
      // Localizations are nice-to-have — never let them sink the upload.
      // invalid_grant must propagate so the token fallback/reconnect works.
      const msg = err instanceof Error ? err.message : String(err);
      if (!hasLocalizations || isInvalidGrantError(err)) throw err;
      console.warn(`[YouTube] Insert with localizations failed (${msg.slice(0, 200)}) — retrying without`);
      res = await insertWith(false);
    }

    const video = res.data;
    const videoId = video.id || '';
    if (!videoId) {
      throw new Error('YouTube upload did not return a video id. Nothing was confirmed as uploaded.');
    }
    console.log(`[YouTube] Upload OK via ${source}, videoId=${videoId}, channel=${video.snippet?.channelId}`);

    const verify = await youtube.videos.list({
      part: ['snippet', 'status'],
      id: [videoId],
    });
    const verifiedVideo = verify.data.items?.[0];
    if (!verifiedVideo?.id) {
      throw new Error(`YouTube upload returned video id ${videoId}, but verification lookup did not find the video.`);
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Extra guard for multi-brand setups:
    // when a brand is provided, verify the uploaded channel is one of the
    // brand's active YouTube channels in social_channels.
    if (brandId) {
      try {
        const { getChannelsByBrand } = await import('@/lib/oauth/channels');
        const allowed = await getChannelsByBrand(brandId, 'youtube');
        const allowedExternalIds = allowed.map((c) => c.external_id).filter(Boolean);
        const uploadedChannelId = verifiedVideo.snippet?.channelId || video.snippet?.channelId || '';
        if (uploadedChannelId && allowedExternalIds.length > 0 && !allowedExternalIds.includes(uploadedChannelId)) {
          throw new Error(
            `YouTube upload landed on wrong channel (${uploadedChannelId}) for brand "${brandId}". Allowed channels: ${allowedExternalIds.join(', ')}`,
          );
        }

        // Safety net: prevent real-estate/other brands from silently posting
        // to Re-master/Neural Beat channels due to mistaken OAuth connection.
        const normalizedBrand = brandId.toLowerCase().replace(/[-_.\s]/g, '');
        const musicBrands = new Set(['remasterfreddy', 'neuralbeat']);
        const landedChannel = allowed.find((c) => c.external_id === uploadedChannelId);
        const landedName = `${landedChannel?.display_name || ''}`.toLowerCase();
        if (!musicBrands.has(normalizedBrand) && /re-?\s*master|neural\s*beat/.test(landedName)) {
          throw new Error(
            `Brand "${brandId}" er koblet til YouTube-kanalen "${landedChannel?.display_name || uploadedChannelId}" (Re-master/Neural Beat). Koble riktig brand-kanal via /api/oauth/google?brand=${brandId} før publisering.`,
          );
        }
      } catch (err) {
        if (err instanceof Error && /wrong channel/i.test(err.message)) {
          throw err;
        }
        if (err instanceof Error && /re-master|neural beat|koble riktig brand-kanal/i.test(err.message.toLowerCase())) {
          throw err;
        }
        // Don't block uploads when channel table lookup itself fails.
        console.warn('[YouTube] Brand channel verification skipped:', err instanceof Error ? err.message : err);
      }
    }

    return {
      videoId,
      videoUrl: youtubeUrl,
      youtubeUrl,
      channelId: verifiedVideo.snippet?.channelId || video.snippet?.channelId || '',
      publishedAt: verifiedVideo.snippet?.publishedAt || video.snippet?.publishedAt || new Date().toISOString(),
      thumbnailUrl: verifiedVideo.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.high?.url || '',
      privacyStatus: verifiedVideo.status?.privacyStatus || String(statusPayload.privacyStatus || ''),
      tokenSource: source,
    };
  }, options);
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
  await runWithTokenFallback(brandId, async (youtube) => {
    await youtube.thumbnails.set({
      videoId,
      media: {
        body: Readable.from(thumbnailBuffer),
        mimeType: 'image/png',
      },
    });
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
  return runWithTokenFallback(brandId, async (youtube, source) => {
    const res = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      mine: true,
    });

    const channel = res.data.items?.[0];
    if (!channel) throw new Error('No YouTube channel found for this account');

    console.log(`[YouTube] Channel info OK via ${source}: ${channel.snippet?.title}`);
    return {
      id: channel.id || '',
      title: channel.snippet?.title || '',
      subscriberCount: Number(channel.statistics?.subscriberCount || 0),
      videoCount: Number(channel.statistics?.videoCount || 0),
      viewCount: Number(channel.statistics?.viewCount || 0),
      thumbnailUrl: channel.snippet?.thumbnails?.high?.url || '',
    };
  });
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
  return runWithTokenFallback(brandId, async (youtube, source) => {

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

    console.log(`[YouTube] Listed ${videosRes.data.items?.length || 0} videos via ${source}`);
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
  });
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
  metadata: Partial<YouTubeVideoMetadata>,
  brandId?: string
): Promise<void> {
  return runWithTokenFallback(brandId, async (youtube) => {

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
  // Refresh tokens may be stored per brand in Supabase (oauth_tokens) or
  // brand_settings (legacy). Check those lazily when an API call knows
  // which brand/channel it needs. This function only verifies the OAuth
  // CLIENT credentials are present — without those we can't redeem any
  // refresh token. Accepts either the canonical GOOGLE_* names or the
  // legacy YOUTUBE_* names during the rename window.
  return !!(
    (process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID) &&
    (process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET)
  );
}
