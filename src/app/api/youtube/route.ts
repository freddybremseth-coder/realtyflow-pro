import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("youtube_videos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ videos: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body;

    if (type === "seo") {
      // Generate YouTube SEO using YouTube agent
      const { AgentOrchestrator } = await import("@/services/agents/orchestrator");
      const orchestrator = new AgentOrchestrator();
      const result = await orchestrator.executeCommand("youtube", body.topic || "YouTube SEO");
      return NextResponse.json(result);
    }

    // Default: save video metadata
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("youtube_videos")
      .insert(body)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ video: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
