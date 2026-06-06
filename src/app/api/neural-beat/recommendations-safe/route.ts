import { NextRequest, NextResponse } from "next/server";
import { GET as getLegacyRecommendations } from "@/app/api/neural-beat/recommendations/route";
import {
  buildRemasterActionFingerprint,
  findRemasterActionByFingerprint,
  listRemasterActionHistory,
  recordCompletedRemasterAction,
  recordPlannedRemasterAction,
  type RemasterActionContext,
  type RemasterRecommendationAction,
} from "@/services/growth/remaster-action-history";
import { checkBrandYouTubeHealth } from "@/services/integrations/youtube-health";
import { updateRemasterVideoMetadata } from "@/services/integrations/remaster-youtube-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorizeMigration(request: NextRequest) {
  const expected = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!expected) return true;
  return (request.headers.get("x-remaster-migration-secret") || "") === expected;
}

function actionContext(body: Record<string, any>, request: NextRequest): RemasterActionContext {
  const recommendation = body.recommendation || {};
  return {
    recommendationId: typeof recommendation.id === "string" ? recommendation.id : undefined,
    title: typeof recommendation.title === "string" ? recommendation.title : undefined,
    description: typeof recommendation.description === "string" ? recommendation.description : undefined,
    impact: typeof recommendation.impact === "string" ? recommendation.impact : undefined,
    priority: ["critical", "high", "medium", "low"].includes(recommendation.priority)
      ? recommendation.priority
      : undefined,
    approvedBy: request.headers.get("x-remaster-admin") || "freddy.bremseth@gmail.com",
  };
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

  const recommendationResponse = await getLegacyRecommendations();
  const recommendationData = await recommendationResponse.json().catch(() => ({}));
  if (!recommendationResponse.ok) {
    return NextResponse.json(recommendationData, { status: recommendationResponse.status });
  }

  const history = await listRemasterActionHistory(100);
  const historyByFingerprint = new Map(history.map((item) => [item.hypothesis, item]));
  const recommendations = Array.isArray(recommendationData.recommendations)
    ? recommendationData.recommendations.map((recommendation: any) => {
        const action = recommendation?.action as RemasterRecommendationAction | undefined;
        if (!action?.type) return recommendation;
        const fingerprint = buildRemasterActionFingerprint(action);
        const previous = historyByFingerprint.get(fingerprint);
        return {
          ...recommendation,
          fingerprint,
          execution: previous
            ? {
                historyId: previous.id,
                status: previous.status,
                reviewedAt: previous.reviewed_at,
                executedAt: previous.executed_at,
              }
            : null,
        };
      })
    : [];

  return NextResponse.json({
    ...recommendationData,
    recommendations,
    actionHistory: history.slice(0, 30),
  });
}

export async function POST(request: NextRequest) {
  if (!authorizeMigration(request)) {
    return NextResponse.json({ error: "Unauthorized migration client" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action as RemasterRecommendationAction | undefined;
  if (!action || typeof action !== "object" || !action.type) {
    return NextResponse.json({ error: "No action provided" }, { status: 400 });
  }

  const context = actionContext(body, request);

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
      const fingerprint = buildRemasterActionFingerprint(action);
      const existing = await findRemasterActionByFingerprint(fingerprint);
      if (existing?.status === "completed" || existing?.status === "published") {
        return NextResponse.json(
          {
            error: "Dette metadata-tiltaket er allerede utført.",
            duplicate: true,
            history: existing,
          },
          { status: 409 },
        );
      }

      const result = await updateRemasterVideoMetadata(String(action.videoId), metadata);
      const historyResult = await recordCompletedRemasterAction(action, context, {
        channelId: result.channelId,
        channelTitle: result.channelTitle,
        updates: metadata,
      });

      return NextResponse.json({
        success: true,
        message: `Metadata oppdatert på verifisert kanal: ${result.channelTitle}`,
        result,
        updates: metadata,
        history: historyResult.action,
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

  try {
    const planned = await recordPlannedRemasterAction(action, context);
    if (planned.duplicate) {
      return NextResponse.json(
        {
          error: "Dette tiltaket er allerede lagret eller utført.",
          duplicate: true,
          history: planned.action,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Tiltaket er lagret som en planlagt veksthandling i RealtyFlow.",
      plan: action.details || context.description || context.title || action.type,
      history: planned.action,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tiltaket kunne ikke lagres" },
      { status: 500 },
    );
  }
}
