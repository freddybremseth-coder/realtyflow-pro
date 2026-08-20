export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listVideos, isConfigured as ytConfigured } from "@/services/integrations/youtube-client";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";
import { fetchInstagramMediaEngagement } from "@/services/integrations/instagram-insights";

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
      `https://graph.facebook.com/v25.0/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${accessToken}`
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
      .select("id, brand_id, facebook_post_id, instagram_post_id, linkedin_post_id, published_at, scheduled_platforms, source_social_post_id")
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

    const getModernToken = async (brand: string, platform: "facebook" | "instagram") => {
      const channels = await getChannelsByBrand(brand, platform);
      if (channels.length !== 1) return null;
      return (await getDecryptedTokens(channels[0].id))?.accessToken ?? null;
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
        const token = (await getModernToken(post.brand_id, "instagram")) || getToken(post.brand_id, "instagram");
        if (token) {
          try {
            const engagement = await fetchInstagramMediaEngagement(post.instagram_post_id, token);
            const ageHours = post.published_at ? (Date.now() - new Date(post.published_at).getTime()) / 3_600_000 : 0;
            const metricWindow = ageHours <= 36 ? "24h" : ageHours <= 216 ? "7d" : "30d";
            await supabase.from("engagement_snapshots").insert({
              publication_id: post.id,
              platform: "instagram",
              post_id: post.instagram_post_id,
              likes: engagement.likes,
              comments: engagement.comments,
              shares: engagement.shares,
              saves: engagement.saves,
              views: engagement.views,
              reach: engagement.reach,
              impressions: engagement.impressions || engagement.views,
              total_interactions: engagement.totalInteractions,
              media_type: String((engagement.raw.media as Record<string, unknown> | undefined)?.media_type || ''),
              metric_window: metricWindow,
              raw_data: {
                ...engagement.raw,
                views: engagement.views,
                saves: engagement.saves,
                total_interactions: engagement.totalInteractions,
              },
            });

            await supabase
              .from("content_publications")
              .update({
                total_views: engagement.views || engagement.impressions,
                total_likes: engagement.likes,
                total_comments: engagement.comments,
                total_shares: engagement.shares,
                engagement: {
                  platform: "instagram",
                  reach: engagement.reach,
                  impressions: engagement.impressions,
                  views: engagement.views,
                  saves: engagement.saves,
                  total_interactions: engagement.totalInteractions,
                  updated: new Date().toISOString(),
                },
              })
              .eq("id", post.id);

            if (post.source_social_post_id) {
              const { data: socialPost } = await supabase
                .from("social_posts")
                .select("organization_id,user_email")
                .eq("id", post.source_social_post_id)
                .maybeSingle();
              if (socialPost) {
                await supabase.from("social_post_metrics").insert({
                  organization_id: socialPost.organization_id,
                  user_email: socialPost.user_email,
                  post_id: post.source_social_post_id,
                  recorded_at: new Date().toISOString(),
                  impressions: engagement.impressions || engagement.views,
                  reach: engagement.reach,
                  reactions: engagement.likes,
                  comments: engagement.comments,
                  shares: engagement.shares,
                  saves: engagement.saves,
                  notes: "Automatisk importert fra Instagram Insights",
                });
              }
            }
            tracked++;
          } catch (error) {
            console.error(`[Engagement Tracker] Instagram ${post.instagram_post_id}:`, error);
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
        .select("platform, publication_id, likes, comments, shares, saves, reach, impressions, views, snapshot_at")
        .gte("snapshot_at", thirtyDaysAgo.toISOString());

      if (snapshots?.length) {
        const latestByPost = new Map<string, (typeof snapshots)[number]>();
        for (const snapshot of snapshots) {
          const key = `${snapshot.publication_id}:${snapshot.platform}`;
          if (!latestByPost.has(key)) latestByPost.set(key, snapshot);
        }
        const latestSnapshots = Array.from(latestByPost.values());
        // Get the publish times for each publication
        const pubIds = Array.from(new Set(latestSnapshots.map((s) => s.publication_id)));
        const { data: pubs } = await supabase
          .from("content_publications")
          .select("id, brand_id, published_at")
          .in("id", pubIds);

        const pubMap = new Map(pubs?.map((p) => [p.id, p]) || []);

        // Aggregate by brand + platform + day + hour
        const aggregated = new Map<string, { total: number; totalReach: number; count: number; brand: string; platform: string; day: number; hour: number }>();

        for (const snap of latestSnapshots) {
          const pub = pubMap.get(snap.publication_id);
          if (!pub?.published_at) continue;

          const pubDate = new Date(pub.published_at);
          const day = pubDate.getUTCDay();
          const hour = pubDate.getUTCHours();
          const key = `${pub.brand_id}:${snap.platform}:${day}:${hour}`;
          const audience = Math.max(snap.reach || 0, snap.impressions || 0, snap.views || 0, 1);
          const engagementRate = ((snap.likes + snap.comments * 2 + snap.shares * 4 + (snap.saves || 0) * 3) / audience) * 100;

          const existing = aggregated.get(key) || { total: 0, totalReach: 0, count: 0, brand: pub.brand_id, platform: snap.platform, day, hour };
          existing.total += engagementRate;
          existing.totalReach += snap.reach || 0;
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
              avg_reach: Math.round(agg.count > 0 ? agg.totalReach / agg.count : 0),
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
