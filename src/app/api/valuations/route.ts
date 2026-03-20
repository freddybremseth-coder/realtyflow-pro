import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Generate AI valuation using Gemini
    const { GeminiService } = await import("@/services/ai/gemini-service");
    const gemini = new GeminiService();
    const valuation = await gemini.generatePropertyValuation(body);

    // Save to database
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("saved_valuations")
      .insert({
        property_ref: body.ref,
        market_analysis: valuation,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ valuation: data, analysis: valuation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
