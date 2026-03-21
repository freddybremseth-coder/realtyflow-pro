import { NextRequest, NextResponse } from "next/server";
import {
  getChannelInfo,
  listVideos,
  uploadVideo,
  updateVideoMetadata,
  isConfigured,
} from "@/services/integrations/youtube-client";

/**
 * GET /api/youtube
 *
 * Returns channel statistics and recent videos with analytics.
 * If YouTube is not configured, returns { configured: false }.
 */
export async function GET() {
  try {
    if (!isConfigured()) {
      return NextResponse.json({
        configured: false,
        channel: null,
        videos: [],
      });
    }

    const [channel, videos] = await Promise.all([
      getChannelInfo(),
      listVideos(),
    ]);

    return NextResponse.json({
      configured: true,
      channel,
      videos,
    });
  } catch (error) {
    console.error("[YouTube API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/youtube
 *
 * Upload a video to YouTube via multipart form data.
 * Expected form fields:
 *   - file: video file (required)
 *   - title: string (required)
 *   - description: string (optional)
 *   - tags: comma-separated string (optional)
 *   - categoryId: string (optional, defaults to '10' for Music)
 *   - privacyStatus: 'public' | 'unlisted' | 'private' (optional, defaults to 'private')
 */
export async function POST(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "YouTube is not configured" },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No video file provided" },
        { status: 400 }
      );
    }

    const title = formData.get("title") as string;
    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const description = (formData.get("description") as string) || "";
    const tagsRaw = (formData.get("tags") as string) || "";
    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const categoryId = (formData.get("categoryId") as string) || "10";
    const privacyStatus =
      (formData.get("privacyStatus") as "public" | "unlisted" | "private") ||
      "private";

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await uploadVideo(buffer, {
      title,
      description,
      tags,
      categoryId,
      privacyStatus,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[YouTube API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/youtube
 *
 * Update video metadata on YouTube.
 * Expected JSON body:
 *   - videoId: string (required)
 *   - title: string (optional)
 *   - description: string (optional)
 *   - tags: string[] (optional)
 *   - categoryId: string (optional)
 *   - privacyStatus: 'public' | 'unlisted' | 'private' (optional)
 */
export async function PATCH(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "YouTube is not configured" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { videoId, ...metadata } = body;

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId is required" },
        { status: 400 }
      );
    }

    await updateVideoMetadata(videoId, metadata);

    return NextResponse.json({ success: true, videoId });
  } catch (error) {
    console.error("[YouTube API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
