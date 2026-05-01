// ─── POST /api/ad-campaigns/analyze-image ──────────────────────────────
// Body: { image_url: string, enrich?: boolean }
// Returns: ImageAnalysis (see services/ads/image-analyzer.ts)
//
// Used by the Ad Campaign wizard right after a user uploads a product
// photo, to auto-fill product_name + label_description fields.

import { NextRequest, NextResponse } from "next/server";
import { analyzeProductImage, enrichWithBrandKnowledge } from "@/services/ads/image-analyzer";

export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const { image_url, enrich = true } = await req.json();
    if (!image_url || typeof image_url !== "string") {
      return NextResponse.json({ error: "Missing image_url" }, { status: 400 });
    }

    let analysis = await analyzeProductImage(image_url);
    if (enrich && analysis.confidence !== "low") {
      analysis = await enrichWithBrandKnowledge(analysis);
    }

    return NextResponse.json({ analysis });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
