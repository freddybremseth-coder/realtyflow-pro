export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getGSCBrandSnapshot, getGSCConnectionStatus, targetForBrand } from "@/services/agents/seo-search-console";

/** Admin-only, read-only live Search Console access. No cached fake ranks. */
export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const brandId = request.nextUrl.searchParams.get("brand");
  try {
    if (!brandId) {
      return NextResponse.json({
        connections: await getGSCConnectionStatus(),
        measurement: "Only separately authorized Search Console readonly accounts are connected.",
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (!targetForBrand(brandId)) return NextResponse.json({ error: "Unknown SEO brand" }, { status: 400 });
    const snapshot = await getGSCBrandSnapshot(brandId);
    if (!snapshot) {
      return NextResponse.json({ connected: false, error: "Google Search Console is not connected for this brand." }, { status: 409 });
    }
    return NextResponse.json({ connected: true, snapshot }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[SamSEO] Search Console read failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 200) : "Search Console temporarily unavailable" }, { status: 503 });
  }
}
