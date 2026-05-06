import { createClient } from "@supabase/supabase-js";
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
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
  imageUrl?: string
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
  return { platform: "facebook", success: true, postId, postUrl: `https://www.facebook.com/${postId}` };
}

// ─── Instagram Publisher ──────────────────────────────────────────
export async function publishToInstagram(
  igAccountId: string,
  accessToken: string,
  caption: string,
  imageUrl?: string
): Promise<PublishResult> {
  if (!imageUrl) {
    return { platform: "instagram", success: false, error: "Instagram krever et bilde-URL" };
  }
  if (imageUrl.startsWith("data:")) {
    return { platform: "instagram", success: false, error: "Instagram støtter ikke base64-bilder direkte" };
  }

  const createParams = new URLSearchParams({ image_url: imageUrl, caption, access_token: accessToken });
  const createRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createParams.toString(),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || "Instagram container feilet");
  }

  const { id: creationId } = await createRes.json();
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const publishParams = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishParams.toString(),
  });

  if (!publishRes.ok) {
    const err = await publishRes.json();
    throw new Error(err.error?.message || "Instagram publish feilet");
  }

  const { id: postId } = await publishRes.json();
  return { platform: "instagram", success: true, postId, postUrl: `https://www.instagram.com/p/${postId}/` };
}

// ─── LinkedIn Publisher ───────────────────────────────────────────
export async function publishToLinkedIn(
  accessToken: string,
  accountId: string,
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  const author = accountId.startsWith("urn:") ? accountId : `urn:li:person:${accountId}`;

  const postBody: Record<string, unknown> = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content },
        shareMediaCategory: imageUrl ? "IMAGE" : "NONE",
        ...(imageUrl ? { media: [{ status: "READY", originalUrl: imageUrl }] } : {}),
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
  return { platform: "linkedin", success: true, postId: data.id || "", postUrl: `https://www.linkedin.com/feed/update/${data.id}/` };
}

// ─── Normalize brand for matching ─────────────────────────────────
export function normalizeBrand(b: string): string {
  return b.toLowerCase().replace(/[-_.\s]/g, "").replace(/homes$/, "").replace(/pro$/, "");
}

// ─── Execute publish for a set of platforms ───────────────────────
export async function executePublishForDraft(params: {
  draftId: string;
  platforms: string[];
  content: string;
  brandId: string;
  imageUrl?: string;
}): Promise<{ results: PublishResult[]; anySuccess: boolean }> {
  const { draftId, platforms, content, brandId, imageUrl } = params;
  const supabase = getSupabase();

  // Upload base64 image if needed
  let publicImageUrl: string | undefined;
  if (imageUrl) {
    const uploaded = await uploadBase64ToStorage(imageUrl);
    if (uploaded) publicImageUrl = uploaded;
  }

  // Get matching accounts
  const { data: allAccounts } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("is_active", true);

  const accounts = (allAccounts || []).filter(
    (a: { brand?: string; brand_id?: string }) =>
      normalizeBrand(a.brand || "") === normalizeBrand(brandId) ||
      normalizeBrand(a.brand_id || "") === normalizeBrand(brandId)
  );

  // When multiple rows exist under the same brand for one platform (e.g. two
  // FB pages saved against `zeneco` after a bulk OAuth run), `.find()` picks
  // an arbitrary one — which is how posts for Zen Eco Homes ended up landing
  // on Freddybremseth.com. Prefer the row whose `account_name` fuzzy-matches
  // the brand id; fall back to the first active row otherwise.
  const normBrand = normalizeBrand(brandId);
  const pickAccountForPlatform = (platform: string) => {
    const matches = accounts.filter((a: { platform: string }) => a.platform === platform);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    const byName = matches.find((a: { account_name?: string }) => {
      const name = (a.account_name || "").toLowerCase().replace(/[-_.\s]/g, "");
      return name.includes(normBrand) || normBrand.includes(name.slice(0, 6));
    });
    if (byName) {
      console.log(
        `[Publisher] ${platform} for "${brandId}": ${matches.length} candidates, picked "${byName.account_name}" by name match`,
      );
      return byName;
    }
    console.warn(
      `[Publisher] ${platform} for "${brandId}": ${matches.length} candidates, no name match — using first: "${matches[0].account_name}". Consider cleaning up /api/oauth/facebook/diagnose.`,
    );
    return matches[0];
  };

  const results: PublishResult[] = [];

  for (const platform of platforms) {
    const account = pickAccountForPlatform(platform);

    if (!account) {
      results.push({
        platform,
        success: false,
        error: `Ingen ${platform}-konto koblet til for "${brandId}".`,
      });
      continue;
    }

    try {
      let result: PublishResult;

      switch (platform) {
        case "facebook": {
          // Sanitize + auto-upgrade USER→PAGE token if needed. Throws TokenError
          // with a user-facing Norwegian message if the token is unrecoverable.
          const resolved = await resolveFacebookPageToken(
            account.id,
            account.account_id,
            account.access_token,
          );
          result = await publishToFacebook(account.account_id, resolved.token, content, publicImageUrl);
          break;
        }
        case "instagram": {
          const resolved = await resolveInstagramToken(account.id, account.access_token);
          result = await publishToInstagram(account.account_id, resolved.token, content, publicImageUrl);
          break;
        }
        case "linkedin":
          result = await publishToLinkedIn(sanitizeToken(account.access_token), account.account_id, content, publicImageUrl);
          break;
        case "youtube":
          // YouTube requires video — community posts need 500+ subscribers
          // Log the draft as "pending video" and return informative message
          result = {
            platform: "youtube",
            success: false,
            error: "YouTube-innhold krever en video. Bruk 'Eiendomsvideo' eller 'Neural Beat' for å laste opp video til YouTube.",
          };
          break;
        default:
          result = { platform, success: false, error: `Plattform "${platform}" støttes ikke.` };
      }

      results.push(result);

      if (result.success && result.postId) {
        await supabase
          .from("content_publications")
          .update({ [`${platform}_post_id`]: result.postId })
          .eq("id", draftId);
      }
    } catch (err) {
      // TokenError carries a user-facing Norwegian hint; everything else gets
      // the raw message (still useful for Graph API errors).
      const msg =
        err instanceof TokenError
          ? err.userFacing
          : err instanceof Error
            ? err.message
            : "Ukjent feil";
      results.push({ platform, success: false, error: msg });
    }
  }

  const anySuccess = results.some((r) => r.success);

  // Update draft status
  await supabase
    .from("content_publications")
    .update({
      status: anySuccess ? "published" : "failed",
      published_at: anySuccess ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      publish_attempts: 1,
      last_publish_error: anySuccess ? null : results.map((r) => r.error).filter(Boolean).join("; "),
    })
    .eq("id", draftId);

  return { results, anySuccess };
}
