import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildEmailLinkHealth, classifyEmailIdentityEvidence } from "@/lib/crm/email-link-health";
import { filterOwnAddressEmailHealth } from "@/lib/crm/email-link-health-own-addresses";
import { classifyEmailIdentityReviewPriorityWithAge } from "@/lib/crm/email-review-priority";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [contactsResult, messagesResult, ownAddressesResult] = await Promise.all([
    supabase.from("contacts").select("id,name,email,brand_id,brand").order("updated_at", { ascending: false }).limit(2000),
    supabase
      .from("email_messages")
      .select("id,brand_id,direction,from_address,to_addresses,subject,ai_intent,received_at,created_at,matched_lead_id,matched_customer_id")
      .order("received_at", { ascending: false })
      .limit(1000),
    supabase.from("brand_email_configs").select("email_address").eq("is_active", true).limit(500),
  ]);

  if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });
  if (messagesResult.error) return NextResponse.json({ error: messagesResult.error.message }, { status: 500 });
  if (ownAddressesResult.error) return NextResponse.json({ error: ownAddressesResult.error.message }, { status: 500 });

  const contacts = contactsResult.data || [];
  const contactMap = new Map(contacts.map((contact) => [String(contact.id), contact]));
  const baseHealth = buildEmailLinkHealth(messagesResult.data || [], contacts);
  const health = filterOwnAddressEmailHealth(
    baseHealth,
    (ownAddressesResult.data || []).map((row) => String(row.email_address || "")),
  );
  const reviewNow = new Date();

  const items = health.items.map((item) => ({
    state: item.state,
    confidence: item.confidence,
    reason: item.reason,
    identityEvidence: classifyEmailIdentityEvidence(item),
    reviewPriority: classifyEmailIdentityReviewPriorityWithAge(item, reviewNow),
    message: {
      id: item.message.id,
      brandId: item.message.brand_id || null,
      direction: item.message.direction || null,
      subject: item.message.subject || "(uten emne)",
      aiIntent: item.message.ai_intent || null,
      occurredAt: item.message.received_at || item.message.created_at || null,
    },
    candidates: item.contactIds.map((id) => {
      const contact = contactMap.get(id);
      return contact ? {
        id: contact.id,
        name: contact.name || contact.email || "Ukjent kontakt",
        email: contact.email || null,
        brandId: contact.brand_id || contact.brand || null,
      } : { id, name: id, email: null, brandId: null };
    }),
  }));

  return NextResponse.json({
    generatedAt: reviewNow.toISOString(),
    summary: health.summary,
    items,
    safety: {
      readOnly: true,
      fuzzyNameMatching: false,
      relationshipInference: false,
      aiIntentUsedForLinking: false,
      ownAddressSource: "active_brand_email_configs",
      intentAgeUsedForLinking: false,
      crmUpdated: false,
      emailMessageUpdated: false,
      emailSent: false,
      humanReviewRequiredBeforeWrite: true,
    },
  });
}
