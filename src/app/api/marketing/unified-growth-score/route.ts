import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { loadUnifiedGrowthScore } from "@/services/marketing/unified-growth-score";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const daysRaw = Number(request.nextUrl.searchParams.get("days") || 30);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(daysRaw, 365)) : 30;
  const brandId = request.nextUrl.searchParams.get("brandId")?.trim() || undefined;

  try {
    const report = await loadUnifiedGrowthScore(supabase as any, { days, brandId });
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, max-age=0, no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
