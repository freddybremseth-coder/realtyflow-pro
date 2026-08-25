import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const [rulesRes, expRes] = await Promise.all([
    supabase.from("book_growth_learning_rules").select("*").order("updated_at", { ascending: false }).limit(300),
    supabase.from("book_growth_experiments").select("id,dimension,primary_metric,result,lift,evidence_level,status,book_id,recommendation_id").eq("status", "evaluated").limit(1000),
  ]);
  const error = rulesRes.error || expRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: rulesRes.data ?? [], evaluatedExperiments: expRes.data ?? [] });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: experiments, error } = await supabase.from("book_growth_experiments")
    .select("id,dimension,primary_metric,result,lift,evidence_level,status,book_id,recommendation_id")
    .eq("status", "evaluated").in("evidence_level", ["moderate", "strong"]).limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = new Map<string, any[]>();
  for (const e of experiments ?? []) {
    if (!e.dimension || e.lift == null) continue;
    const key = `${e.dimension}::${e.primary_metric || "unknown"}`;
    const rows = groups.get(key) ?? [];
    rows.push(e);
    groups.set(key, rows);
  }

  let written = 0;
  const skipped: Array<{ key: string; sample: number; reason: string }> = [];
  for (const [key, rows] of groups.entries()) {
    if (rows.length < 3) { skipped.push({ key, sample: rows.length, reason: "minimum_sample_3" }); continue; }
    const [dimension, primaryMetric] = key.split("::");
    const lifts = rows.map((r) => Number(r.lift)).filter(Number.isFinite);
    if (lifts.length < 3) { skipped.push({ key, sample: lifts.length, reason: "insufficient_numeric_lift" }); continue; }
    const avgLift = lifts.reduce((a,b) => a+b, 0) / lifts.length;
    const positives = rows.filter((r) => r.result === "positive").length;
    const negatives = rows.filter((r) => r.result === "negative").length;
    const verdict = avgLift > 0.1 && positives >= negatives ? "promising" : avgLift < -0.1 && negatives > positives ? "avoid" : "mixed";
    const finding = verdict === "promising"
      ? `${dimension} has shown positive average lift across ${rows.length} measured experiments.`
      : verdict === "avoid"
        ? `${dimension} has shown negative average lift across ${rows.length} measured experiments.`
        : `${dimension} has mixed measured outcomes; do not generalize yet.`;
    const payload = {
      scope: "global",
      dimension,
      value: primaryMetric,
      sample: rows.length,
      avg_royalties: null,
      avg_units: null,
      avg_roas: null,
      lift: avgLift,
      evidence_level: rows.length >= 8 ? "strong" : "moderate",
      verdict,
      finding,
      evidence: { experiment_ids: rows.map((r) => r.id), positives, negatives, primary_metric: primaryMetric },
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: readError } = await supabase.from("book_growth_learning_rules").select("id").eq("scope", "global").eq("dimension", dimension).eq("value", primaryMetric).maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    const write = existing
      ? await supabase.from("book_growth_learning_rules").update(payload).eq("id", existing.id)
      : await supabase.from("book_growth_learning_rules").insert(payload);
    if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });
    written += 1;
  }

  return NextResponse.json({ ok: true, evaluatedWithModerateEvidence: (experiments ?? []).length, rulesWritten: written, skipped, note: "Learning rules require at least 3 moderate/strong evaluated experiments for the same dimension and metric." });
}
