export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executePublishForDraft } from "@/services/publishing/publisher";
import type { PublishResult } from "@/services/publishing/publisher";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";

// Vercel cron: runs every 15 minutes to check for scheduled posts
export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function publishDraftToWebsite(origin: string, post: {
  id: string;
  brand_id: string;
  title: string;
  description: string | null;
  ai_image_url: string | null;
}): Promise<{ success: boolean; result: PublishResult }> {
  const res = await fetch(`${origin}/api/website-cms/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand_id: post.brand_id,
      title: post.title || "Uten tittel",
      content: post.description || post.title || "",
      image_url: post.ai_image_url || undefined,
      tags: ["website"],
      status: "published",
      source_type: "content_publication",
      source_id: post.id,
    }),
  });
  const data = await res.json().catch(() => ({ error: "Kunne ikke lese website-respons." }));
  if (!res.ok || !data.success) {
    return {
      success: false,
      result: {
        platform: "website",
        success: false,
        error: data.error || "Publisering til nettside feilet.",
      },
    };
  }

  return {
    success: true,
    result: {
      platform: "website",
      success: true,
      postUrl: typeof data.externalUrl === "string" ? data.externalUrl : undefined,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    // 1. Verify CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const safeMode = await evaluateCronSafeMode('/api/cron/auto-publish');
    if (safeMode.skip) {
      return NextResponse.json({
        success: true,
        skipped: true,
        mode: safeMode.mode,
        reason: safeMode.reason,
      });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    console.log("[Auto-Publish Cron] Starting check for scheduled posts...");

    // 2. Find posts that are due for publishing
    const now = new Date().toISOString();
    const { data: duePosts, error } = await supabase
      .from("content_publications")
      .select("id, brand_id, title, description, content_type, ai_image_url, scheduled_at, scheduled_platforms, publish_attempts")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(5); // Process max 5 per run to stay within timeout

    if (error) {
      console.error("[Auto-Publish Cron] Query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!duePosts || duePosts.length === 0) {
      console.log("[Auto-Publish Cron] No posts due for publishing.");
      return NextResponse.json({ message: "No posts due", published: 0 });
    }

    console.log(`[Auto-Publish Cron] Found ${duePosts.length} posts due for publishing.`);

    const publishResults = [];
    const origin = request.nextUrl.origin;

    // 3. Publish each due post
    for (const post of duePosts) {
      const platforms = Array.isArray(post.scheduled_platforms) ? post.scheduled_platforms.map(String) : [];
      const socialPlatforms = platforms.filter((platform: string) => platform !== "website");
      const includesWebsite = platforms.includes("website");
      if (platforms.length === 0) {
        console.warn(`[Auto-Publish Cron] Post ${post.id} has no platforms, skipping.`);
        await supabase
          .from("content_publications")
          .update({ status: "failed", last_publish_error: "Ingen plattformer valgt" })
          .eq("id", post.id);
        continue;
      }

      // Don't retry posts that have failed 3+ times
      if ((post.publish_attempts || 0) >= 3) {
        console.warn(`[Auto-Publish Cron] Post ${post.id} has ${post.publish_attempts} failed attempts, marking as failed.`);
        await supabase
          .from("content_publications")
          .update({
            status: "failed",
            last_publish_error: "Maks antall forsøk (3) overskredet",
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);
        continue;
      }

      console.log(`[Auto-Publish Cron] Publishing: "${post.title}" to ${platforms.join(", ")}`);

      try {
        // Increment attempt counter first
        await supabase
          .from("content_publications")
          .update({ publish_attempts: (post.publish_attempts || 0) + 1 })
          .eq("id", post.id);

        const combinedResults: PublishResult[] = [];
        let anySuccess = false;

        if (socialPlatforms.length > 0) {
          const socialOutcome = await executePublishForDraft({
            draftId: post.id,
            platforms: socialPlatforms,
            content: post.description || "",
            brandId: post.brand_id,
            imageUrl: post.ai_image_url || undefined,
          });
          combinedResults.push(...socialOutcome.results);
          anySuccess = anySuccess || socialOutcome.anySuccess;
        }

        if (includesWebsite) {
          const websiteOutcome = await publishDraftToWebsite(origin, post);
          combinedResults.push(websiteOutcome.result);
          anySuccess = anySuccess || websiteOutcome.success;
        }

        publishResults.push({
          postId: post.id,
          title: post.title,
          success: anySuccess,
          results: combinedResults,
        });

        // Log to automation_logs
        try {
          await supabase.from("automation_logs").insert({
            type: "auto_publish",
            status: anySuccess ? "success" : "error",
            details: {
              post_id: post.id,
              title: post.title,
              platforms,
              results: combinedResults,
            },
          });
        } catch {
          // Ignore log failures
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Ukjent feil";
        console.error(`[Auto-Publish Cron] Failed to publish ${post.id}:`, errorMsg);

        await supabase
          .from("content_publications")
          .update({
            last_publish_error: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);

        publishResults.push({
          postId: post.id,
          title: post.title,
          success: false,
          error: errorMsg,
        });
      }
    }

    const successCount = publishResults.filter((r) => r.success).length;
    console.log(`[Auto-Publish Cron] Done. ${successCount}/${publishResults.length} published successfully.`);

    return NextResponse.json({
      message: `Processed ${publishResults.length} posts, ${successCount} successful`,
      published: successCount,
      results: publishResults,
    });
  } catch (err) {
    console.error("[Auto-Publish Cron] Fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron feilet" },
      { status: 500 }
    );
  }
}
