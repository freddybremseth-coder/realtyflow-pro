import { NextRequest, NextResponse } from "next/server";
import {
  isRemasterBrand,
  REMASTER_OAUTH_RETURN_PATH,
} from "@/lib/remaster/oauth-return";
import { checkBrandYouTubeHealth } from "@/services/integrations/youtube-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function reconnectReturnTo(brandId: string) {
  return isRemasterBrand(brandId)
    ? REMASTER_OAUTH_RETURN_PATH
    : "/settings?tab=sosiale-medier";
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (expectedSecret) {
    const supplied = request.headers.get("x-remaster-migration-secret") || "";
    if (supplied !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized migration client" }, { status: 401 });
    }
  }

  const brandId = (request.nextUrl.searchParams.get("brandId") || "remasterfreddy")
    .trim()
    .toLowerCase();
  const reconnectUrl = `${request.nextUrl.origin}/api/oauth/google?brand_id=${encodeURIComponent(brandId)}&service=youtube&return_to=${encodeURIComponent(reconnectReturnTo(brandId))}`;

  try {
    const health = await checkBrandYouTubeHealth(brandId);
    return NextResponse.json({
      ...health,
      brandId,
      reconnectUrl,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        configured: false,
        brandId,
        reason: "status_check_failed",
        message: error instanceof Error ? error.message : "YouTube status check failed",
        reconnectUrl,
        checkedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
