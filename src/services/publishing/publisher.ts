import { createClient } from "@supabase/supabase-js";

import {
  ChannelResolutionError,
  resolveChannel,
  type ResolvedChannel,
} from "@/lib/publishing/resolve-channel";
import type { OAuthPlatform } from "@/lib/oauth/state";

import {
  resolveFacebookPageToken,
  resolveInstagramToken,
  sanitizeToken,
  TokenError,
} from "./facebook-token-helper";

export interface PublishResult {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  /** Echoed back so callers can surface "posted to <Page name>" without re-querying. */
  resolved?: { source: string; displayName: string; externalId: string };
}

/** Structured response when a platform's channel can't be uniquely resolved. */
export interface ChannelAmbiguityResponse {
  platform: string;
  candidates: Array<{
    social_channel_id: string;
    display_name: string;
    external_id: string;
  }>;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ─── Helper: Upload base64 image to Supabase Storage ──────────────
export async function uploadBase64ToStorage(base64DataUrl: string): Promise<string | null> {
  try {
    if (!base64DataUrl.startsWith("data:")) return base64DataUrl;

    const supabase = getSupabase();
    const match = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;

    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");
    const fileName = `publish/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from("assets")
      .upload(fileName, buffer, { contentType: `image/${match[1]}`, upsert: true });

    if (error) {
      if (error.message?.includes("not found") || error.message?.includes("Bucket")) {
        await supabase.storage.createBucket("assets", { public: true });
        const { error: retryError } = await supabase.storage
          .from("assets")
          .upload(fileName, buffer, { contentType: `image/${match[1]}`, upsert: true });
        if (retryError) return null;
      } else {
        return null;
      }
    }

    const { data: urlData } = supabase.storage.from("assets").getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch {
    return null;
  }
}

// ─── Facebook Publisher ───────────────────────────────────────────
export async function publishToFacebook(
  pageId: string,
  accessToken: string,
  message: string,
  imageUrl?: string,
): Promise<PublishResult> {
  console.log(`[Publish Facebook] pageId=${pageId}, hasImage=${!!imageUrl}`);

  const endpoint = imageUrl
    ? `https://graph.facebook.com/v19.0/${pageId}/photos`
    : `https://graph.facebook.com/v19.0/${pageId}/feed`;

  const params = new URLSearchParams({ access_token: accessToken, message });
  if (imageUrl) params.set("url", imageUrl);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || JSON.stringify(err));
  }

  const { id: postId } = await res.json();
  return {
    platform: "facebook",
    success: true,
    postId,
    postUrl: `https://www.facebook.com/${postId}`,
  };
}

// ─── Instagram Publisher ──────────────────────────────────────────
export async function publishToInstagram(
  igAccountId: string,
  accessToken: string,
  caption: string,
  imageUrl?: string,
): Promise<PublishResult> {
  if (!imageUrl) {
    return { platform: "instagram", success: false, error: "Instagram krever et bilde-URL" };
  }
  if (imageUrl.startsWith("data:")) {
    return {
      platform: "instagram",
      success: false,
      error: "Instagram støtter ikke base64-bilder direkte",
    };
  }

  // Instagram is strict on aspect ratio. We proxy through an image resize URL
  // to guarantee a compatible 4:5 feed asset (1080x1350) for property photos.
  const instagramReadyImageUrl = (() => {
    if (!imageUrl) return imageUrl;
    if (imageUrl.includes("images.weserv.nl")) return imageUrl;
    try {
      const clean = imageUrl.replace(/^https?:\/\//, "");
      return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=1080&h=1350&fit=cover&output=jpg`;
    } catch {
      return imageUrl;
    }
  })();

  const createParams = new URLSearchParams({
    image_url: instagramReadyImageUrl || imageUrl,
    caption,
    access_token: accessToken,
  });
  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams.toString(),
    },
  );

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || "Instagram container feilet");
  }

  const { id: creationId } = await createRes.json();
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString(),
    },
  );

  if (!publishRes.ok) {
    const err = await publishRes.json();
    throw new Error(err.error?.message || "Instagram publish feilet");
  }

  const { id: postId } = await publishRes.json();
  return {
    platform: "instagram",
    success: true,
    postId,
    postUrl: `https://www.instagram.com/p/${postId}/`,
  };
}

interface LinkedInImageAsset {
  asset: string;
  contentType: string;
}

function parseDataImageUrl(imageUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function linkedinImageProxyUrl(imageUrl: string) {
  if (imageUrl.startsWith("data:") || imageUrl.includes("images.weserv.nl")) return imageUrl;
  const clean = imageUrl.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&output=jpg`;
}

async function downloadLinkedInImage(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const dataImage = parseDataImageUrl(imageUrl);
  if (dataImage) return dataImage;

  async function fetchImage(url: string) {
    const res = await fetch(url, {
      headers: {
        Accept: "image/jpeg,image/png,image/gif,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "RealtyFlowPro/1.0",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`LinkedIn kunne ikke hente bildet (${res.status}).`);
    }

    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return { buffer, contentType };
  }

  let image = await fetchImage(imageUrl);
  if (!["image/jpeg", "image/png", "image/gif"].includes(image.contentType)) {
    image = await fetchImage(linkedinImageProxyUrl(imageUrl));
  }

  if (!["image/jpeg", "image/png", "image/gif"].includes(image.contentType)) {
    throw new Error("LinkedIn støtter bare JPG, PNG og GIF for bildeposter.");
  }

  if (image.buffer.length > 20 * 1024 * 1024) {
    throw new Error("LinkedIn-bildet er for stort. Bruk et bilde under 20 MB.");
  }

  return image;
}

async function uploadImageToLinkedIn(
  accessToken: string,
  owner: string,
  imageUrl: string,
): Promise<LinkedInImageAsset> {
  const image = await downloadLinkedInImage(imageUrl);

  const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner,
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        serviceRelationships: [
          {
            identifier: "urn:li:userGeneratedContent",
            relationshipType: "OWNER",
          },
        ],
        supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
      },
    }),
  });

  if (!registerRes.ok) {
    const errText = await registerRes.text();
    throw new Error(`LinkedIn bildeopplasting kunne ikke registreres: ${errText}`);
  }

  const registerData = await registerRes.json();
  const value = registerData?.value;
  const uploadRequest = value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"];
  const uploadUrl = uploadRequest?.uploadUrl;
  const asset = value?.asset;

  if (!uploadUrl || !asset) {
    throw new Error("LinkedIn returnerte ikke uploadUrl eller media asset.");
  }

  const uploadHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": image.contentType,
  };
  for (const [key, value] of Object.entries(uploadRequest.headers || {})) {
    if (typeof value === "string") uploadHeaders[key] = value;
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: uploadHeaders,
    body: new Blob([new Uint8Array(image.buffer)], { type: image.contentType }),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`LinkedIn bildeopplasting feilet: ${errText || uploadRes.statusText}`);
  }

  return { asset, contentType: image.contentType };
}

// ─── LinkedIn Publisher ───────────────────────────────────────────
export async function publishToLinkedIn(
  accessToken: string,
  accountId: string,
  content: string,
  imageUrl?: string,
): Promise<PublishResult> {
  const author = accountId.startsWith("urn:") ? accountId : `urn:li:person:${accountId}`;
  const imageAsset = imageUrl ? await uploadImageToLinkedIn(accessToken, author, imageUrl) : null;

  const postBody: Record<string, unknown> = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content },
        shareMediaCategory: imageAsset ? "IMAGE" : "NONE",
        ...(imageAsset
          ? {
              media: [
                {
                  status: "READY",
                  media: imageAsset.asset,
                },
              ],
            }
          : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(postBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LinkedIn feilet: ${errText}`);
  }

  const data = await res.json();
  return {
    platform: "linkedin",
    success: true,
    postId: data.id || "",
    postUrl: `https://www.linkedin.com/feed/update/${data.id}/`,
  };
}

/** Re-export for callers still importing from this module. */
export { normalizeBrand } from "@/lib/publishing/normalize-brand";

/**
 * Resolve a channel for one platform, then publish. Centralised so the
 * Facebook / Instagram / LinkedIn branches share the same error handling
 * for resolution failures (ambiguity, missing channel, missing token).
 *
 * Two important behaviors that fix the multi-brand bugs:
 *
 *  1) When the new `social_channels` table has multiple matches for
 *     `(brandId, platform)` and the caller didn't pin a `social_channel_id`,
 *     we DO NOT pick one. We surface the ambiguity. The old publisher's
 *     "first match wins / substring tiebreak" logic is gone.
 *
 *  2) An explicit `social_channel_id` whose brand doesn't match `brandId`
 *     is rejected with `wrong_brand` rather than silently honored — this
 *     protects against a UI bug or stale cache trying to post Brand A's
 *     content using Brand B's tokens.
 */
async function resolveAndPublish(
  platform: OAuthPlatform,
  brandId: string,
  socialChannelId: string | undefined,
  publish: (resolved: ResolvedChannel) => Promise<PublishResult>,
): Promise<PublishResult | { ambiguity: ChannelAmbiguityResponse }> {
  let resolved: ResolvedChannel;
  try {
    resolved = await resolveChannel(brandId, platform, { socialChannelId });
  } catch (err) {
    if (err instanceof ChannelResolutionError && err.code === "ambiguous") {
      return {
        ambiguity: {
          platform,
          candidates: (err.candidates || []).map((c) => ({
            social_channel_id: c.id,
            display_name: c.display_name,
            external_id: c.external_id,
          })),
        },
      };
    }
    return {
      platform,
      success: false,
      error:
        err instanceof Error
          ? err.message
          : `Resolution failed for ${platform} on brand "${brandId}".`,
    };
  }

  try {
    const result = await publish(resolved);
    result.resolved = {
      source: resolved.source,
      displayName: resolved.displayName,
      externalId: resolved.externalId,
    };
    return result;
  } catch (err) {
    const msg =
      err instanceof TokenError
        ? err.userFacing
        : err instanceof Error
          ? err.message
          : "Ukjent feil";
    return { platform, success: false, error: msg };
  }
}

// ─── Execute publish for a set of platforms ───────────────────────
export interface ExecutePublishInput {
  draftId: string;
  platforms: string[];
  content: string;
  brandId: string;
  imageUrl?: string;
  /**
   * Optional explicit channel pin per platform. Use this whenever a brand
   * has more than one connected account on a platform. Without it the
   * publisher refuses to guess and returns an ambiguity response.
   */
  socialChannelIds?: Record<string, string | undefined>;
}

export async function executePublishForDraft(
  params: ExecutePublishInput,
): Promise<{
  results: PublishResult[];
  anySuccess: boolean;
  ambiguities?: ChannelAmbiguityResponse[];
}> {
  const { draftId, platforms, content, brandId, imageUrl, socialChannelIds } = params;
  const supabase = getSupabase();

  // Upload base64 image once for all platforms.
  let publicImageUrl: string | undefined;
  if (imageUrl) {
    const uploaded = await uploadBase64ToStorage(imageUrl);
    if (uploaded) publicImageUrl = uploaded;
  }

  const results: PublishResult[] = [];
  const ambiguities: ChannelAmbiguityResponse[] = [];

  for (const platform of platforms) {
    const pinnedId = socialChannelIds?.[platform];

    // YouTube: still goes through neural-beat / property-video pipelines.
    // Surface the same guidance the legacy code did rather than failing.
    if (platform === "youtube") {
      results.push({
        platform: "youtube",
        success: false,
        error:
          "YouTube-innhold krever en video. Bruk 'Eiendomsvideo' eller 'Re-Master Freddy' for å laste opp video til YouTube.",
      });
      continue;
    }

    if (!isSupportedPlatform(platform)) {
      results.push({ platform, success: false, error: `Plattform "${platform}" støttes ikke.` });
      continue;
    }

    const outcome = await resolveAndPublish(
      platform,
      brandId,
      pinnedId,
      async (resolved) => publishOne(platform, resolved, content, publicImageUrl),
    );

    if ("ambiguity" in outcome) {
      ambiguities.push(outcome.ambiguity);
      results.push({
        platform,
        success: false,
        error: `Flere ${platform}-kontoer for "${brandId}". Velg én konto i Innstillinger → Sosiale medier, eller send social_channel_id eksplisitt.`,
      });
      continue;
    }

    results.push(outcome);

    if (outcome.success && outcome.postId) {
      await supabase
        .from("content_publications")
        .update({ [`${platform}_post_id`]: outcome.postId })
        .eq("id", draftId);
    }
  }

  const anySuccess = results.some((r) => r.success);

  await supabase
    .from("content_publications")
    .update({
      status: anySuccess ? "published" : "failed",
      published_at: anySuccess ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      publish_attempts: 1,
      last_publish_error: anySuccess
        ? null
        : results
            .map((r) => r.error)
            .filter(Boolean)
            .join("; "),
    })
    .eq("id", draftId);

  return { results, anySuccess, ambiguities: ambiguities.length ? ambiguities : undefined };
}

function isSupportedPlatform(p: string): p is "facebook" | "instagram" | "linkedin" {
  return p === "facebook" || p === "instagram" || p === "linkedin";
}

async function publishOne(
  platform: "facebook" | "instagram" | "linkedin",
  resolved: ResolvedChannel,
  content: string,
  imageUrl?: string,
): Promise<PublishResult> {
  switch (platform) {
    case "facebook": {
      // Sanitize + auto-upgrade USER→PAGE token if needed. The helper
      // writes back to whichever store the token came from (oauth_tokens
      // vs social_accounts) so the upgrade is durable across publishes.
      const upgraded = await resolveFacebookPageToken({
        externalId: resolved.externalId,
        storedToken: resolved.accessToken,
        channelId: resolved.channelId,
        legacyAccountId: resolved.legacyAccountId,
      });
      return publishToFacebook(resolved.externalId, upgraded.token, content, imageUrl);
    }
    case "instagram": {
      const upgraded = await resolveInstagramToken({
        storedToken: resolved.accessToken,
        channelId: resolved.channelId,
        legacyAccountId: resolved.legacyAccountId,
      });
      return publishToInstagram(resolved.externalId, upgraded.token, content, imageUrl);
    }
    case "linkedin":
      return publishToLinkedIn(
        sanitizeToken(resolved.accessToken),
        resolved.externalId,
        content,
        imageUrl,
      );
  }
}
