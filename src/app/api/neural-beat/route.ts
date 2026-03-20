import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    // Fetch songs from Airtable
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!apiKey || !baseId) {
      return NextResponse.json({ songs: [], message: "Airtable not configured" });
    }

    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/Songs?view=Grid%20view`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!response.ok) throw new Error("Airtable fetch failed");
    const data = await response.json();

    const songs = data.records.map((r: Record<string, unknown>) => ({
      id: r.id,
      ...(r.fields as Record<string, unknown>),
    }));

    return NextResponse.json({ songs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error", songs: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { songId, songName } = body;

    // Log pipeline run
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("pipeline_runs")
      .insert({
        type: "neural_beat",
        status: "processing",
        song_name: songName,
        steps_completed: [],
        current_step: "Initializing",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      pipelineId: data.id,
      message: `Pipeline started for ${songName}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
