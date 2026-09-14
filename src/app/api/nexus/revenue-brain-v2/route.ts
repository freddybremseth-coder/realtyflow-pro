import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { loadNexusRevenueCommandSnapshot } from "@/lib/nexus-command-readers";
import { buildRevenueBrainV2 } from "@/lib/nexus/revenue-brain-v2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const snapshot = await loadNexusRevenueCommandSnapshot(supabase, {
      brand: request.nextUrl.searchParams.get("brand"),
      pipeline: request.nextUrl.searchParams.get("pipeline"),
    });
    return NextResponse.json(buildRevenueBrainV2({
      generatedAt: snapshot.generatedAt,
      growthMissions: snapshot.growthMissions,
      agenticPlans: snapshot.agenticPlans,
      health: snapshot.health,
      warnings: snapshot.warnings,
    }, Number(request.nextUrl.searchParams.get("limit") || 25)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
