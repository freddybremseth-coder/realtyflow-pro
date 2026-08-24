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

function nextMetricsCronAt(nowMs: number): Date {
  const now = new Date(nowMs);
  let cron = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 19, 30, 0));
  if (cron.getTime() <= nowMs) cron = new Date(cron.getTime() + 86_400_000);
  return cron;
}

async function readStatus(brandId = "zeneco") {
  const supabase = supabaseAdmin();

  const [{ data: snapshots }, { data: rules }, { data: published }, { data: touchpoints }] = await Promise.all([
    supabase
      .from("marketing_events")
      .select("content_id, occurred_at, metadata")
      .eq("brand_id", brandId)
      .eq("channel", "instagram")
      .eq("event_type", "metrics_snapshot"),
    supabase
      .from("marketing_learning_rules")
      .select("dimension, value, sample, lift, evidence, verdict, finding, updated_at")
      .eq("scope", brandId)
      .in("dimension", ["tag", "tags", "area", "propertyType", "priceBand", "hookType", "ctaType"])
      .order("sample", { ascending: false })
      .order("lift", { ascending: false })
      .limit(80),
    supabase
      .from("marketing_publications")
      .select("publication_id, content_id, updated_at")
      .eq("brand_id", brandId)
      .eq("channel", "instagram")
      .eq("state", "published"),
    supabase
      .from("marketing_touchpoints")
      .select("contact_id, content_id, touch_type, commission_eur, occurred_at")
      .eq("brand_id", brandId)
      .eq("channel", "instagram"),
  ]);

  const snapshotRows = snapshots ?? [];
  const eligibleRows = snapshotRows.filter((r: any) => r?.metadata?.learning_eligible !== false);
  const quarantinedRows = snapshotRows.filter((r: any) => r?.metadata?.learning_eligible === false);

  const measuredCount = new Set(snapshotRows.map((r) => String(r.content_id ?? "")).filter(Boolean)).size;
  const observations = new Set(eligibleRows.map((r) => String(r.content_id ?? "")).filter(Boolean)).size;
  const quarantinedCount = new Set(quarantinedRows.map((r) => String(r.content_id ?? "")).filter(Boolean)).size;
  const publishedCount = new Set((published ?? []).map((r) => String(r.content_id ?? "")).filter(Boolean)).size;

  const maturityHours = 24;
  const maturityMs = maturityHours * 3_600_000;
  const nowMs = Date.now();
  const matureBefore = nowMs - maturityMs;
  const maturePublishedCount = new Set(
    (published ?? [])
      .filter((r) => r.updated_at && new Date(r.updated_at).getTime() <= matureBefore)
      .map((r) => String(r.content_id ?? ""))
      .filter(Boolean),
  ).size;
  const immaturePublishedCount = Math.max(0, publishedCount - maturePublishedCount);
  const nextMaturesAt = (published ?? [])
    .map((r) => r.updated_at ? new Date(r.updated_at).getTime() : NaN)
    .filter((t) => Number.isFinite(t) && t > matureBefore)
    .sort((a, b) => a - b)
    .map((t) => new Date(t + maturityMs).toISOString())
    .at(0) ?? null;

  const nextCron = nextMetricsCronAt(nowMs);
  const matureByNextCronBefore = nextCron.getTime() - maturityMs;
  const eligibleByNextCronCount = new Set(
    (published ?? [])
      .filter((r) => r.updated_at && new Date(r.updated_at).getTime() <= matureByNextCronBefore)
      .map((r) => String(r.content_id ?? ""))
      .filter(Boolean),
  ).size;

  const businessRows = touchpoints ?? [];
  const distinctContacts = (touchType: string) => new Set(
    businessRows
      .filter((r: any) => r.touch_type === touchType)
      .map((r: any) => String(r.contact_id ?? ""))
      .filter(Boolean),
  ).size;
  const saleRows = businessRows.filter((r: any) => r.touch_type === "sale");
  const commissionEur = saleRows.reduce((sum: number, row: any) => {
    const n = Number(row.commission_eur);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const businessFunnel = {
    leads: distinctContacts("lead_created"),
    qualified: distinctContacts("qualified"),
    viewings: distinctContacts("viewing"),
    offers: distinctContacts("offer"),
    sales: saleRows.length,
    commissionEur,
    lastBusinessTouchAt: businessRows
      .map((r: any) => r.occurred_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
  };

  const learningThreshold = 10;

  return {
    brandId,
    channel: "instagram",
    publishedCount,
    maturePublishedCount,
    immaturePublishedCount,
    maturityHours,
    nextMaturesAt,
    nextMetricsCronAt: nextCron.toISOString(),
    eligibleByNextCronCount,
    measuredCount,
    observations,
    quarantinedCount,
    learningThreshold,
    learningActive: observations >= learningThreshold,
    remainingUntilLearning: Math.max(0, learningThreshold - observations),
    lastSnapshotAt: snapshotRows
      .map((r) => r.occurred_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
    quarantineReasons: quarantinedRows.reduce((acc: Record<string, number>, row: any) => {
      const reason = String(row?.metadata?.data_quality_reason || "unknown");
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {}),
    businessFunnel,
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
      minAgeHours: 24,
      learningMinObservations: 10,
    });
    return NextResponse.json({ ok: true, sync, status: await readStatus(brandId) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
