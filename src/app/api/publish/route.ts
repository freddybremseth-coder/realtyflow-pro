import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface PublishResult {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

// ─── Platform Publishers ─────────────────────────────────────────

async function publishToFacebook(
  pageId: string,
  accessToken: string,
  message: string,
  imageUrl?: string
): Promise<PublishResult> {
  const endpoint = imageUrl
    ? `https://graph.facebook.com/v19.0/${pageId}/photos`
    : `https://graph.facebook.com/v19.0/${pageId}/feed`;

  const params: Record<string, string> = { access_token: accessToken, message };
  if (imageUrl) params.url = imageUrl;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
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

async function publishToInstagram(
  igAccountId: string,
  accessToken: string,
  caption: string,
  imageUrl?: string
): Promise<PublishResult> {
  if (!imageUrl) {
    return { platform: "instagram", success: false, error: "Instagram krever et bilde-URL" };
  }

  // Step 1: Create media container
  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || "Instagram container feilet");
  }

  const { id: creationId } = await createRes.json();

  // Step 2: Publish container
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
    }
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

async function publishToLinkedIn(
  accessToken: string,
  accountId: string,
  content: string,
  imageUrl?: string
): Promise<PublishResult> {
  // Determine author URN - could be person or organization
  const author = accountId.startsWith("urn:")
    ? accountId
    : `urn:li:person:${accountId}`;

  const postBody: Record<string, unknown> = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content },
        shareMediaCategory: imageUrl ? "IMAGE" : "NONE",
        ...(imageUrl
          ? {
              media: [{ status: "READY", originalUrl: imageUrl }],
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
  const postId = data.id || "";
  return {
    platform: "linkedin",
    success: true,
    postId,
    postUrl: `https://www.linkedin.com/feed/update/${postId}/`,
  };
}

// ─── Main Publish Endpoint ───────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      draft_id,
      platforms,
      content,
      title,
      brand_id,
      image_url,
    } = body as {
      draft_id: string;
      platforms: string[];
      content: string;
      title?: string;
      brand_id: string;
      image_url?: string;
    };

    if (!draft_id || !platforms?.length || !content || !brand_id) {
      return NextResponse.json(
        { error: "Mangler draft_id, platforms, content eller brand_id" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Get social accounts for this brand
    const { data: accounts, error: accError } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("brand", brand_id)
      .eq("is_active", true);

    if (accError) {
      return NextResponse.json({ error: accError.message }, { status: 500 });
    }

    const results: PublishResult[] = [];

    for (const platform of platforms) {
      const account = accounts?.find((a: { platform: string }) => a.platform === platform);

      if (!account) {
        results.push({
          platform,
          success: false,
          error: `Ingen ${platform}-konto koblet til for "${brand_id}". Koble til via Innstillinger → Sosiale Medier.`,
        });
        continue;
      }

      try {
        let result: PublishResult;

        switch (platform) {
          case "facebook":
            result = await publishToFacebook(
              account.account_id,
              account.access_token,
              content,
              image_url
            );
            break;

          case "instagram":
            result = await publishToInstagram(
              account.account_id,
              account.access_token,
              content,
              image_url
            );
            break;

          case "linkedin":
            result = await publishToLinkedIn(
              account.access_token,
              account.account_id,
              content,
              image_url
            );
            break;

          default:
            result = {
              platform,
              success: false,
              error: `Plattform "${platform}" er ikke støttet ennå.`,
            };
        }

        results.push(result);

        // Update draft with post ID
        if (result.success && result.postId) {
          const updateField = `${platform}_post_id`;
          await supabase
            .from("content_publications")
            .update({ [updateField]: result.postId })
            .eq("id", draft_id);
        }
      } catch (err) {
        results.push({
          platform,
          success: false,
          error: err instanceof Error ? err.message : "Ukjent feil",
        });
      }
    }

    // Update draft status
    const allSuccess = results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);

    const newStatus = allSuccess
      ? "published"
      : anySuccess
        ? "published" // partial success still counts
        : "failed";

    await supabase
      .from("content_publications")
      .update({
        status: newStatus,
        published_at: anySuccess ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft_id);

    return NextResponse.json({
      success: anySuccess,
      results,
      draft_status: newStatus,
    });
  } catch (err) {
    console.error("[Publish API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publisering feilet" },
      { status: 500 }
    );
  }
}
