import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SchedulingAgent } from "@/services/agents/scheduling-agent";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * POST /api/ai/recommend-time
 * AI recommends optimal posting time based on platform, brand, content, and history
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platforms, brand_id, content_type, content_preview } = body as {
      platforms: string[];
      brand_id: string;
      content_type?: string;
      content_preview?: string;
    };

    if (!platforms?.length || !brand_id) {
      return NextResponse.json(
        { error: "Mangler platforms eller brand_id" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Get existing scheduled posts this week to avoid conflicts
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const { data: scheduledPosts } = await supabase
      .from("content_publications")
      .select("scheduled_at, title")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .lte("scheduled_at", weekFromNow.toISOString());

    const existingSchedule = scheduledPosts?.length
      ? scheduledPosts.map((p) => `- ${p.title}: ${p.scheduled_at}`).join("\n")
      : "Ingen planlagte poster denne uken";

    // Get engagement history from scheduling_insights
    const { data: insights } = await supabase
      .from("scheduling_insights")
      .select("*")
      .eq("brand_id", brand_id)
      .in("platform", platforms)
      .gt("sample_size", 0)
      .order("avg_engagement_rate", { ascending: false })
      .limit(20);

    const engagementHistory = insights?.length
      ? insights.map((i) =>
        `${i.platform} dag=${i.day_of_week} time=${i.hour_utc}UTC: engasjement=${i.avg_engagement_rate}%, rekkevidde=${i.avg_reach}, n=${i.sample_size}`
      ).join("\n")
      : "Ingen historisk data ennå - bruker bransjestandarder";

    // Call the scheduling agent
    const agent = new SchedulingAgent();
    const results = await agent.executeTasks([{
      id: "rec-1",
      name: "recommend_posting_time",
      description: "Recommend posting time",
      priority: "high",
      parameters: {
        platforms,
        brand_id,
        content_type: content_type || "post",
        content_preview: content_preview || "",
        existing_schedule: existingSchedule,
        engagement_history: engagementHistory,
      },
      status: "pending",
    }]);

    const output = results[0]?.output || "";

    // Try to parse JSON from the AI response
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          success: true,
          ...parsed,
          raw_output: output,
        });
      }
    } catch {
      // If JSON parsing fails, return raw output
    }

    return NextResponse.json({
      success: true,
      recommendations: platforms.map((p) => {
        const baseline = SchedulingAgent.getBaselineRecommendation(p);
        const now = new Date();
        const targetDate = new Date(now);
        // Find the next occurrence of the recommended day
        const daysUntil = (baseline.dayOfWeek - now.getDay() + 7) % 7 || 7;
        targetDate.setDate(now.getDate() + daysUntil);
        targetDate.setUTCHours(baseline.hourUTC, 0, 0, 0);

        return {
          platform: p,
          recommended_datetime: targetDate.toISOString(),
          confidence: 0.7,
          reasoning: `Basert på bransjestandarder for ${p}`,
        };
      }),
      general_advice: output || "AI-anbefaling ikke tilgjengelig, bruker bransjestandarder",
    });
  } catch (err) {
    console.error("[AI Recommend Time] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI-anbefaling feilet" },
      { status: 500 }
    );
  }
}
