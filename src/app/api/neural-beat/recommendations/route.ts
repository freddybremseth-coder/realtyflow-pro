import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/services/ai/claude-client";
import {
  getChannelInfo,
  listVideos,
  updateVideoMetadata,
  isConfigured as ytConfigured,
} from "@/services/integrations/youtube-client";
import { createClient } from "@supabase/supabase-js";

const YOUTUBE_BRAND_ID = "remasterfreddy";

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

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  try {
    if (!ytConfigured()) {
      return NextResponse.json({ error: "YouTube ikke konfigurert" }, { status: 503 });
    }

    const [channel, videos] = await Promise.all([
      getChannelInfo(YOUTUBE_BRAND_ID),
      listVideos(50, YOUTUBE_BRAND_ID),
    ]);

    const now = Date.now();
    const videosWithStats = videos.map((v) => {
      const daysSince = Math.max(1, (now - new Date(v.publishedAt).getTime()) / 86400000);
      return { ...v, viewsPerDay: Math.round(v.viewCount / daysSince), daysSince: Math.round(daysSince) };
    });

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

    const allTitles = videos.map((v) => v.title);
    const avgViews = videos.length > 0 ? Math.round(videos.reduce((s, v) => s + v.viewCount, 0) / videos.length) : 0;
    const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
    const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
    const engagementRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) : "0";

    const statsContext = `
Re-Master Freddy YouTube Channel Analysis:
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
        "newTags": ["tag1", "tag2"],
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

    const subsCount = channel.subscriberCount || 0;
    const rawScore = Math.min(100, Math.round(
      (subsCount > 1000 ? 20 : subsCount > 100 ? 10 : 5) +
      (parseFloat(engagementRate) > 5 ? 30 : parseFloat(engagementRate) > 2 ? 20 : 10) +
      (avgViews > 500 ? 30 : avgViews > 100 ? 20 : avgViews > 10 ? 10 : 5) +
      (videos.length > 20 ? 20 : videos.length > 5 ? 10 : 5)
    ));

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = extractJSON(aiResult);
      if (parsed.channelHealth) {
        const ch = parsed.channelHealth as Record<string, unknown>;
        if (!ch.score || ch.score === 0) ch.score = rawScore;
      }
    } catch {
      console.warn("[Neural Beat Recommendations] AI JSON parse failed, generating data-driven recommendations");
    }

    const aiRecs = parsed?.recommendations as unknown[] | undefined;
    if (aiRecs && Array.isArray(aiRecs) && aiRecs.length > 0) {
      return NextResponse.json({
        ...parsed,
        channel,
        stats: { avgViews, engagementRate: parseFloat(engagementRate), totalViews, videoCount: videos.length },
      });
    }

    const fallbackRecs: Record<string, unknown>[] = [];
    let recCounter = 1;

    for (const v of lowPerformers.slice(0, 3)) {
      const hasKeywords = /lofi|chill|beats|relaxing|study|ambient|trap|hip hop/i.test(v.title);
      if (!hasKeywords) {
        fallbackRecs.push({
          id: `rec_${recCounter++}`,
          type: 'optimize_title',
          priority: 'critical',
          title: `Optimaliser tittel: "${v.title}"`,
          description: `Denne videoen har bare ${v.viewsPerDay} visninger/dag. Tittelen mangler søkbare nøkkelord som folk bruker på YouTube (lofi, chill, beats, study, etc).`,
          impact: `Kan øke visninger med 200-500% ved å matche populære søkeord.`,
          effort: 'easy',
          action: {
            type: 'update_metadata',
            videoId: v.id,
            currentTitle: v.title,
            newTitle: `${v.title} | Chill Beats for Study & Relax 2026`,
            newTags: ['lofi', 'chill beats', 'study music', 'relaxing music', 'ambient', 're-master freddy', 'ai music', 'focus music'],
            details: null,
          },
        });
      } else {
        const vid = v as any;
        if (!vid.tags || vid.tags.length < 5) {
          fallbackRecs.push({
            id: `rec_${recCounter++}`,
            type: 'optimize_tags',
            priority: 'high',
            title: `Forbedre tags på "${v.title.slice(0, 40)}..."`,
            description: `Tittelen er god, men videoen har ${vid.tags?.length || 0} tags. YouTube anbefaler 10-15 relevante tags for optimal synlighet.`,
            impact: 'Flere relevante tags gjør at YouTube forstår innholdet bedre og viser det til riktig publikum.',
            effort: 'easy',
            action: {
              type: 'update_metadata',
              videoId: v.id,
              currentTitle: v.title,
              newTitle: null,
              newTags: ['lofi', 'chill beats', 'study music', 'relaxing music', 'ambient', 're-master freddy', 'ai music', 'focus music', 'coding music', 'concentration music'],
              details: null,
            },
          });
        }
      }
    }

    for (const v of videosWithStats.slice(0, 3)) {
      const vid = v as any;
      if (!vid.tags || vid.tags.length < 3) {
        fallbackRecs.push({
          id: `rec_${recCounter++}`,
          type: 'optimize_tags',
          priority: 'high',
          title: `Legg til tags på "${v.title.slice(0, 40)}..."`,
          description: `Videoen mangler tags som hjelper YouTube å forstå innholdet og anbefale det til seere.`,
          impact: `Tags hjelper YouTube-algoritmen å plassere videoen i anbefalinger og søk.`,
          effort: 'easy',
          action: {
            type: 'update_metadata',
            videoId: v.id,
            currentTitle: v.title,
            newTitle: null,
            newTags: ['ai music', 're-master freddy', 'chill beats', 'lofi hip hop', 'study music', 'relaxing beats', 'ambient music', 'focus music', 'coding music', 'work music'],
            details: null,
          },
        });
      }
    }

    if (topPerformers.length > 0) {
      const topTitles = topPerformers.slice(0, 3).map((v) => `"${v.title}"`).join(', ');
      fallbackRecs.push({
        id: `rec_${recCounter++}`,
        type: 'content_strategy',
        priority: 'high',
        title: 'Lag mer innhold som toppvideoene dine',
        description: `Dine best presterende videoer er ${topTitles}. Analyser hva de har til felles (tittelformat, lengde, stil) og lag lignende innhold.`,
        impact: 'Konsistent innhold i topp-format kan doble gjennomsnittlige visninger.',
        effort: 'medium',
        action: {
          type: 'create_content',
          videoId: null,
          details: `Lag 5 nye spor inspirert av stilen til de mest sette videoene: ${topTitles}. Fokuser på samme stemning, tempo og tittelformat.`,
        },
      });
    }

    fallbackRecs.push({
      id: `rec_${recCounter++}`,
      type: 'upload_schedule',
      priority: 'medium',
      title: 'Følg en fast publiseringsplan',
      description: 'Publiser på faste dager og tidspunkter, slik at publikum og YouTube-algoritmen lærer kanalrytmen.',
      impact: 'Bedre konsistens kan øke tilbakevendende seere og anbefalingstrafikk.',
      effort: 'medium',
      action: {
        type: 'schedule',
        videoId: null,
        details: 'Publiser 2-3 videoer per uke. Test tirsdag og torsdag kl. 18:00 samt søndag kl. 12:00 i fire uker.',
      },
    });

    return NextResponse.json({
      recommendations: fallbackRecs,
      channelHealth: {
        score: rawScore,
        trend: 'stable',
        summary: `Kanalen har ${channel.subscriberCount} abonnenter, ${videos.length} analyserte videoer og ${avgViews} gjennomsnittlige visninger per video.`,
      },
      quickWins: [
        'Oppdater titler og tags på videoer med lav visningstakt.',
        'Bruk faste thumbnail-maler med sterk kontrast og kort tekst.',
        'Legg ut nye videoer på konsekvente dager og klokkeslett.',
      ],
      weeklyGoals: [
        'Publiser minst to nye videoer.',
        'Optimaliser metadata på tre eldre videoer.',
        'Følg opp visninger per dag på de fem nyeste videoene.',
      ],
      channel,
      stats: { avgViews, engagementRate: parseFloat(engagementRate), totalViews, videoCount: videos.length },
    });
  } catch (error) {
    console.error("[Neural Beat Recommendations] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate recommendations" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    if (!action) {
      return NextResponse.json({ error: "No action provided" }, { status: 400 });
    }

    if (action.type === "update_metadata") {
      if (!action.videoId) {
        return NextResponse.json({ error: "Mangler videoId" }, { status: 400 });
      }
      const updates: { title?: string; description?: string; tags?: string[] } = {};
      if (action.newTitle) updates.title = action.newTitle;
      if (action.newDescription) updates.description = action.newDescription;
      if (action.newTags) updates.tags = action.newTags;
      await updateVideoMetadata(action.videoId, updates, YOUTUBE_BRAND_ID);
      return NextResponse.json({ success: true, message: "Metadata oppdatert", updates });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase ikke konfigurert" }, { status: 503 });
    }

    const plan = typeof action.details === "string" ? action.details.trim() : "";
    if (!plan) {
      return NextResponse.json({ error: "Tiltaket mangler detaljer" }, { status: 400 });
    }

    const { error } = await supabase.from("growth_actions").insert({
      source: "remasterfreddy_recommendations",
      action_type: String(action.type || "strategy"),
      title: plan.slice(0, 160),
      description: plan,
      status: "planned",
      priority: "medium",
      metadata: {
        brand_id: YOUTUBE_BRAND_ID,
        video_id: action.videoId || null,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Tiltaket er lagret som en planlagt veksthandling i RealtyFlow.",
      plan,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recommendation execution failed" },
      { status: 500 },
    );
  }
}
