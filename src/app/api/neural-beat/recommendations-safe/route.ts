import { NextRequest, NextResponse } from "next/server";
import {
  GET as getLegacyRecommendations,
  POST as executeLegacyRecommendation,
} from "@/app/api/neural-beat/recommendations/route";
import { checkBrandYouTubeHealth } from "@/services/integrations/youtube-health";
import { updateRemasterVideoMetadata } from "@/services/integrations/remaster-youtube-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorizeMigration(request: NextRequest) {
  const expected = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!expected) return true;
  return (request.headers.get("x-remaster-migration-secret") || "") === expected;
}

export async function GET(request: NextRequest) {
  if (!authorizeMigration(request)) {
    return NextResponse.json({ error: "Unauthorized migration client" }, { status: 401 });
  }

  const health = await checkBrandYouTubeHealth("remasterfreddy");
  if (!health.connected) {
    return NextResponse.json(
      {
        error: health.message || "Re-Master Freddy YouTube-tilkoblingen er ikke gyldig.",
        reason: health.reason || "connection_failed",
      },
      { status: 409 },
    );
  }

  return getLegacyRecommendations();
}

export async function POST(request: NextRequest) {
  if (!authorizeMigration(request)) {
    return NextResponse.json({ error: "Unauthorized migration client" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  if (!action || typeof action !== "object") {
    return NextResponse.json({ error: "No action provided" }, { status: 400 });
  }

  if (action.type === "update_metadata") {
    if (!action.videoId) {
      return NextResponse.json({ error: "Mangler videoId" }, { status: 400 });
    }

    const metadata: { title?: string; description?: string; tags?: string[] } = {};
    if (typeof action.newTitle === "string" && action.newTitle.trim()) metadata.title = action.newTitle.trim();
    if (typeof action.newDescription === "string" && action.newDescription.trim()) metadata.description = action.newDescription;
    if (Array.isArray(action.newTags)) metadata.tags = action.newTags.map(String).filter(Boolean).slice(0, 30);

    if (Object.keys(metadata).length === 0) {
      return NextResponse.json({ error: "Ingen metadataendringer å utføre" }, { status: 400 });
    }

    try {
      const result = await updateRemasterVideoMetadata(String(action.videoId), metadata);
      return NextResponse.json({
        success: true,
        message: `Metadata oppdatert på verifisert kanal: ${result.channelTitle}`,
        result,
        updates: metadata,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Metadataoppdateringen feilet" },
        { status: 500 },
      );
    }
  }

  if (!["create_content", "strategy", "schedule"].includes(String(action.type))) {
    return NextResponse.json({ error: `Handlingstypen ${String(action.type)} er ikke tillatt` }, { status: 400 });
  }

  const forwarded = new NextRequest(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return executeLegacyRecommendation(forwarded);
}
