export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import { buildLeadCustomerPresentationPreview } from "@/services/lead-intelligence/presentation-preview";
import { analyzePropertyRecommendationReply } from "@/services/email/property-recommendation-reply";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-property-feedback";
const ACTOR = "Nexus Property Feedback";
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown) { return String(value || "").trim(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

async function recordPropertyFeedbackRevenueEvents(supabase: any, input: {
  emailMessageId: string;
  brandId: string;
  contactId: string;
  presentationId: string;
  receivedAt: string | null;
  analysis: ReturnType<typeof analyzePropertyRecommendationReply>;
}) {
  let recorded = 0;
  for (const signal of input.analysis.signals) {
    if (signal.sentiment === "question") continue;
    const interested = signal.sentiment === "positive" || signal.sentiment === "viewing";
    const eventType = interested ? "property_interested" : "property_not_for_me";
    const propertyKey = signal.propertyId || signal.reference || `${signal.ordinal}-${signal.title}`;
    const result = await insertRevenueEvent(supabase, {
      eventType,
      title: interested ? "Bolig markert interessant i e-postsvar" : "Bolig markert ikke for meg i e-postsvar",
      description: signal.evidence.slice(0, 800),
      contactId: input.contactId,
      brandId: input.brandId,
      sourceSystem: "nexus_property_feedback",
      sourceType: "property_feedback",
      sourceId: propertyKey,
      actorType: "customer",
      confidenceScore: Math.round(Math.max(0, Math.min(1, signal.confidence)) * 100),
      occurredAt: input.receivedAt || new Date().toISOString(),
      dedupeKey: buildRevenueEventDedupeKey([
        "nexus_property_feedback",
        input.emailMessageId,
        propertyKey,
        eventType,
      ]),
      metadata: {
        property_id: signal.propertyId,
        property_reference: signal.reference,
        property_title: signal.title,
        property_location: signal.location,
        property_ordinal: signal.ordinal,
        sentiment: signal.sentiment,
        reasons: signal.reasons,
        presentation_id: input.presentationId,
        email_message_id: input.emailMessageId,
        channel: "email",
      },
      createdBy: "cron/nexus-property-feedback",
    });
    if (result.ok) recorded += 1;
    else if (!result.tableNotReady) {
      console.warn("[nexus-property-feedback] revenue event failed", {
        emailMessageId: input.emailMessageId,
        propertyKey,
        eventType,
        error: result.error,
      });
    }
  }
  return recorded;
}

async function ensureFeedbackWorkItem(supabase: any, input: {
  emailMessageId: string;
  brandId: string;
  contactId: string;
  customerName: string | null;
  buyerProfileId: string | null;
  buyerProfileStatus: string | null;
  analysis: ReturnType<typeof analyzePropertyRecommendationReply>;
  presentationId: string;
}) {
  const sourceId = `${input.emailMessageId}:property-feedback`;
  const existing = await supabase.from("work_items")
    .select("id")
    .eq("source_type", "crm")
    .eq("source_id", sourceId)
    .in("status", OPEN_STATUSES)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) return false;

  const viewing = input.analysis.signals.some((signal) => signal.sentiment === "viewing");
  const positive = input.analysis.signals.filter((signal) => signal.sentiment === "positive");
  const now = new Date().toISOString();
  const profileNeedsReview = input.analysis.requiresBuyerProfileReview;
  const classification = viewing ? "viewing_request" : profileNeedsReview ? "update_preferences" : "property_interest";
  const safeProfileStatus = profileNeedsReview ? "REVIEW_REQUIRED" : input.buyerProfileStatus;
  const nextAction = viewing
    ? "Kunden ønsker visning på en konkret bolig. Verifiser tilgjengelighet og avtal visning raskt."
    : profileNeedsReview
      ? "Kunden har gitt boligspesifikk feedback som kan endre søkekriteriene. Kontroller Buyer Profile før ny matching; ikke gjett eller endre kriterier automatisk."
      : positive.length
        ? "Kunden har markert én eller flere boliger som interessante. Følg opp de aktuelle boligene raskt og bruk feedbacken i neste anbefaling."
        : "Kunden har gitt konkret feedback på boligforslag. Følg opp og bruk signalene i videre matching.";

  const insert = await supabase.from("work_items").insert({
    title: viewing
      ? `HOT LEAD: visningsønske fra ${input.customerName || "kunde"}`
      : `Boligfeedback fra ${input.customerName || "kunde"}`,
    description: input.analysis.latestReply.slice(0, 1600),
    status: profileNeedsReview ? "REVIEW" : "TO_DO",
    priority: viewing || positive.length ? "HIGH" : "MEDIUM",
    due_date: now.slice(0, 10),
    brand_id: input.brandId,
    source_type: "crm",
    source_id: sourceId,
    assigned_agent: "sales",
    next_action: nextAction,
    ai_score: viewing ? 96 : positive.length ? 88 : 78,
    metadata: {
      event_type: "property_recommendation_feedback",
      email_message_id: input.emailMessageId,
      contact_id: input.contactId,
      classification,
      buyer_profile_id: input.buyerProfileId,
      buyer_profile_status: safeProfileStatus,
      buyer_profile_revision_required: profileNeedsReview,
      property_feedback_presentation_id: input.presentationId,
      property_feedback_signals: input.analysis.signals,
      property_feedback_explicit_criteria: input.analysis.explicitCriteriaEvidence,
      property_feedback_should_rematch: input.analysis.shouldRematch,
      property_feedback_high_intent: input.analysis.highIntent || viewing,
      property_feedback_processed_by: ACTOR,
      property_feedback_processed_at: now,
      property_match_prepared_at: null,
    },
    created_at: now,
    updated_at: now,
  });
  if (insert.error) throw new Error(insert.error.message);
  return true;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  const inbound = await supabase.from("email_messages")
    .select("id,brand_id,from_address,subject,body_text,received_at,direction")
    .eq("direction", "inbound")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(150);
  if (inbound.error) return NextResponse.json({ error: inbound.error.message }, { status: 500 });

  let considered = 0, analyzed = 0, signaled = 0, workCreated = 0, revenueEventsRecorded = 0, failed = 0;

  for (const message of inbound.data || []) {
    const brandId = text(message.brand_id);
    const fromAddress = text(message.from_address).toLowerCase();
    if (!brandId || !fromAddress) continue;
    considered += 1;
    try {
      const contactResult = await supabase.from("contacts")
        .select("id,name,email,interactions,nurture_status")
        .ilike("email", fromAddress)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contactResult.error || !contactResult.data?.id) continue;
      const contact = contactResult.data;

      const receipt = await supabase.from("nexus_property_recommendation_send_receipts")
        .select("id,presentation_id,sent_at,status")
        .eq("contact_id", contact.id)
        .eq("brand", brandId)
        .eq("status", "sent")
        .lte("sent_at", message.received_at || new Date().toISOString())
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (receipt.error || !receipt.data?.presentation_id) continue;
      const sentAt = receipt.data.sent_at ? new Date(receipt.data.sent_at).getTime() : 0;
      if (!sentAt || Date.now() - sentAt > 30 * 24 * 60 * 60 * 1000) continue;

      const presentation = await supabase.from("lead_customer_presentations")
        .select("id,presentation_json")
        .eq("id", receipt.data.presentation_id)
        .eq("brand", brandId)
        .maybeSingle();
      if (presentation.error || !presentation.data) continue;
      const preview = buildLeadCustomerPresentationPreview(presentation.data.presentation_json);
      if (!preview.properties.length) continue;

      analyzed += 1;
      const analysis = analyzePropertyRecommendationReply({
        body: message.body_text,
        subject: message.subject,
        properties: preview.properties,
      });
      if (!analysis.signals.length && !analysis.explicitCriteriaEvidence.length) continue;
      signaled += 1;

      const profile = await supabase.from("buyer_profiles")
        .select("id,status")
        .eq("contact_id", contact.id)
        .eq("brand", brandId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (profile.error) throw new Error(profile.error.message);

      const interactionId = `property-feedback-${message.id}`;
      const existingInteractions = Array.isArray(contact.interactions) ? contact.interactions : [];
      const interaction = {
        id: interactionId,
        type: "property_feedback",
        content: [
          `Kundefeedback på boligforslag: ${analysis.latestReply.slice(0, 800)}`,
          ...analysis.signals.map((signal) => `#${signal.ordinal} ${signal.reference || signal.title}: ${signal.sentiment}${signal.reasons.length ? ` (${signal.reasons.join(", ")})` : ""}`),
          analysis.explicitCriteriaEvidence.length ? `Eksplisitte kriteriesignaler: ${analysis.explicitCriteriaEvidence.join(" | ")}` : "",
        ].filter(Boolean).join("\n"),
        date: new Date().toISOString(),
        direction: "in",
        brand_id: brandId,
        metadata: {
          source: "nexus-property-feedback",
          performed_by: ACTOR,
          actor_type: "automation",
          email_message_id: message.id,
          presentation_id: presentation.data.id,
          signals: analysis.signals,
          requires_buyer_profile_review: analysis.requiresBuyerProfileReview,
          should_rematch: analysis.shouldRematch,
        },
      };
      const deduped = existingInteractions.filter((item: any) => text(item?.id) !== interactionId);
      const contactUpdate = await supabase.from("contacts").update({
        interactions: [interaction, ...deduped].slice(0, 250),
        nurture_status: "paused",
        last_inbound_reply_at: message.received_at || new Date().toISOString(),
        last_reply_classification: analysis.signals.some((signal) => signal.sentiment === "viewing") ? "viewing_request" : "property_interest",
        updated_at: new Date().toISOString(),
      }).eq("id", contact.id);
      if (contactUpdate.error) throw new Error(contactUpdate.error.message);

      revenueEventsRecorded += await recordPropertyFeedbackRevenueEvents(supabase, {
        emailMessageId: String(message.id),
        brandId,
        contactId: String(contact.id),
        presentationId: String(presentation.data.id),
        receivedAt: message.received_at ? String(message.received_at) : null,
        analysis,
      });

      const created = await ensureFeedbackWorkItem(supabase, {
        emailMessageId: String(message.id),
        brandId,
        contactId: String(contact.id),
        customerName: contact.name || null,
        buyerProfileId: profile.data?.id ? String(profile.data.id) : null,
        buyerProfileStatus: profile.data?.status ? String(profile.data.status).toUpperCase() : null,
        analysis,
        presentationId: String(presentation.data.id),
      });
      if (created) workCreated += 1;
    } catch (error) {
      failed += 1;
      console.warn("[nexus-property-feedback] failed", { messageId: message.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_property_feedback",
    agent_name: "nexus_property_feedback",
    status: failed ? (signaled ? "partial" : "failed") : "success",
    details: { considered, analyzed, signaled, work_created: workCreated, revenue_events_recorded: revenueEventsRecorded, failed, runtime_control: `cron:${PATH}`, buyer_profile_auto_mutation: false },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({ success: true, considered, analyzed, signaled, workCreated, revenueEventsRecorded, failed });
}
