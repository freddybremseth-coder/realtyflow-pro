import { uploadVideo, isConfigured as isYouTubeConfigured } from './youtube-client';
import type { YouTubeVideoMetadata } from '@/lib/types';
import { Readable } from 'stream';

// ─── Interfaces ─────────────────────────────────────────────────────

export interface PublishResult {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export interface YouTubePublishInput {
  video: Buffer;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  language?: string;
}

export interface SocialPostInput {
  brandId: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  link?: string;
}

export interface PinterestPinInput {
  brandId: string;
  imageUrl: string;
  title: string;
  description: string;
  boardId?: string;
  link?: string;
}

export interface MultiPlatformPublishInput {
  brandId: string;
  platforms: ('youtube' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'pinterest')[];
  // Content
  title: string;
  content: string;
  imageUrl?: string;
  videoBuffer?: Buffer;
  videoUrl?: string;
  link?: string;
  // YouTube-specific
  youtubeTags?: string[];
  youtubeCategoryId?: string;
  youtubePrivacyStatus?: 'public' | 'unlisted' | 'private';
  // Pinterest-specific
  pinterestBoardId?: string;
}

// ─── YouTube Publisher (Fully Implemented) ──────────────────────────

export async function publishToYouTube(input: YouTubePublishInput): Promise<PublishResult> {
  try {
    if (!isYouTubeConfigured()) {
      return {
        platform: 'youtube',
        success: false,
        error: 'YouTube er ikke konfigurert. Sett YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET og YOUTUBE_REFRESH_TOKEN.',
      };
    }

    const metadata: YouTubeVideoMetadata = {
      title: input.title,
      description: input.description,
      tags: input.tags,
      categoryId: input.categoryId || '22', // People & Blogs default
      privacyStatus: input.privacyStatus || 'private',
      language: input.language || 'no',
    };

    const result = await uploadVideo(input.video, metadata);

    return {
      platform: 'youtube',
      success: true,
      postId: result.videoId,
      postUrl: result.youtubeUrl,
    };
  } catch (error) {
    return {
      platform: 'youtube',
      success: false,
      error: error instanceof Error ? error.message : 'YouTube-opplasting feilet',
    };
  }
}

// ─── Instagram Publisher (Stub - Facebook Graph API) ────────────────

export async function publishToInstagram(
  brandId: string,
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    console.log(`[SocialPublisher] Instagram: Stub - ville publisert for brand "${brandId}"`);
    console.log(`[SocialPublisher] Instagram innhold: ${content.substring(0, 100)}...`);
    return {
      platform: 'instagram',
      success: false,
      error: 'Instagram er ikke konfigurert. Sett INSTAGRAM_ACCESS_TOKEN og INSTAGRAM_BUSINESS_ACCOUNT_ID.',
    };
  }

  try {
    // Step 1: Create media container
    const createUrl = `https://graph.facebook.com/v19.0/${accountId}/media`;
    const createParams: Record<string, string> = {
      access_token: accessToken,
      caption: content,
    };
    if (imageUrl) {
      createParams.image_url = imageUrl;
    }

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createParams),
    });

    if (!createRes.ok) {
      const errorData = await createRes.json();
      throw new Error(`Instagram container creation failed: ${JSON.stringify(errorData)}`);
    }

    const { id: creationId } = await createRes.json();

    // Step 2: Publish the container
    const publishUrl = `https://graph.facebook.com/v19.0/${accountId}/media_publish`;
    const publishRes = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: accessToken,
      }),
    });

    if (!publishRes.ok) {
      const errorData = await publishRes.json();
      throw new Error(`Instagram publish failed: ${JSON.stringify(errorData)}`);
    }

    const { id: postId } = await publishRes.json();

    return {
      platform: 'instagram',
      success: true,
      postId,
      postUrl: `https://www.instagram.com/p/${postId}/`,
    };
  } catch (error) {
    return {
      platform: 'instagram',
      success: false,
      error: error instanceof Error ? error.message : 'Instagram-publisering feilet',
    };
  }
}

// ─── Facebook Publisher (Stub - Graph API) ──────────────────────────

export async function publishToFacebook(
  brandId: string,
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!accessToken || !pageId) {
    console.log(`[SocialPublisher] Facebook: Stub - ville publisert for brand "${brandId}"`);
    console.log(`[SocialPublisher] Facebook innhold: ${content.substring(0, 100)}...`);
    return {
      platform: 'facebook',
      success: false,
      error: 'Facebook er ikke konfigurert. Sett FACEBOOK_ACCESS_TOKEN og FACEBOOK_PAGE_ID.',
    };
  }

  try {
    const endpoint = imageUrl
      ? `https://graph.facebook.com/v19.0/${pageId}/photos`
      : `https://graph.facebook.com/v19.0/${pageId}/feed`;

    const params: Record<string, string> = {
      access_token: accessToken,
      message: content,
    };
    if (imageUrl) {
      params.url = imageUrl;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(`Facebook post failed: ${JSON.stringify(errorData)}`);
    }

    const { id: postId } = await res.json();

    return {
      platform: 'facebook',
      success: true,
      postId,
      postUrl: `https://www.facebook.com/${postId}`,
    };
  } catch (error) {
    return {
      platform: 'facebook',
      success: false,
      error: error instanceof Error ? error.message : 'Facebook-publisering feilet',
    };
  }
}

// ─── LinkedIn Publisher (Stub - LinkedIn API) ───────────────────────

export async function publishToLinkedIn(
  brandId: string,
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const organizationId = process.env.LINKEDIN_ORGANIZATION_ID;

  if (!accessToken) {
    console.log(`[SocialPublisher] LinkedIn: Stub - ville publisert for brand "${brandId}"`);
    console.log(`[SocialPublisher] LinkedIn innhold: ${content.substring(0, 100)}...`);
    return {
      platform: 'linkedin',
      success: false,
      error: 'LinkedIn er ikke konfigurert. Sett LINKEDIN_ACCESS_TOKEN.',
    };
  }

  try {
    const author = organizationId
      ? `urn:li:organization:${organizationId}`
      : 'urn:li:person:me';

    const postBody: Record<string, unknown> = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE',
          ...(imageUrl
            ? {
                media: [
                  {
                    status: 'READY',
                    originalUrl: imageUrl,
                  },
                ],
              }
            : {}),
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`LinkedIn post failed: ${errorData}`);
    }

    const data = await res.json();
    const postId = data.id || '';

    return {
      platform: 'linkedin',
      success: true,
      postId,
      postUrl: `https://www.linkedin.com/feed/update/${postId}/`,
    };
  } catch (error) {
    return {
      platform: 'linkedin',
      success: false,
      error: error instanceof Error ? error.message : 'LinkedIn-publisering feilet',
    };
  }
}

// ─── TikTok Publisher (Stub - Content Posting API) ──────────────────

export async function publishToTikTok(
  brandId: string,
  videoUrl: string,
  description: string
): Promise<PublishResult> {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;

  if (!accessToken) {
    console.log(`[SocialPublisher] TikTok: Stub - ville publisert for brand "${brandId}"`);
    console.log(`[SocialPublisher] TikTok beskrivelse: ${description.substring(0, 100)}...`);
    return {
      platform: 'tiktok',
      success: false,
      error: 'TikTok er ikke konfigurert. Sett TIKTOK_ACCESS_TOKEN.',
    };
  }

  try {
    // TikTok Content Posting API - initialize upload
    const initRes = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: description.substring(0, 150),
            privacy_level: 'PUBLIC_TO_EVERYONE',
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        }),
      }
    );

    if (!initRes.ok) {
      const errorData = await initRes.text();
      throw new Error(`TikTok upload init failed: ${errorData}`);
    }

    const data = await initRes.json();
    const publishId = data.data?.publish_id || '';

    return {
      platform: 'tiktok',
      success: true,
      postId: publishId,
      postUrl: `https://www.tiktok.com/@${brandId}/video/${publishId}`,
    };
  } catch (error) {
    return {
      platform: 'tiktok',
      success: false,
      error: error instanceof Error ? error.message : 'TikTok-publisering feilet',
    };
  }
}

// ─── Pinterest Publisher (Stub - Pinterest API) ─────────────────────

export async function publishToPinterest(
  brandId: string,
  imageUrl: string,
  title: string,
  description: string,
  boardId?: string
): Promise<PublishResult> {
  const accessToken = process.env.PINTEREST_ACCESS_TOKEN;
  const defaultBoardId = boardId || process.env.PINTEREST_DEFAULT_BOARD_ID;

  if (!accessToken) {
    console.log(`[SocialPublisher] Pinterest: Stub - ville publisert for brand "${brandId}"`);
    console.log(`[SocialPublisher] Pinterest pin: ${title}`);
    return {
      platform: 'pinterest',
      success: false,
      error: 'Pinterest er ikke konfigurert. Sett PINTEREST_ACCESS_TOKEN.',
    };
  }

  if (!defaultBoardId) {
    return {
      platform: 'pinterest',
      success: false,
      error: 'Pinterest board ID mangler. Sett PINTEREST_DEFAULT_BOARD_ID eller angi boardId.',
    };
  }

  try {
    const res = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        board_id: defaultBoardId,
        title,
        description,
        media_source: {
          source_type: 'image_url',
          url: imageUrl,
        },
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Pinterest pin creation failed: ${errorData}`);
    }

    const data = await res.json();
    const pinId = data.id || '';

    return {
      platform: 'pinterest',
      success: true,
      postId: pinId,
      postUrl: `https://www.pinterest.com/pin/${pinId}/`,
    };
  } catch (error) {
    return {
      platform: 'pinterest',
      success: false,
      error: error instanceof Error ? error.message : 'Pinterest-publisering feilet',
    };
  }
}

// ─── Unified Multi-Platform Publisher ───────────────────────────────

export async function publishToMultiplePlatforms(
  input: MultiPlatformPublishInput
): Promise<PublishResult[]> {
  const results: PublishResult[] = [];

  const promises = input.platforms.map(async (platform) => {
    switch (platform) {
      case 'youtube':
        if (input.videoBuffer) {
          return publishToYouTube({
            video: input.videoBuffer,
            title: input.title,
            description: input.content,
            tags: input.youtubeTags || [],
            categoryId: input.youtubeCategoryId,
            privacyStatus: input.youtubePrivacyStatus || 'private',
          });
        }
        return {
          platform: 'youtube',
          success: false,
          error: 'Ingen video-buffer oppgitt for YouTube-opplasting.',
        } as PublishResult;

      case 'instagram':
        return publishToInstagram(input.brandId, input.content, input.imageUrl);

      case 'facebook':
        return publishToFacebook(input.brandId, input.content, input.imageUrl);

      case 'linkedin':
        return publishToLinkedIn(input.brandId, input.content, input.imageUrl);

      case 'tiktok':
        if (input.videoUrl) {
          return publishToTikTok(input.brandId, input.videoUrl, input.content);
        }
        return {
          platform: 'tiktok',
          success: false,
          error: 'Ingen video-URL oppgitt for TikTok-publisering.',
        } as PublishResult;

      case 'pinterest':
        if (input.imageUrl) {
          return publishToPinterest(
            input.brandId,
            input.imageUrl,
            input.title,
            input.content,
            input.pinterestBoardId
          );
        }
        return {
          platform: 'pinterest',
          success: false,
          error: 'Ingen bilde-URL oppgitt for Pinterest-publisering.',
        } as PublishResult;

      default:
        return {
          platform: platform as string,
          success: false,
          error: `Ukjent plattform: ${platform}`,
        } as PublishResult;
    }
  });

  const settled = await Promise.allSettled(promises);

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        platform: 'unknown',
        success: false,
        error: result.reason?.message || 'Ukjent feil under publisering',
      });
    }
  }

  return results;
}
