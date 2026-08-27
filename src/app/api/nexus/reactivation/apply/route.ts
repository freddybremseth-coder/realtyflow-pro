import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import { buildReactivationApplyDecision } from "@/lib/nexus-reactivation-apply";
import { classifyReactivationReply } from "@/lib/nexus-reactivation-reply";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function findLatestMatchedReply(supabase: ReturnType<typeof getSupabase>, email: string) {
  if (!supabase) return { event: null, error: "Supabase not configured" };
  const { data, error } = await supabase
    .from("revenue_events")
    .select("id,event_type,title,description,occurred_at,metadata")
    .eq("event_type", "email_received")
    .order("occurred_at", { ascending: false })
    .limit(1000);
  if (error) return { event: null, error: error.message };
  const event = (data || []).find((row) => normalizedEmail(metadataRecord(row.metadata).from_address) === email) || null;
  return { event, error: null };
}

async function ensureBuyerProfileRefreshWorkItem(input: {
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
  contact: { id: string; name?: string | null; brand_id?: string | null; brand?: string | null; pipeline_status?: string | null };
  revenueEventId: string;
  replyOccurredAt: string;
  replyPreview: string;
}) {
  const sourceId = `reactivation-reply:${input.revenueEventId}`;
  const existing = await input.supabase
    .from("work_items")
    .select("id")
    .eq("source_type", "ai_agent")
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) return { id: String(existing.data.id), created: false };

  const titleName = String(input.contact.name || "kjøper").trim();
  const inserted = await input.supabase
    .from("work_items")
    .insert({
      title: `Oppdater Buyer Profile etter reaktivering: ${titleName}`,
      description: "Kunden har svart at interessen fortsatt er aktuell, men behovene har endret seg. Oppdater Buyer Intelligence fra dokumenterte svar før ny property matching.",
      status: "todo",
      priority: "high",
      brand_id: input.contact.brand_id || input.contact.brand || null,
      source_type: "ai_agent",
      source_id: sourceId,
      assigned_agent: "nexus_buyer_intelligence",
      next_action: "Bekreft nye område-, budsjett- og livsstilspreferanser, lag ny Buyer Profile-versjon og kjør deretter matching.",
      ai_score: 90,
      metadata: {
        contact_id: input.contact.id,
        revenue_event_id: input.revenueEventId,
        reply_occurred_at: input.replyOccurredAt,
        previous_pipeline_status: input.contact.pipeline_status || null,
        reply_preview: input.replyPreview.slice(0, 500),
        external_action_executed: false,
        buyer_profile_criteria_changed: false,
      },
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id) throw new Error(inserted.error?.message || "Could not create Buyer Profile refresh work item");
  return { id: String(inserted.data.id), created: true };
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const contactId = typeof body?.contactId === "string" ? body.contactId.trim() : "";
  if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const contactResult = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,nurture_status,last_contact")
    .eq("id", contactId)
    .maybeSingle();
  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  if (!contactResult.data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const contact = contactResult.data;
  const email = normalizedEmail(contact.email);
  if (!email) return NextResponse.json({ error: "Contact has no valid CRM email" }, { status: 409 });

  const matched = await findLatestMatchedReply(supabase, email);
  if (matched.error) return NextResponse.json({ error: matched.error }, { status: 500 });
  if (!matched.event) return NextResponse.json({ error: "No inbound email exactly matching the CRM contact email" }, { status: 409 });

  const metadata = metadataRecord(matched.event.metadata);
  const subject = String(metadata.subject || matched.event.title || "");
  const replyPreview = String(metadata.body_preview || matched.event.description || "");
  const classification = classifyReactivationReply({ subject, body: replyPreview });
  const replyOccurredAt = String(matched.event.occurred_at || new Date().toISOString());
  const decision = buildReactivationApplyDecision({
    classification,
    currentPipelineStatus: contact.pipeline_status,
    replyOccurredAt,
  });

  if (!decision.allowed) {
    return NextResponse.json({
      error: "Reply is not eligible for automatic reactivation write in v1",
      classification,
      decision,
      safety: { crmUpdated: false, buyerProfileUpdated: false, externalActionExecuted: false },
    }, { status: 409 });
  }

  const updated = await supabase
    .from("contacts")
    .update(decision.contactUpdates)
    .eq("id", contactId)
    .select("id,pipeline_status,nurture_status,last_contact")
    .single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });

  let workItem: { id: string; created: boolean } | null = null;
  if (decision.createBuyerProfileRefreshWorkItem) {
    try {
      workItem = await ensureBuyerProfileRefreshWorkItem({
        supabase,
        contact: {
          id: String(contact.id),
          name: contact.name,
          brand_id: contact.brand_id,
          brand: contact.brand,
          pipeline_status: contact.pipeline_status,
        },
        revenueEventId: String(matched.event.id),
        replyOccurredAt,
        replyPreview,
      });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : "Buyer Profile refresh work item failed",
        contactUpdated: true,
        classification,
      }, { status: 500 });
    }
  }

  const brandId = String(contact.brand_id || contact.brand || "").trim();
  if (brandId) {
    await insertRevenueEvent(supabase, {
      eventType: "reactivation_reply_applied",
      title: classification.intent === "stop" ? "Reaktivering stoppet av kundesvar" : "Dormant lead reaktivert fra kundesvar",
      description: `${classification.intent} · ${decision.reason}`,
      contactId: String(contact.id),
      brandId,
      sourceSystem: "nexus_reactivation",
      sourceType: "email_reply",
      sourceId: String(matched.event.id),
      actorType: "human",
      confidenceScore: Math.round(classification.confidence * 100),
      occurredAt: new Date().toISOString(),
      dedupeKey: buildRevenueEventDedupeKey(["nexus-reactivation-apply", String(contact.id), String(matched.event.id), classification.intent]),
      metadata: {
        inbound_revenue_event_id: matched.event.id,
        intent: classification.intent,
        confidence: classification.confidence,
        previous_pipeline_status: contact.pipeline_status || null,
        next_pipeline_status: updated.data?.pipeline_status || contact.pipeline_status || null,
        nurture_status: updated.data?.nurture_status || null,
        buyer_profile_refresh_work_item_id: workItem?.id || null,
        external_action_executed: false,
      },
      createdBy: "api/nexus/reactivation/apply",
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    matchedReply: {
      revenueEventId: matched.event.id,
      occurredAt: replyOccurredAt,
      fromAddress: email,
      subject,
    },
    classification,
    decision,
    contact: updated.data,
    workItem,
    safety: {
      externalActionExecuted: false,
      emailSent: false,
      buyerProfileCriteriaChanged: false,
      replyReconstructedServerSide: true,
      exactCrmEmailMatchRequired: true,
    },
  });
}
