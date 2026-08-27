import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { classifyReactivationReply } from "@/lib/nexus-reactivation-reply";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function lowerEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const contactId = String(request.nextUrl.searchParams.get("contactId") || "").trim();
  if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,nurture_status,last_contact,last_ai_followup")
    .eq("id", contactId)
    .maybeSingle();
  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const email = lowerEmail(contact.email);
  if (!email) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      contact: { id: contact.id, name: contact.name, email: null },
      matchedReply: null,
      classification: null,
      safety: { readOnly: true, exactCrmEmailMatchRequired: true, externalActionExecuted: false },
    });
  }

  const { data: events, error: eventsError } = await supabase
    .from("revenue_events")
    .select("id,event_type,title,description,occurred_at,metadata")
    .eq("event_type", "email_received")
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const match = (events || []).find((event) => {
    const metadata = event.metadata && typeof event.metadata === "object"
      ? (event.metadata as Record<string, unknown>)
      : {};
    return lowerEmail(metadata.from_address) === email;
  }) || null;

  if (!match) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      contact: {
        id: contact.id,
        name: contact.name,
        email,
        pipelineStatus: contact.pipeline_status,
        nurtureStatus: contact.nurture_status,
      },
      matchedReply: null,
      classification: null,
      safety: {
        readOnly: true,
        exactCrmEmailMatchRequired: true,
        externalActionExecuted: false,
        pipelineUpdated: false,
      },
    });
  }

  const metadata = match.metadata && typeof match.metadata === "object"
    ? (match.metadata as Record<string, unknown>)
    : {};
  const subject = String(metadata.subject || match.title || "");
  const bodyPreview = String(metadata.body_preview || match.description || "");
  const classification = classifyReactivationReply({ subject, body: bodyPreview });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    contact: {
      id: contact.id,
      name: contact.name,
      email,
      brandId: contact.brand_id || contact.brand,
      pipelineStatus: contact.pipeline_status,
      nurtureStatus: contact.nurture_status,
    },
    matchedReply: {
      revenueEventId: match.id,
      occurredAt: match.occurred_at,
      subject,
      bodyPreview,
      fromAddress: lowerEmail(metadata.from_address),
    },
    classification,
    proposedAction: classification.suggestedPipelineAction,
    safety: {
      readOnly: true,
      exactCrmEmailMatchRequired: true,
      externalActionExecuted: false,
      pipelineUpdated: false,
      nurtureUpdated: false,
      buyerProfileUpdated: false,
    },
  });
}
