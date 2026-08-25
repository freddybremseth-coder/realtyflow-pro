import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { auditPublishedMarketingIntegrity } from "@/services/marketing/publication-integrity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  try {
    const brandId = request.nextUrl.searchParams.get("brandId")?.trim() || "";
    const channel = request.nextUrl.searchParams.get("channel")?.trim() || "";
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 50);
    if (!brandId) return NextResponse.json({ error: "brandId er påkrevd" }, { status: 400 });
    if (!channel) return NextResponse.json({ error: "channel er påkrevd" }, { status: 400 });

    const supabase = getServiceSupabase();
    if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const result = await auditPublishedMarketingIntegrity(supabase as any, {
      brandId,
      channel,
      limit: Number.isFinite(rawLimit) ? rawLimit : 50,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
