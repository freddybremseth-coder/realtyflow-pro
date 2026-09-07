import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { assessPipelineMovement } from "@/lib/nexus-pipeline-movement";

export const dynamic = "force-dynamic";

const KNOWN_PIPELINE_STATUSES = new Set(["NEW","CONTACT","QUALIFIED","MATCHING","VIEWING","NEGOTIATION","RESERVED","ON_HOLD","LOST","WON"]);
const OUTCOME_WINDOW_DAYS = 14;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

function daysSince(value: unknown) {
  if (!value) return null;
  const ms = Date.now() - new Date(String(value)).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

function timestamp(value: unknown) {
  const valueMs = new Date(String(value || "")).getTime();
  return Number.isFinite(valueMs) ? valueMs : null;
}

function learningKey(cause: unknown, action: unknown, targetStage: unknown) {
  return `${String(cause || "")}|${String(action || "")}|${String(targetStage || "").toUpperCase()}`;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [contactsR, inboundR, workR, recommendationsR, transitionsR] = await Promise.all([
    supabase.from("contacts").select("id,name,email,phone,brand_id,brand,pipeline_status,pipeline_value,updated_at,created_at,last_contact,last_inbound_reply_at,next_followup,waiting_on,waiting_reason,waiting_until,property_interest,nurture_status,nurture_sequence,interactions,email_suppressed,do_not_contact,lost_reason").order("updated_at", { ascending: false }).limit(3000),
    supabase.from("email_messages").select("id,crm_contact_id,crm_reply_classification,received_at,created_at").eq("direction", "inbound").eq("is_archived", false).gte("received_at", since24).limit(1000),
    supabase.from("work_items").select("id,status,priority,source_type,metadata,created_at,updated_at").gte("updated_at", since7d).limit(2000),
    supabase.from("revenue_events").select("id,contact_id,occurred_at,created_at,metadata").eq("event_type", "automation_recommended").eq("source_system", "nexus_movement").eq("source_type", "pipeline_movement_recommendation").gte("occurred_at", since90d).limit(10000),
    supabase.from("revenue_events").select("id,contact_id,occurred_at,created_at,metadata").eq("event_type", "contact_updated").eq("source_system", "crm_pipeline").eq("source_type", "pipeline_stage_changed").gte("occurred_at", since90d).limit(10000),
  ]);
  for (const result of [contactsR, inboundR, workR]) if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const contacts = contactsR.data || [];
  const inbound = inboundR.data || [];
  const openWorkByContact = new Map<string, number>();
  for (const item of (workR.data || []) as any[]) {
    const cid = String(item?.metadata?.contact_id || item?.metadata?.contactId || "");
    if (!cid || ["DONE","COMPLETED","CANCELLED"].includes(String(item.status || "").toUpperCase())) continue;
    openWorkByContact.set(cid, (openWorkByContact.get(cid) || 0) + 1);
  }

  const learningByKey = new Map<string, { recommendations: number; hits: number; totalHours: number }>();
  if (!recommendationsR.error && !transitionsR.error) {
    const transitionsByContact = new Map<string, any[]>();
    for (const transition of transitionsR.data || []) {
      const contactId = String((transition as any).contact_id || "");
      if (!contactId) continue;
      const bucket = transitionsByContact.get(contactId) || [];
      bucket.push(transition);
      transitionsByContact.set(contactId, bucket);
    }
    for (const recommendation of recommendationsR.data || []) {
      const metadata = (recommendation as any)?.metadata && typeof (recommendation as any).metadata === "object" ? (recommendation as any).metadata : {};
      const targetStage = String(metadata.target_stage || "").toUpperCase();
      if (!targetStage) continue;
      const cause = String(metadata.cause || "unknown");
      const action = String(metadata.action || "Ukjent anbefaling");
      const recommendationAt = timestamp((recommendation as any).occurred_at || (recommendation as any).created_at);
      if (recommendationAt == null) continue;
      const windowEnd = recommendationAt + OUTCOME_WINDOW_DAYS * 86_400_000;
      const hitTransition = (transitionsByContact.get(String((recommendation as any).contact_id || "")) || []).find((transition) => {
        const at = timestamp(transition.occurred_at || transition.created_at);
        return at != null && at > recommendationAt && at <= windowEnd && String(transition?.metadata?.next_status || "").toUpperCase() === targetStage;
      });
      const key = learningKey(cause, action, targetStage);
      const group = learningByKey.get(key) || { recommendations: 0, hits: 0, totalHours: 0 };
      group.recommendations += 1;
      if (hitTransition) {
        const hitAt = timestamp(hitTransition.occurred_at || hitTransition.created_at);
        group.hits += 1;
        if (hitAt != null) group.totalHours += Math.max(0, (hitAt - recommendationAt) / 3_600_000);
      }
      learningByKey.set(key, group);
    }
  }

  const movement = contacts.map((contact: any) => {
    const activityAt = contact.last_inbound_reply_at || contact.last_contact || contact.updated_at;
    const staleDays = daysSince(activityAt);
    const intelligence = assessPipelineMovement(contact);
    const learningGroup = intelligence?.targetStage
      ? learningByKey.get(learningKey(intelligence.cause, intelligence.action, intelligence.targetStage))
      : undefined;
    const learning = learningGroup && learningGroup.recommendations > 0 ? {
      samples: learningGroup.recommendations,
      hits: learningGroup.hits,
      hitRate: Math.round((learningGroup.hits / learningGroup.recommendations) * 1000) / 10,
      avgHoursToTarget: learningGroup.hits > 0 ? Math.round((learningGroup.totalHours / learningGroup.hits) * 10) / 10 : null,
      outcomeWindowDays: OUTCOME_WINDOW_DAYS,
    } : null;
    return {
      id: contact.id,
      name: contact.name || contact.email || "Ukjent kunde",
      email: contact.email,
      brand: contact.brand_id || contact.brand,
      pipelineStatus: contact.pipeline_status || "NEW",
      pipelineValue: Number(contact.pipeline_value || 0),
      activityAt,
      staleDays,
      openWork: openWorkByContact.get(String(contact.id)) || 0,
      movement: intelligence,
      nextMove: intelligence ? {
        action: intelligence.action,
        reason: intelligence.reason,
        href: intelligence.href,
        targetStage: intelligence.targetStage,
        score: intelligence.score,
        priority: intelligence.priority,
        cause: intelligence.cause,
        causeLabel: intelligence.causeLabel,
        reactivationSegment: intelligence.reactivationSegment,
        reactivationScore: intelligence.reactivationScore,
        learning,
      } : null,
    };
  });

  const active = movement.filter((row: any) => !["LOST","WON"].includes(String(row.pipelineStatus).toUpperCase()));
  const stalled = active
    .filter((row: any) => row.movement?.needsAction)
    .sort((a: any,b: any) => Number(b.movement?.score || 0) - Number(a.movement?.score || 0) || Number(b.pipelineValue || 0) - Number(a.pipelineValue || 0));
  const plannedWaiting = active.filter((row: any) => row.movement?.cause === "waiting_planned");
  const stages = active.reduce<Record<string, number>>((acc, row: any) => {
    const key = String(row.pipelineStatus || "NEW").toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const unknownStages = Object.fromEntries(Object.entries(stages).filter(([stage]) => !KNOWN_PIPELINE_STATUSES.has(stage)));
  const causes = stalled.reduce<Record<string, number>>((acc, row: any) => {
    const key = String(row.movement?.cause || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const targetStages = stalled.reduce<Record<string, number>>((acc, row: any) => {
    const key = String(row.movement?.targetStage || "NO_TARGET");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    movementVersion: 2,
    learning: {
      active: learningByKey.size > 0,
      recommendationGroups: learningByKey.size,
      outcomeWindowDays: OUTCOME_WINDOW_DAYS,
      note: "Historisk learning er kun beslutningsstøtte. Den endrer ikke Movement Score eller utfører handlinger automatisk.",
    },
    summary: {
      activePipeline: active.length,
      inboundReplies24h: inbound.filter((row: any) => row.crm_contact_id && ["active_reply","purchased","unsubscribe","informational"].includes(String(row.crm_reply_classification || ""))).length,
      needsMovement: stalled.length,
      plannedWaiting: plannedWaiting.length,
      noActivity7d: active.filter((row: any) => Number(row.staleDays || 0) >= 7 && row.movement?.cause !== "waiting_planned").length,
      openWork: Array.from(openWorkByContact.values()).reduce((a,b) => a+b, 0),
      unknownPipelineStatus: Object.values(unknownStages).reduce((sum, count) => sum + Number(count || 0), 0),
      highPriorityMovement: stalled.filter((row: any) => ["CRITICAL","HIGH"].includes(String(row.movement?.priority || ""))).length,
      dormantReactivation: stalled.filter((row: any) => row.movement?.cause === "dormant_reactivation").length,
    },
    stages,
    causes,
    targetStages,
    unknownStages,
    stalled: stalled.slice(0, 60),
    plannedWaiting: plannedWaiting.slice(0, 40),
    recentlyMoved: movement.filter((row: any) => Number(row.staleDays ?? 99) <= 1).slice(0, 40),
    note: "Movement Intelligence kombinerer lifecycle-prioritet, planlagt venting og dormant reaktivering. Den foreslår neste steg og målstatus, men utfører ingen kundekontakt eller pipeline-endring automatisk.",
  });
}
