import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function ms(value: unknown) {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") || 30);
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;
  const outcomeWindowDays = 14;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [recommendationsR, transitionsR] = await Promise.all([
    supabase.from("revenue_events")
      .select("id,contact_id,brand_id,occurred_at,created_at,metadata")
      .eq("event_type", "automation_recommended")
      .eq("source_system", "nexus_movement")
      .eq("source_type", "pipeline_movement_recommendation")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(10000),
    supabase.from("revenue_events")
      .select("id,contact_id,occurred_at,created_at,metadata")
      .eq("event_type", "contact_updated")
      .eq("source_system", "crm_pipeline")
      .eq("source_type", "pipeline_stage_changed")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(10000),
  ]);

  if (recommendationsR.error) return NextResponse.json({ error: recommendationsR.error.message }, { status: 500 });
  if (transitionsR.error) return NextResponse.json({ error: transitionsR.error.message }, { status: 500 });

  const transitionsByContact = new Map<string, any[]>();
  for (const transition of transitionsR.data || []) {
    const contactId = String((transition as any).contact_id || "");
    if (!contactId) continue;
    const bucket = transitionsByContact.get(contactId) || [];
    bucket.push(transition);
    transitionsByContact.set(contactId, bucket);
  }

  const rows = (recommendationsR.data || []).map((recommendation: any) => {
    const metadata = recommendation?.metadata && typeof recommendation.metadata === "object" ? recommendation.metadata : {};
    const targetStage = String(metadata.target_stage || "").toUpperCase() || null;
    const cause = String(metadata.cause || "unknown");
    const action = String(metadata.action || "Ukjent anbefaling");
    const currentStage = String(metadata.current_stage || "").toUpperCase() || null;
    const recommendationAt = ms(recommendation.occurred_at || recommendation.created_at);
    const windowEnd = recommendationAt == null ? null : recommendationAt + outcomeWindowDays * 86_400_000;
    const laterTransitions = (transitionsByContact.get(String(recommendation.contact_id || "")) || []).filter((transition) => {
      const at = ms(transition.occurred_at || transition.created_at);
      return recommendationAt != null && at != null && at > recommendationAt && windowEnd != null && at <= windowEnd;
    });
    const hitTransition = targetStage
      ? laterTransitions.find((transition) => String(transition?.metadata?.next_status || "").toUpperCase() === targetStage)
      : null;
    const hitAt = hitTransition ? ms(hitTransition.occurred_at || hitTransition.created_at) : null;
    const hoursToTarget = recommendationAt != null && hitAt != null
      ? Math.round(((hitAt - recommendationAt) / 3_600_000) * 10) / 10
      : null;

    return {
      id: recommendation.id,
      contactId: recommendation.contact_id,
      brandId: recommendation.brand_id,
      recommendationAt: recommendation.occurred_at || recommendation.created_at,
      cause,
      action,
      currentStage,
      targetStage,
      movementScore: Number(metadata.movement_score || 0),
      measurable: Boolean(targetStage),
      hit: Boolean(hitTransition),
      hoursToTarget,
    };
  });

  const measurable = rows.filter((row) => row.measurable);
  const hitRows = measurable.filter((row) => row.hit);
  const avgHoursToTarget = hitRows.length
    ? Math.round((hitRows.reduce((sum, row) => sum + Number(row.hoursToTarget || 0), 0) / hitRows.length) * 10) / 10
    : null;

  const grouped = new Map<string, { cause: string; action: string; targetStage: string | null; recommendations: number; hits: number; totalHours: number }>();
  for (const row of measurable) {
    const key = `${row.cause}|${row.action}|${row.targetStage || ""}`;
    const group = grouped.get(key) || { cause: row.cause, action: row.action, targetStage: row.targetStage, recommendations: 0, hits: 0, totalHours: 0 };
    group.recommendations += 1;
    if (row.hit) {
      group.hits += 1;
      group.totalHours += Number(row.hoursToTarget || 0);
    }
    grouped.set(key, group);
  }

  const byRecommendation = Array.from(grouped.values()).map((group) => ({
    cause: group.cause,
    action: group.action,
    targetStage: group.targetStage,
    recommendations: group.recommendations,
    hits: group.hits,
    hitRate: group.recommendations > 0 ? Math.round((group.hits / group.recommendations) * 1000) / 10 : null,
    avgHoursToTarget: group.hits > 0 ? Math.round((group.totalHours / group.hits) * 10) / 10 : null,
  })).sort((a, b) => b.recommendations - a.recommendations || b.hits - a.hits);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    windowDays: days,
    outcomeWindowDays,
    totals: {
      recommendations: rows.length,
      measurable: measurable.length,
      hits: hitRows.length,
      hitRate: measurable.length > 0 ? Math.round((hitRows.length / measurable.length) * 1000) / 10 : null,
      avgHoursToTarget,
    },
    byRecommendation,
    note: "Outcome Learning måler korrelasjon mellom daglig lagret Movement-anbefaling og senere eksplisitt pipeline-overgang til anbefalt målstadium innen 14 dager. Dette endrer ikke scoring eller sender noe automatisk.",
  });
}
