import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { classifyInboundReply, governInboundReply } from "@/lib/inbound-reply-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function lowerEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const contactId = String(request.nextUrl.searchParams.get("contactId") || "").trim();
  if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const contactResult = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,nurture_status")
    .eq("id", contactId)
    .maybeSingle();

  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  if (!contactResult.data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const email = lowerEmail(contactResult.data.email);
  if (!email) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      contact: { id: contactResult.data.id, name: contactResult.data.name, email: null },
      matchedReply: null,
      classification: null,
      governance: null,
      safety: {
        readOnly: true,
        exactCrmEmailMatchRequired: true,
        externalActionExecuted: false,
      },
    });
  }

  const eventsResult = await supabase
    .from("revenue_events")
    .select("id,event_type,title,description,occurred_at,metadata")
    .eq("event_type", "email_received")
    .order("occurred_at", { ascending: false })
    .limit(1000);

  if (eventsResult.error) return NextResponse.json({ error: eventsResult.error.message }, { status: 500 });

  const matchedReply = (eventsResult.data || []).find((event) => {
    const metadata = metadataRecord(event.metadata);
    return lowerEmail(metadata.from_address) === email;
  }) || null;

  if (!matchedReply) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      contact: {
        id: contactResult.data.id,
        name: contactResult.data.name,
        email,
        pipelineStatus: contactResult.data.pipeline_status,
        nurtureStatus: contactResult.data.nurture_status,
      },
      matchedReply: null,
      classification: null,
      governance: null,
      safety: {
        readOnly: true,
        exactCrmEmailMatchRequired: true,
        externalActionExecuted: false,
      },
    });
  }

  const metadata = metadataRecord(matchedReply.metadata);
  const subject = String(metadata.subject || matchedReply.title || "");
  const bodyPreview = String(metadata.body_preview || matchedReply.description || "");
  const classification = classifyInboundReply({ subject, body: bodyPreview });
  const governance = governInboundReply(classification);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    contact: {
      id: contactResult.data.id,
      name: contactResult.data.name,
      email,
      brandId: contactResult.data.brand_id || contactResult.data.brand,
      pipelineStatus: contactResult.data.pipeline_status,
      nurtureStatus: contactResult.data.nurture_status,
    },
    matchedReply: {
      revenueEventId: matchedReply.id,
      occurredAt: matchedReply.occurred_at,
      fromAddress: lowerEmail(metadata.from_address),
      subject,
      bodyPreview,
    },
    classification,
    governance,
    safety: {
      readOnly: true,
      exactCrmEmailMatchRequired: true,
      externalActionExecuted: false,
      crmUpdated: false,
      pipelineUpdated: false,
      nurtureUpdated: false,
      buyerProfileUpdated: false,
      emailSent: false,
    },
  });
}
