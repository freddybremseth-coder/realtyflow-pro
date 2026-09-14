export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { buildViewingCoachPlan } from "@/lib/nexus/viewing-coach";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-viewing-coach";
const ACTOR = "Nexus Viewing Coach";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

async function resolveViewingPropertyContext(supabase: any, contactId: string) {
  const work = await supabase
    .from("work_items")
    .select("metadata,updated_at")
    .eq("source_type", "crm")
    .eq("metadata->>contact_id", contactId)
    .eq("metadata->>classification", "viewing_request")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (work.error) return null;

  for (const row of work.data || []) {
    const metadata = record(row.metadata);
    const signals = Array.isArray(metadata.property_feedback_signals) ? metadata.property_feedback_signals : [];
    const signal = signals.map(record).find((item) => text(item.sentiment).toLowerCase() === "viewing");
    if (!signal) continue;
    return {
      propertyId: text(signal.propertyId) || null,
      reference: text(signal.reference) || null,
      title: text(signal.title) || null,
      location: text(signal.location) || null,
    };
  }
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const events = await supabase
    .from("revenue_events")
    .select("id,event_type,contact_id,brand_id,description,metadata,occurred_at")
    .eq("event_type", "viewing_completed")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (events.error) return NextResponse.json({ error: events.error.message }, { status: 500 });

  let considered = 0;
  let created = 0;
  let interactionsAdded = 0;
  let rematchPrepared = 0;
  let profileReviewRequired = 0;
  let highIntent = 0;
  let repeated = 0;
  let failed = 0;

  for (const event of events.data || []) {
    const eventId = text(event.id);
    const contactId = text(event.contact_id);
    const brandId = text(event.brand_id);
    if (!eventId || !contactId || !brandId) continue;
    considered += 1;

    try {
      const sourceId = `${eventId}:viewing-coach`;
      const existing = await supabase
        .from("work_items")
        .select("id")
        .eq("source_type", "crm")
        .eq("source_id", sourceId)
        .limit(1)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data?.id) {
        repeated += 1;
        continue;
      }

      const contactResult = await supabase
        .from("contacts")
        .select("id,name,interactions,property_interest")
        .eq("id", contactId)
        .limit(1)
        .maybeSingle();
      if (contactResult.error) throw new Error(contactResult.error.message);
      if (!contactResult.data?.id) continue;
      const contact = contactResult.data;

      const profileResult = await supabase
        .from("buyer_profiles")
        .select("id,status")
        .eq("contact_id", contactId)
        .eq("brand", brandId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (profileResult.error) throw new Error(profileResult.error.message);

      const metadata = record(event.metadata);
      const previousViewing = await resolveViewingPropertyContext(supabase, contactId);
      const propertyContext = {
        propertyId: text(metadata.property_id) || previousViewing?.propertyId || null,
        reference: text(metadata.property_reference) || previousViewing?.reference || null,
        title: text(metadata.property_title) || previousViewing?.title || text(metadata.property_interest) || text(contact.property_interest) || null,
        location: text(metadata.property_location) || previousViewing?.location || null,
      };
      const note = text(event.description) || text(metadata.note);
      const plan = buildViewingCoachPlan({
        note,
        propertyId: propertyContext.propertyId,
        propertyReference: propertyContext.reference,
        propertyTitle: propertyContext.title,
        propertyLocation: propertyContext.location,
      });

      const profileId = text(profileResult.data?.id) || null;
      const profileStatus = text(profileResult.data?.status).toUpperCase() || null;
      const approvedProfile = Boolean(profileId && profileStatus === "APPROVED");
      const safeProfileStatus = plan.requiresBuyerProfileReview ? "REVIEW_REQUIRED" : profileStatus;
      const canRematch = plan.shouldRematch && approvedProfile && !plan.requiresBuyerProfileReview;
      const classification = plan.requiresBuyerProfileReview
        ? "update_preferences"
        : canRematch
          ? "property_interest"
          : "viewing_feedback";

      const interactionId = `viewing-coach-${eventId}`;
      const existingInteractions = Array.isArray(contact.interactions) ? contact.interactions : [];
      const alreadyRecorded = existingInteractions.some((item: any) => text(item?.id) === interactionId);
      if (plan.tasteSignal && !alreadyRecorded) {
        const interaction = {
          id: interactionId,
          type: "property_feedback",
          content: note ? `Visningsfeedback: ${note.slice(0, 1000)}` : "Bekreftet fullført visning uten detaljert feedback.",
          date: event.occurred_at || new Date().toISOString(),
          direction: "in",
          brand_id: brandId,
          metadata: {
            source: "nexus-viewing-coach",
            performed_by: ACTOR,
            actor_type: "automation",
            viewing_completed_event_id: eventId,
            signals: [plan.tasteSignal],
            requires_buyer_profile_review: plan.requiresBuyerProfileReview,
            should_rematch: canRematch,
            secondary_ranking_only: true,
          },
        };
        const contactUpdate = await supabase
          .from("contacts")
          .update({ interactions: [interaction, ...existingInteractions].slice(0, 250), updated_at: new Date().toISOString() })
          .eq("id", contactId);
        if (contactUpdate.error) throw new Error(contactUpdate.error.message);
        interactionsAdded += 1;
      }

      let nextAction = plan.nextAction;
      if (plan.shouldRematch && !approvedProfile && !plan.requiresBuyerProfileReview) {
        nextAction = "Visningsfeedbacken tilsier ny matching, men kunden mangler en godkjent Buyer Profile. Gjennomgå og godkjenn Buyer Profile før Nexus reranker nye boliger.";
      }

      const now = new Date().toISOString();
      const insert = await supabase.from("work_items").insert({
        title: plan.highIntent
          ? `HOT LEAD etter visning: ${contact.name || "kunde"}`
          : `Visningsfeedback: ${contact.name || "kunde"}`,
        description: note || "Visning fullført uten detaljert kundefeedback.",
        status: "REVIEW",
        priority: plan.highIntent || plan.requiresBuyerProfileReview ? "HIGH" : "MEDIUM",
        due_date: now.slice(0, 10),
        brand_id: brandId,
        source_type: "crm",
        source_id: sourceId,
        assigned_agent: "sales",
        next_action: nextAction,
        ai_score: plan.highIntent ? 96 : plan.requiresBuyerProfileReview ? 90 : canRematch ? 84 : plan.sentiment === "positive" ? 78 : 65,
        metadata: {
          event_type: "viewing_completed",
          classification,
          contact_id: contactId,
          buyer_profile_id: profileId,
          buyer_profile_status: safeProfileStatus,
          buyer_profile_revision_required: plan.requiresBuyerProfileReview,
          viewing_coach_review_required: true,
          viewing_coach_version: plan.version,
          viewing_coach_sentiment: plan.sentiment,
          viewing_coach_reasons: plan.reasons,
          viewing_coach_explicit_criteria: plan.explicitCriteriaEvidence,
          viewing_coach_high_intent: plan.highIntent,
          viewing_coach_should_rematch: canRematch,
          viewing_coach_note: note || null,
          viewing_coach_property: propertyContext,
          viewing_coach_safety: plan.safety,
          viewing_completed_event_id: eventId,
          property_match_prepared_at: canRematch ? null : now,
          customer_send: false,
          pipeline_mutated: false,
          criteria_mutated: false,
        },
        created_at: now,
        updated_at: now,
      });
      if (insert.error) throw new Error(insert.error.message);

      created += 1;
      if (canRematch) rematchPrepared += 1;
      if (plan.requiresBuyerProfileReview) profileReviewRequired += 1;
      if (plan.highIntent) highIntent += 1;
    } catch (error) {
      failed += 1;
      console.warn("[nexus-viewing-coach] failed", {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_viewing_coach",
    agent_name: "nexus_viewing_coach",
    status: failed ? (created ? "partial" : "failed") : "success",
    details: {
      considered,
      created,
      interactions_added: interactionsAdded,
      rematch_prepared: rematchPrepared,
      profile_review_required: profileReviewRequired,
      high_intent: highIntent,
      repeated,
      failed,
      runtime_control: `cron:${PATH}`,
      buyer_profile_auto_mutation: false,
      pipeline_auto_mutation: false,
      customer_send: false,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    success: true,
    considered,
    created,
    interactionsAdded,
    rematchPrepared,
    profileReviewRequired,
    highIntent,
    repeated,
    failed,
    safety: {
      buyerProfileAutoMutation: false,
      pipelineAutoMutation: false,
      customerSend: false,
      secondaryRankingOnly: true,
    },
  });
}
