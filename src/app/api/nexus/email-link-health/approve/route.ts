import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { validateEmailLinkApproval } from "@/lib/crm/email-link-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const messageId = String(body?.messageId || "").trim();
  const contactId = String(body?.contactId || "").trim();
  if (!messageId || !contactId) {
    return NextResponse.json({ error: "messageId og contactId er påkrevd" }, { status: 400 });
  }

  const [messageResult, contactsResult] = await Promise.all([
    supabase
      .from("email_messages")
      .select("id,brand_id,direction,from_address,to_addresses,subject,ai_intent,received_at,created_at,matched_lead_id,matched_customer_id")
      .eq("id", messageId)
      .maybeSingle(),
    supabase.from("contacts").select("id,name,email,brand_id,brand").limit(2000),
  ]);

  if (messageResult.error) return NextResponse.json({ error: messageResult.error.message }, { status: 500 });
  if (!messageResult.data) return NextResponse.json({ error: "E-postmeldingen finnes ikke" }, { status: 404 });
  if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });

  const validation = validateEmailLinkApproval(messageResult.data, contactsResult.data || [], contactId);
  if (!validation.ok) {
    return NextResponse.json({
      error: validation.reason,
      assessment: {
        state: validation.assessment.state,
        confidence: validation.assessment.confidence,
        contactIds: validation.assessment.contactIds,
        reason: validation.assessment.reason,
      },
    }, { status: 409 });
  }

  if (validation.idempotent) {
    return NextResponse.json({
      ok: true,
      alreadyLinked: true,
      messageId,
      contactId,
      reason: validation.reason,
    });
  }

  const updateResult = await supabase
    .from("email_messages")
    .update({ matched_lead_id: contactId })
    .eq("id", messageId)
    .is("matched_lead_id", null)
    .is("matched_customer_id", null)
    .select("id,matched_lead_id,matched_customer_id")
    .maybeSingle();

  if (updateResult.error) return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
  if (!updateResult.data) {
    return NextResponse.json({
      error: "Koblingen ble ikke skrevet fordi meldingen endret seg etter valideringen. Oppdater siden og prøv på nytt.",
    }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    alreadyLinked: false,
    messageId,
    contactId,
    matchedLeadId: updateResult.data.matched_lead_id,
    matchedCustomerId: updateResult.data.matched_customer_id,
    evidence: validation.reason,
  });
}
