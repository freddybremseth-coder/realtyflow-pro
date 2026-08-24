export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { syncGrowthInstagramMetrics } from "@/services/marketing/growth-metrics-sync";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

async function readStatus(brandId = "zeneco") {
  const supabase = supabaseAdmin();

  const [{ data: snapshots }, { data: rules }, { data: published }] = await Promise.all([
    supabase
      .from("marketing_events")
      .select("content_id, occurred_at")
      .eq("brand_id", brandId)
      .eq("channel", "instagram")
      .eq("event_type", "metrics_snapshot"),
    supabase
      .from("marketing_learning_rules")
      .select("dimension, value, sample, lift, evidence, verdict, finding, updated_at")
      .eq("scope", brandId)
      .in("dimension", ["tags", "area", "propertyType", "priceBand", "hookType", "ctaType"])
      .order("sample", { ascending: false })
      .order("lift", { ascending: false })
      .limit(50),
    supabase
      .from("marketing_publications")
      .select("publication_id, content_id, updated_at")
      .eq("brand_id", brandId)
      .eq("channel", "instagram")
      .eq("state", "published"),
  ]);

  const observations = new Set((snapshots ?? []).map((r) => String(r.content_id ?? "")).filter(Boolean)).size;
  const publishedCount = new Set((published ?? []).map((r) => String(r.content_id ?? "")).filter(Boolean)).size;
  const learningThreshold = 10;

  return {
    brandId,
    channel: "instagram",
    publishedCount,
    observations,
    learningThreshold,
    learningActive: observations >= learningThreshold,
    remainingUntilLearning: Math.max(0, learningThreshold - observations),
    lastSnapshotAt: (snapshots ?? [])
      .map((r) => r.occurred_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
    rules: rules ?? [],
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    const brandId = request.nextUrl.searchParams.get("brandId")?.trim() || "zeneco";
    return NextResponse.json(await readStatus(brandId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json().catch(() => ({}));
    const brandId = typeof body?.brandId === "string" && body.brandId.trim() ? body.brandId.trim() : "zeneco";
    const supabase = supabaseAdmin();
    const sync = await syncGrowthInstagramMetrics(supabase as any, {
      brandId,
      days: 30,
      limit: 100,
      learningMinObservations: 10,
    });
    return NextResponse.json({ ok: true, sync, status: await readStatus(brandId) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
