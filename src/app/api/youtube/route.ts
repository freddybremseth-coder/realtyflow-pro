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
    const { type, topic } = body;

    const TOOL_PROMPTS: Record<string, string> = {
      script: "Du er ein profesjonell YouTube-manusforfatter for eigedomsmeglarar i Spania. Lag eit detaljert videomanus med intro, hoveddel og outro for temaet:",
      title: "Du er ein YouTube CTR-ekspert for eigedomsinnhald. Lag 5 klikkvennlege videotitlar optimalisert for soek og hoeyklikk for temaet:",
      seo: "Du er ein YouTube SEO-ekspert for eigedomsmeglarar. Lag ein komplett SEO-optimalisert videobeskrivelse med tidsstempel, noekkelord og oppfording til handling for temaet:",
      tags: "Du er ein YouTube-ekspert. Lag 20 relevante tags og soekeord (kommaseparert) for ein eigedomsvideo om temaet:",
      thumbnail: "Du er ein kreativ YouTube-thumbnaildesignar for eigedom. Lag 3 detaljerte thumbnail-konsept med tekst, fargar og bilete for temaet:",
    };

    if (type && TOOL_PROMPTS[type]) {
      const { AgentOrchestrator } = await import("@/services/agents/orchestrator");
      const orchestrator = new AgentOrchestrator();
      const fullPrompt = TOOL_PROMPTS[type] + " " + (topic || "generell YouTube-video om eigedom i Spania");
      const result = await orchestrator.executeCommand("youtube", fullPrompt);
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
