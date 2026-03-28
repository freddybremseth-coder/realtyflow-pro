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

// ─── Helper: Upload base64 image to Supabase Storage and get public URL ───
async function uploadBase64ToStorage(base64DataUrl: string): Promise<string | null> {
  try {
    // Check if it's a base64 data URL
    if (!base64DataUrl.startsWith("data:")) {
      return base64DataUrl; // Already a regular URL
    }

    const supabase = getSupabase();
    const match = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;

    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");
    const fileName = `publish/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from("assets")
      .upload(fileName, buffer, {
        contentType: `image/${match[1]}`,
        upsert: true,
      });

    if (error) {
      console.error("[Upload] Storage upload failed:", error.message);
      // Try creating the bucket if it doesn't exist
      if (error.message?.includes("not found") || error.message?.includes("Bucket")) {
        await supabase.storage.createBucket("assets", { public: true });
        const { error: retryError } = await supabase.storage
          .from("assets")
          .upload(fileName, buffer, {
            contentType: `image/${match[1]}`,
            upsert: true,
          });
        if (retryError) {
          console.error("[Upload] Retry failed:", retryError.message);
          return null;
        }
      } else {
        return null;
      }
    }

    const { data: urlData } = supabase.storage.from("assets").getPublicUrl(fileName);
    console.log("[Upload] Public URL:", urlData.publicUrl);
    return urlData.publicUrl;
  } catch (err) {
    console.error("[Upload] Error:", err);
    return null;
  }
}

// ─── Platform Publishers ─────────────────────────────────────────

async function publishToFacebook(
  pageId: string,
  accessToken: string,
  message: string,
  imageUrl?: string
): Promise<PublishResult> {
  console.log(`[Publish Facebook] pageId=${pageId}, hasImage=${!!imageUrl}, messageLength=${message.length}`);

  // Facebook Graph API prefers form-urlencoded for posting
  if (imageUrl) {
    // Photo post
    const endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
    const params = new URLSearchParams({
      access_token: accessToken,
      message,
      url: imageUrl,
    });

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("[Publish Facebook] Photo error:", JSON.stringify(err));
      throw new Error(err.error?.message || JSON.stringify(err));
    }

    const { id: postId } = await res.json();
    return {
      platform: "facebook",
      success: true,
      postId,
      postUrl: `https://www.facebook.com/${postId}`,
    };
  } else {
    // Text-only post
    const endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
    const params = new URLSearchParams({
      access_token: accessToken,
      message,
    });

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("[Publish Facebook] Feed error:", JSON.stringify(err));
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
}

async function publishToInstagram(
  igAccountId: string,
  accessToken: string,
  caption: string,
  imageUrl?: string
): Promise<PublishResult> {
  if (!imageUrl) {
    return { platform: "instagram", success: false, error: "Instagram krever et bilde-URL (ikke base64)" };
  }

  // Instagram requires a publicly accessible URL
  if (imageUrl.startsWith("data:")) {
    return { platform: "instagram", success: false, error: "Instagram støtter ikke base64-bilder. Bildet må lastes opp til en server først." };
  }

  console.log(`[Publish Instagram] igAccountId=${igAccountId}, imageUrl=${imageUrl.substring(0, 80)}...`);

  // Step 1: Create media container
  const createParams = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });

  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams.toString(),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || "Instagram container feilet");
  }

  const { id: creationId } = await createRes.json();

  // Step 2: Wait a moment for processing
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Step 3: Publish container
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

    console.log(`[Publish API] draft_id=${draft_id}, platforms=${platforms.join(",")}, brand=${brand_id}, hasImage=${!!image_url}, contentPreview=${content.substring(0, 100)}...`);

    const supabase = getSupabase();

    // If we have a base64 image, upload it to get a public URL
    let publicImageUrl: string | undefined;
    if (image_url) {
      const uploaded = await uploadBase64ToStorage(image_url);
      if (uploaded) {
        publicImageUrl = uploaded;
        console.log("[Publish API] Image uploaded to:", publicImageUrl);
      } else {
        console.warn("[Publish API] Failed to upload image, continuing without image");
      }
    }

    // Get social accounts - fetch all active, then match by brand flexibly
    const { data: allAccounts, error: accError } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("is_active", true);

    const normBrand = (b: string) => b.toLowerCase().replace(/[-_.\s]/g, "").replace(/homes$/, "").replace(/pro$/, "");
    const accounts = (allAccounts || []).filter(
      (a: { brand: string }) => normBrand(a.brand) === normBrand(brand_id)
    );

    if (accError) {
      return NextResponse.json({ error: accError.message }, { status: 500 });
    }

    console.log(`[Publish API] Found ${accounts.length} accounts for brand "${brand_id}":`,
      accounts.map((a: { platform: string; account_name: string; account_id: string }) =>
        `${a.platform}:${a.account_name}(${a.account_id})`
      )
    );

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
              publicImageUrl
            );
            break;

          case "instagram":
            result = await publishToInstagram(
              account.account_id,
              account.access_token,
              content,
              publicImageUrl
            );
            break;

          case "linkedin":
            result = await publishToLinkedIn(
              account.access_token,
              account.account_id,
              content,
              publicImageUrl
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
        console.error(`[Publish API] ${platform} error:`, err);
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
