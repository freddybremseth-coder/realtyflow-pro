import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * POST /api/schedule - Schedule a draft for future publishing
 * Body: { draft_id, platforms, scheduled_at, ai_recommended_time?, ai_timing_reasoning? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { draft_id, platforms, scheduled_at, ai_recommended_time, ai_timing_reasoning } = body as {
      draft_id: string;
      platforms: string[];
      scheduled_at: string;
      ai_recommended_time?: string;
      ai_timing_reasoning?: string;
    };

    if (!draft_id || !platforms?.length || !scheduled_at) {
      return NextResponse.json(
        { error: "Mangler draft_id, platforms eller scheduled_at" },
        { status: 400 }
      );
    }

    // Validate scheduled_at is in the future
    const scheduledDate = new Date(scheduled_at);
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: "scheduled_at må være i fremtiden" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const updateData: Record<string, unknown> = {
        status: "scheduled",
        scheduled_at: scheduledDate.toISOString(),
        scheduled_platforms: platforms,
        publish_attempts: 0,
        last_publish_error: null,
        updated_at: new Date().toISOString(),
      };
    // Only set optional columns if they exist (migration may not have run)
    if (ai_timing_reasoning) updateData.ai_timing_reasoning = ai_timing_reasoning;
    if (ai_recommended_time) updateData.ai_recommended_time = ai_recommended_time;

    let { error } = await supabase
      .from("content_publications")
      .update(updateData)
      .eq("id", draft_id);

    if (error && /scheduled_platforms|publish_attempts|last_publish_error|schema cache/i.test(error.message)) {
      const fallbackUpdate = { ...updateData };
      delete fallbackUpdate.scheduled_platforms;
      delete fallbackUpdate.publish_attempts;
      delete fallbackUpdate.last_publish_error;
      const retry = await supabase
        .from("content_publications")
        .update(fallbackUpdate)
        .eq("id", draft_id);
      error = retry.error;
    }

    if (error) {
      console.error("[Schedule API] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Schedule API] Scheduled draft ${draft_id} for ${scheduledDate.toISOString()} on ${platforms.join(", ")}`);

    return NextResponse.json({
      success: true,
      scheduled_at: scheduledDate.toISOString(),
      platforms,
    });
  } catch (err) {
    console.error("[Schedule API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Planlegging feilet" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/schedule - Get all scheduled posts
 */
export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("content_publications")
      .select("id, brand_id, title, description, content_type, ai_image_url, scheduled_at, status")
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scheduled: data || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Feil" },
      { status: 500 }
    );
  }
}
