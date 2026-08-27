import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import type { BusinessPipelineId } from "@/lib/business-pipeline-registry";
import {
  targetsFromGrowthPlanRows,
  upsertCommercialTargetMetadata,
} from "@/lib/nexus-commercial-targets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("marketing_brand_growth_plans")
    .select("brand_id,status,conversion_goals,primary_ctas,metadata,updated_at")
    .order("brand_id", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  return NextResponse.json({
    targets: targetsFromGrowthPlanRows(rows),
    plans: rows.map((row) => ({
      brandId: row.brand_id,
      status: row.status,
      conversionGoals: row.conversion_goals || [],
      primaryCtas: row.primary_ctas || [],
      updatedAt: row.updated_at || null,
    })),
    safety: {
      explicitTargetsOnly: true,
      defaultsInvented: false,
      inactivePlansDriveDirector: false,
    },
  });
}

export async function PUT(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const brandId = String(body.brandId || "").trim();
  const pipelineId = String(body.pipelineId || "").trim() as BusinessPipelineId;
  if (!brandId || !pipelineId) {
    return NextResponse.json({ error: "brandId and pipelineId are required" }, { status: 400 });
  }

  const { data: plan, error: readError } = await supabase
    .from("marketing_brand_growth_plans")
    .select("brand_id,status,metadata")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Brand growth plan not found" }, { status: 404 });

  let metadata: Record<string, unknown>;
  try {
    metadata = upsertCommercialTargetMetadata(
      (plan.metadata || {}) as Record<string, unknown>,
      {
        pipelineId,
        targetNewPerWeek: body.targetNewPerWeek ?? null,
        targetConversionsPerMonth: body.targetConversionsPerMonth ?? null,
        updatedAt: new Date().toISOString(),
      },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("marketing_brand_growth_plans")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("brand_id", brandId)
    .select("brand_id,status,metadata,updated_at")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    brandId,
    pipelineId,
    active: String(updated.status || "").toLowerCase() === "active",
    targets: targetsFromGrowthPlanRows([updated]),
    safety: {
      explicitTargetsOnly: true,
      externalActionExecuted: false,
      note: "Targets are stored only. Director gap missions still require measurable evidence and a trusted sync state.",
    },
  });
}
