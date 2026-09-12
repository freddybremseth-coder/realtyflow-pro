export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { extractPropertyRecommendationFeedback } from "@/services/email/property-recommendation-feedback";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-property-feedback-sync";
const ACTOR = "Nexus Property Feedback";
const LOOKBACK_DAYS = 14;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown) { return String(value || "").trim(); }
function normalizedEmail(value: unknown) { return text(value).toLowerCase(); }
function propertyKey(item: { propertyId: string | null; reference: string | null; ordinal: number }) {
  return item.propertyId || item.reference || `ordinal:${item.ordinal}`;
}

async function ensureFeedbackWorkItem(input: {
  supabase: ReturnType<typeof getSupabase>;
  emailMessageId: string;
  contactId: string;
  brandId: string;
  customerName: string | null;
  presentationId: string;
  buyerProfileId: string;
  feedback: ReturnType<typeof extractPropertyRecommendationFeedback>;
}) {
  if (!input.supabase) return false;
  const relevant = input.feedback.propertyFeedback.filter((item) => ["positive", "viewing", "question"].includes(item.sentiment));
  const needsReview = input.feedback.buyerProfileSuggestions.length > 0 || input.feedback.requiresHumanReview;
  if (!relevant.length && !needsReview) return false;

  const sourceId = `${input.emailMessageId}:property-feedback`;
  const existing = await input.supabase.from("work_items").select("id").eq("source_type", "crm").eq("source_id", sourceId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) return false;

  const now = new Date().toISOString();
  const viewing = relevant.filter((item) => item.sentiment === "viewing");
  const positive = relevant.filter((item) => item.sentiment === "positive");
  const questions = relevant.filter((item) => item.sentiment === "question");
  const nextAction = viewing.length
    ? `Kunden ønsker visning/interesse på ${viewing.map((item) => item.reference || `bolig ${item.ordinal}`).join(", ")}. Verifiser tilgjengelighet og foreslå neste steg raskt.`
    : positive.length
      ? `Følg opp interesse på ${positive.map((item) => item.reference || `bolig ${item.ordinal}`).join(", ")}. Prioriter tilsvarende boliger hvis kunden ønsker flere alternativer.`
      : questions.length
        ? `Svar på spørsmål om ${questions.map((item) => item.reference || `bolig ${item.ordinal}`).join(", ")}. Bruk ferske boligdata før svaret sendes.`
        : "Vurder foreslåtte Buyer Profile-endringer fra kundens boligfeedback. Ikke endre kriterier uten klar kundeevidens.";

  const inserted = await input.supabase.from("work_items").insert({
    title: viewing.length ? `HOT LEAD: boligfeedback fra ${input.customerName || "kunde"}` : `Boligfeedback fra ${input.customerName || "kunde"}`,
    description: input.feedback.propertyFeedback.map((item) => `#${item.ordinal} ${item.reference || item.title}: ${item.sentiment} (${item.signals.join(", ")})`).join("\n").slice(0, 1600),
    status: "TO_DO",
    priority: viewing.length ? "CRITICAL" : positive.length || questions.length ? "HIGH" : "MEDIUM",
    due_date: now.slice(0, 10),
    brand_id: input.brandId,
    source_type: "crm",
    source_id: sourceId,
    assigned_agent: "sales",
    next_action: nextAction,
    ai_score: viewing.length ? 98 : positive.length ? 92 : questions.length ? 88 : 72,
    metadata: {
      event_type: "property_recommendation_feedback",
      email_message_id: input.emailMessageId,
      contact_id: input.contactId,
      presentation_id: input.presentationId,
      buyer_profile_id: input.buyerProfileId,
      property_feedback: input.feedback.propertyFeedback,
      buyer_profile_suggestions: input.feedback.buyerProfileSuggestions,
      buyer_profile_changes_auto_applied: false,
      performed_by: ACTOR,
    },
    created_at: now,
    updated_at: now,
  });
  if (inserted.error) throw new Error(inserted.error.message);
  return true;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const inbound = await supabase.from("email_messages")
    .select("id,brand_id,from_address,body_text,received_at,crm_processed_at")
    .eq("direction", "inbound")
    .not("crm_processed_at", "is", null)
    .gte("received_at", cutoff)
    .order("received_at", { ascending: true })
    .limit(250);
  if (inbound.error) return NextResponse.json({ error: inbound.error.message }, { status: 500 });

  let considered = 0, linked = 0, feedbackEvents = 0, workItems = 0, skipped = 0, failed = 0;

  for (const message of inbound.data || []) {
    const emailMessageId = text(message.id);
    const brandId = text(message.brand_id);
    const from = normalizedEmail(message.from_address);
    if (!emailMessageId || !brandId || !from) { skipped += 1; continue; }

    try {
      considered += 1;
      const already = await supabase.from("nexus_property_feedback_events").select("id").eq("email_message_id", emailMessageId).limit(1);
      if (already.error) throw new Error(already.error.message);
      if (already.data?.length) { skipped += 1; continue; }

      const contactResult = await supabase.from("contacts").select("id,name,email,brand,brand_id").ilike("email", from).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (contactResult.error) throw new Error(contactResult.error.message);
      const contact = contactResult.data;
      if (!contact?.id) { skipped += 1; continue; }

      const receiptResult = await supabase.from("nexus_property_recommendation_send_receipts")
        .select("id,brand,presentation_id,buyer_profile_id,contact_id,sent_at,status")
        .eq("contact_id", contact.id)
        .eq("brand", brandId)
        .eq("status", "sent")
        .lte("sent_at", message.received_at)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (receiptResult.error) throw new Error(receiptResult.error.message);
      const receipt = receiptResult.data;
      if (!receipt?.id || !receipt.presentation_id) { skipped += 1; continue; }

      const presentationResult = await supabase.from("lead_customer_presentations")
        .select("id,presentation_json")
        .eq("id", receipt.presentation_id)
        .eq("brand", brandId)
        .maybeSingle();
      if (presentationResult.error) throw new Error(presentationResult.error.message);
      if (!presentationResult.data) { skipped += 1; continue; }
      linked += 1;

      const feedback = extractPropertyRecommendationFeedback({ body: message.body_text, presentationJson: presentationResult.data.presentation_json });
      if (!feedback.propertyFeedback.length) { skipped += 1; continue; }

      for (const item of feedback.propertyFeedback) {
        const insert = await supabase.from("nexus_property_feedback_events").insert({
          brand: brandId,
          email_message_id: emailMessageId,
          contact_id: contact.id,
          send_receipt_id: receipt.id,
          presentation_id: receipt.presentation_id,
          buyer_profile_id: receipt.buyer_profile_id,
          property_key: propertyKey(item),
          property_id: item.propertyId,
          property_reference: item.reference,
          property_ordinal: item.ordinal,
          sentiment: item.sentiment,
          confidence: item.confidence,
          signals: item.signals,
          source_text: item.sourceText.slice(0, 1600),
          buyer_profile_suggestions: feedback.buyerProfileSuggestions,
          requires_human_review: feedback.requiresHumanReview,
        });
        if (insert.error && String(insert.error.code || "") !== "23505") throw new Error(insert.error.message);
        if (!insert.error) feedbackEvents += 1;
      }

      if (await ensureFeedbackWorkItem({ supabase, emailMessageId, contactId: String(contact.id), brandId, customerName: contact.name || null, presentationId: String(receipt.presentation_id), buyerProfileId: String(receipt.buyer_profile_id), feedback })) workItems += 1;
    } catch (error) {
      failed += 1;
      console.warn("[nexus-property-feedback-sync] message failed", { emailMessageId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_property_feedback_sync",
    agent_name: "nexus_property_feedback",
    status: failed ? (feedbackEvents ? "partial" : "failed") : "success",
    details: { considered, linked, feedback_events: feedbackEvents, work_items: workItems, skipped, failed, buyer_profile_changes_auto_applied: false, runtime_control: `cron:${PATH}` },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({ success: true, considered, linked, feedbackEvents, workItems, skipped, failed, buyerProfileChangesAutoApplied: false });
}
