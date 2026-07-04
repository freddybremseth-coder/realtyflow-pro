import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(req, { content: [] });
    if (unauthorized) return unauthorized;

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("content_generations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ content: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(req);
    if (unauthorized) return unauthorized;

    const body = await req.json();
    const { type, prompt, platform, brand_id } = body;

    if (type === "image") {
      // Use Gemini for image generation
      const { GeminiService } = await import("@/services/ai/gemini-service");
      const gemini = new GeminiService();
      const result = await gemini.generateMarketingImage(prompt);
      return NextResponse.json({ result });
    }

    // Use Claude agents for content generation via orchestrator
    const { AgentOrchestrator } = await import("@/services/agents/orchestrator");
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeCommand("marketing", prompt);

    // Save to database
    const supabase = createServerClient();
    await supabase.from("content_generations").insert({
      brand_id,
      platform: platform || "general",
      content: result.output,
      agent_used: result.agentName,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
