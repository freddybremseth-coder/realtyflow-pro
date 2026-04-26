import { NextResponse } from "next/server";
import { askClaude } from "@/services/ai/claude-client";
import {
  getChannelInfo,
  listVideos,
  isConfigured as ytConfigured,
} from "@/services/integrations/youtube-client";

/** Extract JSON from AI response that may contain markdown, preamble text, etc. */
function extractJSON(text: string): Record<string, unknown> {
  try { return JSON.parse(text.trim()); } catch { /* continue */ }
  const stripped = text.replace(/```(?:json)?\s*\n?/g, "").trim();
  try { return JSON.parse(stripped); } catch { /* continue */ }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch { /* continue */ }
  }
  throw new Error("Could not extract JSON from AI response");
}

/**
 * GET /api/neural-beat/analytics
 *
 * Fetches YouTube channel + video stats, runs AI analysis for viral strategy,
 * and generates Mix playlist suggestions by mood/style.
 */
export async function GET() {
  try {
    if (!ytConfigured()) {
      return NextResponse.json(
        { error: "YouTube is not configured" },
        { status: 503 }
      );
    }

    const [channel, videos] = await Promise.all([
      getChannelInfo("neuralbeat"),
      listVideos(50, "neuralbeat"),
    ]);

    // Sort videos by views to identify top performers
    const sortedByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount);
    const topVideos = sortedByViews.slice(0, 10);
    const recentVideos = [...videos].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    ).slice(0, 10);

    // Calculate performance metrics
    const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
    const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
    const avgViews = videos.length > 0 ? Math.round(totalViews / videos.length) : 0;
    const avgLikes = videos.length > 0 ? Math.round(totalLikes / videos.length) : 0;
    const engagementRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) : "0";

    // Identify trends: which videos grew fastest (views per day since publish)
    const now = Date.now();
    const videosWithGrowth = videos.map((v) => {
      const daysSincePublish = Math.max(1, (now - new Date(v.publishedAt).getTime()) / 86400000);
      return {
        ...v,
        viewsPerDay: Math.round(v.viewCount / daysSincePublish),
        likesPerDay: +(v.likeCount / daysSincePublish).toFixed(1),
      };
    });
    const fastestGrowing = [...videosWithGrowth].sort((a, b) => b.viewsPerDay - a.viewsPerDay).slice(0, 5);

    // Build AI analysis prompt
    const statsContext = `
YouTube Channel: ${channel.title}
Subscribers: ${channel.subscriberCount}
Total Views: ${channel.viewCount}
Total Videos: ${channel.videoCount}
Average Views per Video: ${avgViews}
Average Likes per Video: ${avgLikes}
Engagement Rate (likes/views): ${engagementRate}%

Top 10 Videos by Views:
${topVideos.map((v, i) => `${i + 1}. "${v.title}" - ${v.viewCount} views, ${v.likeCount} likes, ${v.commentCount} comments`).join("\n")}

Fastest Growing (views/day):
${fastestGrowing.map((v, i) => `${i + 1}. "${v.title}" - ${v.viewsPerDay} views/day, ${v.likesPerDay} likes/day`).join("\n")}

Recent 10 Videos:
${recentVideos.map((v, i) => `${i + 1}. "${v.title}" - Published: ${new Date(v.publishedAt).toLocaleDateString("en-US")} - ${v.viewCount} views`).join("\n")}
`.trim();

    // AI analysis - gracefully degrade if AI is unavailable
    let analysis = null;
    let mixes: any = { mixes: [] };

    try {
      const [analysisResult, mixResult] = await Promise.all([
        askClaude(statsContext, {
          maxTokens: 2000,
          temperature: 0.6,
          systemPrompt: `You are a YouTube growth strategist specializing in music channels going viral. Analyze the channel stats and provide actionable insights in JSON format.

Return ONLY valid JSON with this structure:
{
  "overallScore": 1-100,
  "summary": "2-3 sentence channel performance summary",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "viralStrategy": {
    "titleFormulas": ["formula 1 with example", "formula 2 with example"],
    "thumbnailTips": ["tip 1", "tip 2"],
    "uploadSchedule": "recommended schedule",
    "contentGaps": ["gap 1", "gap 2"],
    "trendingTopics": ["topic 1", "topic 2", "topic 3"]
  },
  "actionItems": [
    {"priority": "high"|"medium"|"low", "action": "specific action", "expectedImpact": "what this achieves"}
  ],
  "benchmarks": {
    "currentGrowthRate": "X views/day average",
    "targetGrowthRate": "Y views/day to hit 1M views",
    "estimatedTimeToMilestone": "estimated time to next subscriber milestone"
  }
}

Focus on music/beats channels. Study patterns from channels like ChilledCow (Lofi Girl), Trap Nation, MrSuicideSheep that went from small to millions. Be specific - not generic advice.`,
        }),
        askClaude(statsContext, {
          maxTokens: 2000,
          temperature: 0.7,
          systemPrompt: `You are a music curator and YouTube playlist strategist. Based on the channel's content and what works in the music video space, suggest Mix playlists that would maximize watch time and attract new subscribers.

Return ONLY valid JSON with this structure:
{
  "mixes": [
    {
      "title": "English playlist title optimized for YouTube search",
      "emoji": "relevant emoji",
      "mood": "mood category",
      "description": "SEO-optimized description for the playlist",
      "targetAudience": "who this is for",
      "suggestedLength": "X hours",
      "viralPotential": "high"|"medium"|"low",
      "searchKeywords": ["keyword1", "keyword2"],
      "exampleSongs": ["type of song 1", "type of song 2"]
    }
  ]
}

Create 8-10 mixes covering these categories:
- Chill/Lo-fi for studying or relaxing
- Workout/Gym energy
- Late night vibes
- Romantic mood
- Focus/Deep work
- Party/Hype
- Morning motivation
- Ambient/Sleep
- Road trip / Driving
All titles and descriptions must be in English and optimized for viral YouTube search. Think about what people actually search for: "chill beats to study to", "gym workout music 2026", "late night drive playlist" etc.`,
        }),
      ]);

      // Parse AI responses
      try {
        analysis = extractJSON(analysisResult);
      } catch {
        // Clean up raw AI text - remove JSON artifacts and code blocks
        const cleanSummary = analysisResult
          .replace(/```(?:json)?\s*/g, '')
          .replace(/[{}\[\]"]/g, '')
          .replace(/\s*:\s*/g, ': ')
          .replace(/,\s*\n/g, '\n')
          .trim()
          .split('\n')
          .filter((line: string) => line.trim().length > 10)
          .slice(0, 3)
          .join('. ');
        analysis = { summary: cleanSummary || 'AI-analyse er utilgjengelig akkurat nå. Prøv igjen senere.', overallScore: 0 };
      }
      try {
        mixes = extractJSON(mixResult);
      } catch {
        mixes = { mixes: [] };
      }
    } catch (aiError) {
      console.warn("[Neural Beat Analytics] AI analysis unavailable:", aiError instanceof Error ? aiError.message : aiError);
      // Continue without AI - stats are still valuable
    }

    return NextResponse.json({
      channel,
      metrics: {
        totalViews,
        totalLikes,
        avgViews,
        avgLikes,
        engagementRate: parseFloat(engagementRate),
        videoCount: videos.length,
      },
      topVideos,
      fastestGrowing,
      recentVideos,
      analysis,
      mixes: mixes.mixes || mixes,
    });
  } catch (error) {
    console.error("[Neural Beat Analytics] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
