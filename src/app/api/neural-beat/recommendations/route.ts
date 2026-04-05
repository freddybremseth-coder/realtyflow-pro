import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/services/ai/claude-client";
import {
  getChannelInfo,
  listVideos,
  updateVideoMetadata,
  isConfigured as ytConfigured,
} from "@/services/integrations/youtube-client";
import { createClient } from "@supabase/supabase-js";

/** Extract JSON from AI response that may contain markdown, preamble text, etc. */
function extractJSON(text: string): Record<string, unknown> {
  // 1. Try direct parse
  try { return JSON.parse(text.trim()); } catch { /* continue */ }

  // 2. Strip markdown code fences
  const stripped = text.replace(/```(?:json)?\s*\n?/g, "").trim();
  try { return JSON.parse(stripped); } catch { /* continue */ }

  // 3. Find the outermost { ... } block
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch { /* continue */ }
  }

  throw new Error("Could not extract JSON from AI response");
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/neural-beat/recommendations
 *
 * Generates concrete, executable AI recommendations for the Neural Beat channel.
 * Each recommendation has an action that can be executed via POST.
 */
export async function GET() {
  try {
    if (!ytConfigured()) {
      return NextResponse.json({ error: "YouTube ikke konfigurert" }, { status: 503 });
    }

    const [channel, videos] = await Promise.all([getChannelInfo(), listVideos(50)]);

    const now = Date.now();
    const videosWithStats = videos.map((v) => {
      const daysSince = Math.max(1, (now - new Date(v.publishedAt).getTime()) / 86400000);
      return { ...v, viewsPerDay: Math.round(v.viewCount / daysSince), daysSince: Math.round(daysSince) };
    });

    // Find videos that could benefit from optimization
    const lowPerformers = videosWithStats
      .filter((v) => v.viewsPerDay < 5 && v.daysSince > 7)
      .sort((a, b) => a.viewsPerDay - b.viewsPerDay)
      .slice(0, 5);
    const topPerformers = videosWithStats
      .sort((a, b) => b.viewsPerDay - a.viewsPerDay)
      .slice(0, 5);
    const recentVideos = videosWithStats
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 5);

    // Analyze tags/titles patterns
    const allTitles = videos.map((v) => v.title);
    const avgViews = videos.length > 0 ? Math.round(videos.reduce((s, v) => s + v.viewCount, 0) / videos.length) : 0;
    const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
    const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
    const engagementRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) : "0";

    const statsContext = `
Neural Beat YouTube Channel Analysis:
- Channel: ${channel.title}
- Subscribers: ${channel.subscriberCount}
- Total views: ${channel.viewCount}
- Videos: ${channel.videoCount}
- Avg views/video: ${avgViews}
- Engagement rate: ${engagementRate}%

Top performing videos (by views/day):
${topPerformers.map((v, i) => `${i + 1}. "${v.title}" - ${v.viewsPerDay} views/day, ${v.viewCount} total, ${v.likeCount} likes, published ${v.daysSince} days ago, tags: [${(v as any).tags?.join(', ') || 'none'}]`).join("\n")}

Underperforming videos (need optimization):
${lowPerformers.map((v, i) => `${i + 1}. "${v.title}" - ${v.viewsPerDay} views/day, ${v.viewCount} total, videoId: ${v.id}, tags: [${(v as any).tags?.join(', ') || 'none'}]`).join("\n")}

Recent uploads:
${recentVideos.map((v, i) => `${i + 1}. "${v.title}" - ${v.viewCount} views in ${v.daysSince} days, videoId: ${v.id}, tags: [${(v as any).tags?.join(', ') || 'none'}]`).join("\n")}

All video titles: ${allTitles.join(" | ")}
`.trim();

    const aiResult = await askClaude(statsContext, {
      maxTokens: 3000,
      temperature: 0.5,
      systemPrompt: `You are an elite YouTube growth strategist specializing in music/beats channels going viral. Study this channel's data deeply and generate CONCRETE, EXECUTABLE recommendations.

Return ONLY valid JSON:
{
  "recommendations": [
    {
      "id": "rec_1",
      "type": "optimize_title" | "optimize_description" | "optimize_tags" | "upload_schedule" | "content_strategy" | "thumbnail" | "engagement" | "cross_promote" | "playlist_strategy" | "shorts",
      "priority": "critical" | "high" | "medium" | "low",
      "title": "Short action title in Norwegian",
      "description": "Detailed explanation WHY this matters with specific data points (Norwegian)",
      "impact": "Expected result if executed (Norwegian)",
      "effort": "easy" | "medium" | "hard",
      "action": {
        "type": "update_metadata" | "create_content" | "strategy" | "schedule",
        "videoId": "YouTube video ID if applicable, null otherwise",
        "currentTitle": "current title if changing",
        "newTitle": "optimized title if type is optimize_title",
        "newDescription": "optimized description if type is optimize_description",
        "newTags": ["tag1", "tag2"] ,
        "details": "specific instructions for strategy/schedule/content actions"
      }
    }
  ],
  "channelHealth": {
    "score": 1-100,
    "trend": "up" | "down" | "stable",
    "summary": "One paragraph Norwegian summary of channel state"
  },
  "quickWins": ["3-5 things that can be done RIGHT NOW for immediate impact (Norwegian)"],
  "weeklyGoals": ["3-4 specific weekly targets (Norwegian)"]
}

RULES:
- Generate 8-12 recommendations
- At least 3 must be "update_metadata" type with real videoId from the data
- Include specific SEO-optimized titles for underperforming videos
- Tags should include trending music search terms
- Study what top performers have in common and apply to weak videos
- Be specific: "Change title from X to Y" not "improve titles"
- All text in Norwegian
- Think like MrBeast's team but for a music channel`,
    });

    // Calculate a basic health score from raw data as fallback
    const subsCount = channel.subscriberCount || 0;
    const rawScore = Math.min(100, Math.round(
      (subsCount > 1000 ? 20 : subsCount > 100 ? 10 : 5) +
      (parseFloat(engagementRate) > 5 ? 30 : parseFloat(engagementRate) > 2 ? 20 : 10) +
      (avgViews > 500 ? 30 : avgViews > 100 ? 20 : avgViews > 10 ? 10 : 5) +
      (videos.length > 20 ? 20 : videos.length > 5 ? 10 : 5)
    ));

    try {
      const parsed = extractJSON(aiResult);
      // Ensure channelHealth always has a valid score
      if (parsed.channelHealth) {
        const ch = parsed.channelHealth as Record<string, unknown>;
        if (!ch.score || ch.score === 0) ch.score = rawScore;
      }
      return NextResponse.json({
        ...parsed,
        channel,
        stats: { avgViews, engagementRate: parseFloat(engagementRate), totalViews, videoCount: videos.length },
      });
    } catch {
      return NextResponse.json({
        recommendations: [],
        channelHealth: {
          score: rawScore,
          trend: avgViews > 50 ? 'up' : 'stable',
          summary: `Kanalen har ${channel.subscriberCount} abonnenter, ${channel.videoCount} videoer og ${engagementRate}% engasjement. Generer anbefalinger på nytt for detaljert analyse.`,
        },
        channel,
        stats: { avgViews, engagementRate: parseFloat(engagementRate), totalViews, videoCount: videos.length },
      });
    }
  } catch (error) {
    console.error("[Neural Beat Recommendations] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/neural-beat/recommendations
 *
 * Execute a specific recommendation action (e.g., update video metadata on YouTube)
 */
export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();
    if (!action) {
      return NextResponse.json({ error: "No action provided" }, { status: 400 });
    }

    const supabase = getSupabase();

    switch (action.type) {
      case "update_metadata": {
        if (!action.videoId) throw new Error("Mangler videoId");
        if (!ytConfigured()) throw new Error("YouTube ikke konfigurert");

        const updates: Record<string, unknown> = {};
        if (action.newTitle) updates.title = action.newTitle;
        if (action.newDescription) updates.description = action.newDescription;
        if (action.newTags) updates.tags = action.newTags;

        if (Object.keys(updates).length === 0) {
          throw new Error("Ingen endringer å gjøre");
        }

        await updateVideoMetadata(action.videoId, updates as { title?: string; description?: string; tags?: string[] });

        // Log the action
        if (supabase) {
          try {
            await supabase.from("growth_actions").insert({
              brand: "neural-beat",
              action_type: "youtube_metadata_update",
              description: `Oppdatert metadata for video ${action.videoId}: ${action.newTitle || ""}`,
              status: "completed",
              result: JSON.stringify(updates),
            });
          } catch { /* silent */ }
        }

        return NextResponse.json({
          success: true,
          message: `Oppdatert YouTube-video: ${action.newTitle || action.videoId}`,
          updates,
        });
      }

      case "create_content": {
        // Generate content plan and save to growth_actions
        const contentPlan = await askClaude(
          `Lag detaljert innholdsplan: ${action.details}`,
          {
            maxTokens: 1500,
            model: "sonnet",
            systemPrompt: "Du er en YouTube-innholdsstrateg for Neural Beat (AI-musikk). Lag en konkret, handlingsrettet plan på norsk.",
          }
        );

        if (supabase) {
          try {
            await supabase.from("growth_actions").insert({
              brand: "neural-beat",
              action_type: "content_plan",
              description: action.details,
              status: "planned",
              result: contentPlan,
            });
          } catch { /* silent */ }
        }

        return NextResponse.json({
          success: true,
          message: "Innholdsplan opprettet",
          plan: contentPlan,
        });
      }

      case "strategy":
      case "schedule": {
        // Save strategy/schedule as growth action
        if (supabase) {
          try {
            await supabase.from("growth_actions").insert({
              brand: "neural-beat",
              action_type: action.type === "strategy" ? "strategy_update" : "schedule_update",
              description: action.details,
              status: "planned",
            });
          } catch { /* silent */ }
        }

        return NextResponse.json({
          success: true,
          message: `${action.type === "strategy" ? "Strategi" : "Opplastingsplan"} lagret`,
        });
      }

      default:
        return NextResponse.json({ error: `Ukjent handlingstype: ${action.type}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[Neural Beat Recommendations] Execute error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukjent feil" },
      { status: 500 }
    );
  }
}
