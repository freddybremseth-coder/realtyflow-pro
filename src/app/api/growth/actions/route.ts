import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricsFromRow(row: any, suffix = "") {
  const get = (field: string) => row?.[`${field}${suffix}`];
  return {
    impressions: num(get("impressions")),
    views: num(get("impressions")),
    clicks: num(get("clicks")),
    conversions: num(get("conversions")),
    engagement_rate: num(get("engagement_rate")),
    shares: num(get("shares")),
    leads_generated: num(get("leads_generated")),
  };
}

function normalizeAction(row: any) {
  if (!row) return row;
  return {
    ...row,
    brand_id: row.brand,
    metrics: metricsFromRow(row),
    metrics_b: metricsFromRow(row, "_b"),
  };
}

function flattenMetrics(target: Record<string, unknown>, metrics: Record<string, unknown>, suffix = "") {
  const impressionValue = metrics.impressions ?? metrics.views;
  if (impressionValue !== undefined) target[`impressions${suffix}`] = num(impressionValue);
  if (metrics.clicks !== undefined) target[`clicks${suffix}`] = num(metrics.clicks);
  if (metrics.conversions !== undefined) target[`conversions${suffix}`] = num(metrics.conversions);
  if (metrics.engagement_rate !== undefined) target[`engagement_rate${suffix}`] = num(metrics.engagement_rate);
  if (metrics.shares !== undefined) target[`shares${suffix}`] = num(metrics.shares);
  if (metrics.leads_generated !== undefined || metrics.leads !== undefined) {
    target[`leads_generated${suffix}`] = num(metrics.leads_generated ?? metrics.leads);
  }
}

export async function GET(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request, { success: false, actions: [] });
    if (adminError) return adminError;

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const brand = searchParams.get("brand");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    let query = supabase
      .from("growth_actions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (brand) query = query.eq("brand", brand);
    if (status) query = query.eq("status", status);
    if (type) query = query.eq("action_type", type);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      actions: (data || []).map(normalizeAction),
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[GrowthActions API] GET error:", err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request);
    if (adminError) return adminError;

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 500 });

    const body = await request.json();
    const { id, metrics, metrics_b, ...updates } = body;
    if (!id) return NextResponse.json({ success: false, error: "Action ID is required" }, { status: 400 });

    const allowedFields = new Set([
      "status", "ab_winner", "learnings", "executed_at", "reviewed_at", "content", "content_b", "priority",
    ]);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.has(key)) sanitized[key] = value;
    }

    if (metrics && typeof metrics === "object") flattenMetrics(sanitized, metrics as Record<string, unknown>);
    if (metrics_b && typeof metrics_b === "object") flattenMetrics(sanitized, metrics_b as Record<string, unknown>, "_b");

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json({ success: false, error: "No valid fields to update" }, { status: 400 });
    }

    if (sanitized.status === "published" && !sanitized.executed_at) sanitized.executed_at = new Date().toISOString();
    if (sanitized.status === "completed" && !sanitized.reviewed_at) sanitized.reviewed_at = new Date().toISOString();

    if (metrics && metrics_b && !sanitized.ab_winner) {
      const a = metrics as Record<string, unknown>;
      const b = metrics_b as Record<string, unknown>;
      if (num(a.impressions ?? a.views) >= 100 && num(b.impressions ?? b.views) >= 100) {
        const scoreA = num(a.engagement_rate) * 0.4 + num(a.conversions) * 0.4 + num(a.shares) * 0.2;
        const scoreB = num(b.engagement_rate) * 0.4 + num(b.conversions) * 0.4 + num(b.shares) * 0.2;
        sanitized.ab_winner = scoreA >= scoreB ? "a" : "b";
        sanitized.learnings = `Auto-selected: Variant ${String(sanitized.ab_winner).toUpperCase()} won. Score A: ${scoreA.toFixed(2)}, Score B: ${scoreB.toFixed(2)}`;
      }
    }

    const { data, error } = await supabase.from("growth_actions").update(sanitized).eq("id", id).select().single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, action: normalizeAction(data) });
  } catch (err) {
    console.error("[GrowthActions API] PATCH error:", err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request);
    if (adminError) return adminError;
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 500 });

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "Action ID is required (pass as ?id=...)" }, { status: 400 });

    const { error } = await supabase.from("growth_actions").delete().eq("id", id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deleted: id });
  } catch (err) {
    console.error("[GrowthActions API] DELETE error:", err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}
