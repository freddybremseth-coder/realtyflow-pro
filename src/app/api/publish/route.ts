import { NextRequest, NextResponse } from "next/server";

import { executePublishForDraft } from "@/services/publishing/publisher";

/**
 * POST /api/publish
 *
 * Body:
 *   {
 *     draft_id: string,
 *     brand_id: string,
 *     content: string,
 *     platforms: string[],
 *     image_url?: string,
 *     title?: string,
 *
 *     // Phase 4: explicit per-platform channel pin. When a brand has more
 *     // than one connected channel for a platform, the publisher refuses
 *     // to guess and returns a 409 with the candidate list instead. The
 *     // UI is expected to read /api/oauth/channels and POST back the
 *     // chosen social_channel_id here.
 *     social_channel_ids?: { [platform: string]: string },
 *   }
 *
 * Response:
 *   200  { success, results, draft_status, ambiguities? }
 *   400  validation error
 *   409  { error: "ambiguous_channels", ambiguities: [...] }   (caller must pin)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      draft_id,
      platforms,
      content,
      title: _title,
      brand_id,
      image_url,
      social_channel_ids,
    } = body as {
      draft_id: string;
      platforms: string[];
      content: string;
      title?: string;
      brand_id: string;
      image_url?: string;
      social_channel_ids?: Record<string, string>;
    };

    if (!draft_id || !platforms?.length || !content || !brand_id) {
      return NextResponse.json(
        { error: "Mangler draft_id, platforms, content eller brand_id" },
        { status: 400 },
      );
    }

    console.log(
      `[Publish API] draft=${draft_id}, platforms=${platforms.join(",")}, brand=${brand_id}, ` +
        `pinned=${social_channel_ids ? Object.keys(social_channel_ids).join(",") : "none"}, ` +
        `hasImage=${!!image_url}`,
    );

    const { results, anySuccess, ambiguities } = await executePublishForDraft({
      draftId: draft_id,
      platforms,
      content,
      brandId: brand_id,
      imageUrl: image_url,
      socialChannelIds: social_channel_ids,
    });

    // If every requested platform was rejected because of ambiguity, return
    // a 409 so the UI can flip into "pick a channel" mode without parsing
    // the per-platform error strings.
    if (ambiguities && ambiguities.length === platforms.length && !anySuccess) {
      return NextResponse.json(
        {
          error: "ambiguous_channels",
          message:
            "Flere kontoer matcher denne merkevaren. Velg eksplisitt social_channel_id per plattform og prøv igjen.",
          ambiguities,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: anySuccess,
      results,
      ambiguities,
      draft_status: anySuccess ? "published" : "failed",
    });
  } catch (err) {
    console.error("[Publish API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publisering feilet" },
      { status: 500 },
    );
  }
}
