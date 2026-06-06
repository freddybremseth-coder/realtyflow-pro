import { NextRequest, NextResponse } from "next/server";
import { checkBrandYouTubeHealth } from "@/services/integrations/youtube-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function remasterAdminUrl() {
  return (
    process.env.REMASTER_ADMIN_URL ||
    process.env.NEXT_PUBLIC_REMASTER_ADMIN_URL ||
    "https://remasterfreddy.vercel.app/admin"
  );
}

function reconnectReturnTo(brandId: string) {
  return brandId === "remasterfreddy" || brandId === "neuralbeat"
    ? remasterAdminUrl()
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
