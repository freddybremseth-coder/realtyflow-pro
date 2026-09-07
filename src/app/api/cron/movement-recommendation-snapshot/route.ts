import { NextRequest, NextResponse } from "next/server";
import { requireCronApi } from "@/lib/api-cron";
import { assessPipelineMovement } from "@/lib/nexus-pipeline-movement";
import { insertRevenueEvent, buildRevenueEventDedupeKey } from "@/lib/revenue/events";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function snapshotDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const denied = requireCronApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id,name,email,phone,brand_id,brand,pipeline_status,do_not_contact,email_suppressed,last_inbound_reply_at,last_contact,updated_at,created_at,next_followup,nurture_status,property_interest,waiting_on,waiting_until,preferred_location")
    .limit(5000);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const now = new Date();
  const day = snapshotDate(now);
  let observed = 0;
  let skipped = 0;
  let failed = 0;

  for (const contact of contacts || []) {
    const assessment = assessPipelineMovement(contact as any, now);
    if (!assessment || !assessment.needsAction) {
      skipped += 1;
      continue;
    }

    const currentStage = String((contact as any).pipeline_status || "NEW").toUpperCase();
    const dedupeKey = buildRevenueEventDedupeKey([
      "movement_recommendation",
      day,
      String((contact as any).id || ""),
      assessment.cause,
      assessment.targetStage || "none",
    ]);

    const result = await insertRevenueEvent(supabase, {
      eventType: "automation_recommended",
      title: `Movement recommendation: ${assessment.action}`,
      description: assessment.reason,
      contactId: String((contact as any).id || "") || null,
      brandId: String((contact as any).brand_id || (contact as any).brand || "") || null,
      sourceSystem: "nexus_movement",
      sourceType: "pipeline_movement_recommendation",
      sourceId: day,
      actorType: "system",
      confidenceScore: assessment.score,
      occurredAt: now,
      dedupeKey,
      metadata: {
        snapshot_date: day,
        cause: assessment.cause,
        cause_label: assessment.causeLabel,
        action: assessment.action,
        reason: assessment.reason,
        priority: assessment.priority,
        movement_score: assessment.score,
        current_stage: currentStage,
        target_stage: assessment.targetStage,
        reactivation_segment: assessment.reactivationSegment,
        reactivation_score: assessment.reactivationScore,
      },
    });

    if (result.ok) observed += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: failed === 0,
    generatedAt: now.toISOString(),
    snapshotDate: day,
    observed,
    skipped,
    failed,
  }, { status: failed === 0 ? 200 : 207 });
}
