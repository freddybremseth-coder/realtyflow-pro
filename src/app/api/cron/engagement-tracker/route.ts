export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listVideos, isConfigured as ytConfigured } from "@/services/integrations/youtube-client";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";

// Runs daily to fetch engagement metrics for published posts
export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function fetchFacebookEngagement(postId: string, accessToken: string) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${accessToken}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      likes: data.likes?.summary?.total_count || 0,
      comments: data.comments?.summary?.total_count || 0,
      shares: data.shares?.count || 0,
      reach: 0,
      impressions: 0,
    };
  } catch {
    return null;
  }
}

async function fetchInstagramEngagement(mediaId: string, accessToken: string) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}?fields=like_count,comments_count,reach,impressions&access_token=${accessToken}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      likes: data.like_count || 0,
      comments: data.comments_count || 0,
      shares: 0,
      reach: data.reach || 0,
      impressions: data.impressions || 0,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireCronApi(request);
    if (unauthorized) return unauthorized;

    const safeMode = await evaluateCronSafeMode('/api/cron/engagement-tracker');
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

    console.log("[Engagement Tracker] Starting...");

    // Get published posts from last 30 days that have post IDs
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: posts } = await supabase
      .from("content_publications")
      .select("id, brand_id, facebook_post_id, instagram_post_id, linkedin_post_id, published_at, scheduled_platforms")
      .eq("status", "published")
      .gte("published_at", thirtyDaysAgo.toISOString())
      .limit(30);

    if (!posts?.length) {
      return NextResponse.json({ message: "No published posts to track", tracked: 0 });
    }

    // Get social accounts for tokens
    const { data: accounts } = await supabase
      .from("social_accounts")
      .select("platform, brand, access_token")
      .eq("is_active", true);

    const getToken = (brand: string, platform: string) => {
      const normBrand = (b: string) => b.toLowerCase().replace(/[-_.\s]/g, "").replace(/homes$/, "").replace(/pro$/, "");
      return accounts?.find(
        (a) => a.platform === platform && normBrand(a.brand) === normBrand(brand)
      )?.access_token;
    };

    let tracked = 0;

    for (const post of posts) {
      // Facebook
      if (post.facebook_post_id) {
        const token = getToken(post.brand_id, "facebook");
        if (token) {
          const engagement = await fetchFacebookEngagement(post.facebook_post_id, token);
          if (engagement) {
            await supabase.from("engagement_snapshots").insert({
              publication_id: post.id,
              platform: "facebook",
              post_id: post.facebook_post_id,
              ...engagement,
              raw_data: engagement,
            });

            // Update the main publication engagement field
            await supabase
              .from("content_publications")
              .update({
                engagement: { ...engagement, platform: "facebook", updated: new Date().toISOString() },
              })
              .eq("id", post.id);

            tracked++;
          }
        }
      }

      // Instagram
      if (post.instagram_post_id) {
        const token = getToken(post.brand_id, "instagram");
        if (token) {
          const engagement = await fetchInstagramEngagement(post.instagram_post_id, token);
          if (engagement) {
            await supabase.from("engagement_snapshots").insert({
              publication_id: post.id,
              platform: "instagram",
              post_id: post.instagram_post_id,
              ...engagement,
              raw_data: engagement,
            });
            tracked++;
          }
        }
      }
    }

    // ── YouTube engagement tracking ──────────────────────────
    if (ytConfigured()) {
      try {
        const ytVideos = await listVideos(50);
        for (const video of ytVideos) {
          // Try to match with a content_publication by video URL
          const { data: matchedPub } = await supabase
            .from("content_publications")
            .select("id")
            .or(`external_url.ilike.%${video.id}%,content.ilike.%${video.id}%`)
            .limit(1)
            .single();

          if (matchedPub) {
            await supabase.from("engagement_snapshots").insert({
              publication_id: matchedPub.id,
              platform: "youtube",
              post_id: video.id,
              likes: video.likeCount,
              comments: video.commentCount,
              shares: 0,
              reach: video.viewCount,
              impressions: video.viewCount,
              raw_data: { viewCount: video.viewCount, likeCount: video.likeCount, commentCount: video.commentCount },
            });

            await supabase
              .from("content_publications")
              .update({
                total_views: video.viewCount,
                total_likes: video.likeCount,
                total_comments: video.commentCount,
              })
              .eq("id", matchedPub.id);

            tracked++;
          }
        }
        console.log(`[Engagement Tracker] YouTube: processed ${ytVideos.length} videos`);
      } catch (ytErr) {
        console.error("[Engagement Tracker] YouTube tracking error:", ytErr);
      }
    }

    // Update scheduling_insights with aggregated data
    if (tracked > 0) {
      const { data: snapshots } = await supabase
        .from("engagement_snapshots")
        .select("platform, publication_id, likes, comments, shares, reach, snapshot_at")
        .gte("snapshot_at", thirtyDaysAgo.toISOString());

      if (snapshots?.length) {
        // Get the publish times for each publication
        const pubIds = Array.from(new Set(snapshots.map((s) => s.publication_id)));
        const { data: pubs } = await supabase
          .from("content_publications")
          .select("id, brand_id, published_at")
          .in("id", pubIds);

        const pubMap = new Map(pubs?.map((p) => [p.id, p]) || []);

        // Aggregate by brand + platform + day + hour
        const aggregated = new Map<string, { total: number; count: number; brand: string; platform: string; day: number; hour: number }>();

        for (const snap of snapshots) {
          const pub = pubMap.get(snap.publication_id);
          if (!pub?.published_at) continue;

          const pubDate = new Date(pub.published_at);
          const day = pubDate.getUTCDay();
          const hour = pubDate.getUTCHours();
          const key = `${pub.brand_id}:${snap.platform}:${day}:${hour}`;
          const engagementRate = snap.likes + snap.comments * 2 + snap.shares * 3;

          const existing = aggregated.get(key) || { total: 0, count: 0, brand: pub.brand_id, platform: snap.platform, day, hour };
          existing.total += engagementRate;
          existing.count++;
          aggregated.set(key, existing);
        }

        // Upsert to scheduling_insights
        for (const agg of Array.from(aggregated.values())) {
          await supabase
            .from("scheduling_insights")
            .upsert({
              brand_id: agg.brand,
              platform: agg.platform,
              day_of_week: agg.day,
              hour_utc: agg.hour,
              avg_engagement_rate: agg.count > 0 ? agg.total / agg.count : 0,
              avg_reach: 0,
              sample_size: agg.count,
              updated_at: new Date().toISOString(),
            }, { onConflict: "brand_id,platform,day_of_week,hour_utc" });
        }
      }
    }

    console.log(`[Engagement Tracker] Done. Tracked ${tracked} posts.`);

    return NextResponse.json({ message: `Tracked ${tracked} posts`, tracked });
  } catch (err) {
    console.error("[Engagement Tracker] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tracking feilet" },
      { status: 500 }
    );
  }
}
