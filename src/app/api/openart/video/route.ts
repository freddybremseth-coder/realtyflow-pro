import { NextRequest, NextResponse } from "next/server";

import {
  OpenArtError,
  getOpenArtCreation,
  openArtGenerateVideo,
} from "@/services/integrations/openart-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/openart/video
 *   Body: { prompt, sourceImageUrl?, aspectRatio?, durationSeconds?, resolution?, generateAudio? }
 *   → { historyId, status: "PENDING" }
 *
 * GET /api/openart/video?historyId=...
 *   → { historyId, status, videoUrl?, thumbnailUrl?, failedReason? }
 *
 * Video generation takes minutes, so the client submits once and polls the
 * GET endpoint — the whole job never has to fit inside one serverless
 * invocation. Uses OpenArt credits (opt-in only).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, sourceImageUrl, aspectRatio, durationSeconds, resolution, generateAudio } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Mangler prompt" }, { status: 400 });
    }

    const historyId = await openArtGenerateVideo({
      prompt,
      sourceImageUrl: typeof sourceImageUrl === "string" && sourceImageUrl ? sourceImageUrl : undefined,
      aspectRatio,
      durationSeconds: Number(durationSeconds) || 5,
      resolution,
      generateAudio: Boolean(generateAudio),
    });

    return NextResponse.json({ historyId, status: "PENDING" });
  } catch (err) {
    if (err instanceof OpenArtError && err.connectRequired) {
      return NextResponse.json({ error: err.message, connectRequired: true }, { status: 409 });
    }
    console.error("[OpenArt Video] Submit error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke starte videogenerering" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const historyId = req.nextUrl.searchParams.get("historyId");
  if (!historyId) {
    return NextResponse.json({ error: "Mangler historyId" }, { status: 400 });
  }

  try {
    const creation = await getOpenArtCreation(historyId);
    return NextResponse.json({
      historyId,
      status: creation.status,
      videoUrl: creation.status === "COMPLETED" ? creation.urls[0] || null : null,
      thumbnailUrl: creation.thumbnailUrls[0] || null,
      failedReason: creation.failedReason || null,
    });
  } catch (err) {
    if (err instanceof OpenArtError && err.connectRequired) {
      return NextResponse.json({ error: err.message, connectRequired: true }, { status: 409 });
    }
    console.error("[OpenArt Video] Status error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke hente status" },
      { status: 500 },
    );
  }
}
