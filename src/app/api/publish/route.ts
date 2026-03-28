import { NextRequest, NextResponse } from "next/server";
import { executePublishForDraft } from "@/services/publishing/publisher";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { draft_id, platforms, content, title, brand_id, image_url } = body as {
      draft_id: string;
      platforms: string[];
      content: string;
      title?: string;
      brand_id: string;
      image_url?: string;
    };

    if (!draft_id || !platforms?.length || !content || !brand_id) {
      return NextResponse.json(
        { error: "Mangler draft_id, platforms, content eller brand_id" },
        { status: 400 }
      );
    }

    console.log(`[Publish API] draft=${draft_id}, platforms=${platforms.join(",")}, brand=${brand_id}, hasImage=${!!image_url}`);

    const { results, anySuccess } = await executePublishForDraft({
      draftId: draft_id,
      platforms,
      content,
      brandId: brand_id,
      imageUrl: image_url,
    });

    return NextResponse.json({
      success: anySuccess,
      results,
      draft_status: anySuccess ? "published" : "failed",
    });
  } catch (err) {
    console.error("[Publish API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publisering feilet" },
      { status: 500 }
    );
  }
}
