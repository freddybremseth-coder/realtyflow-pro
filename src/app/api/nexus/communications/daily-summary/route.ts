import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function ageMinutes(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function priorityScore(row: any) {
  const urgency = String(row.ai_urgency || "").toLowerCase();
  let score = urgency === "critical" ? 100 : urgency === "high" ? 80 : urgency === "medium" ? 50 : 30;
  if (!row.replied_at) score += 30;
  if (!row.is_read) score += 15;
  const minutes = ageMinutes(row.received_at || row.created_at) ?? 0;
  if (minutes <= 30) score += 20;
  else if (minutes <= 120) score += 10;
  return score;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [outboundR, inboundR, contactsR, draftsR] = await Promise.all([
    supabase
      .from("email_messages")
      .select("id,brand_id,to_addresses,subject,created_at,received_at", { count: "exact" })
      .eq("direction", "outbound")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("email_messages")
      .select("id,brand_id,from_address,from_name,subject,ai_summary,ai_intent,ai_urgency,ai_suggested_action,is_read,replied_at,received_at,created_at,matched_property_ids,crm_reply_classification,crm_contact_id")
      .eq("direction", "inbound")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(500),
    supabase
      .from("contacts")
      .select("id,name,email,pipeline_status,email_suppressed,do_not_contact,last_inbound_reply_at,last_reply_classification")
      .gte("last_inbound_reply_at", since)
      .limit(500),
    supabase
      .from("email_drafts")
      .select("id,email_message_id,subject,body_text,ai_confidence,status,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  for (const result of [outboundR, inboundR, contactsR, draftsR]) {
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const inbound = inboundR.data ?? [];
  const contacts = contactsR.data ?? [];
  const drafts = draftsR.data ?? [];
  const draftByMessage = new Map<string, any>();
  for (const draft of drafts as any[]) {
    if (draft.email_message_id && !draftByMessage.has(String(draft.email_message_id))) {
      draftByMessage.set(String(draft.email_message_id), draft);
    }
  }

  const propertyIds = Array.from(new Set(inbound.flatMap((row: any) => Array.isArray(row.matched_property_ids) ? row.matched_property_ids.map(String) : [])));
  const { data: properties, error: propertiesError } = propertyIds.length
    ? await supabase
        .from("properties")
        .select("id,ref,price,location,bedrooms,bathrooms,title_no,title_en,title_es,primary_image")
        .in("id", propertyIds)
        .limit(300)
    : { data: [] as any[], error: null };
  if (propertiesError) return NextResponse.json({ error: propertiesError.message }, { status: 500 });
  const propertyById = new Map((properties ?? []).map((property: any) => [String(property.id), property]));

  const actionable = inbound
    .filter((row: any) => !["unsubscribe", "purchased", "informational"].includes(String(row.crm_reply_classification || "")))
    .filter((row: any) => !row.replied_at)
    .map((row: any) => {
      const draft = draftByMessage.get(String(row.id)) ?? null;
      const matchedProperties = (Array.isArray(row.matched_property_ids) ? row.matched_property_ids : [])
        .map((id: unknown) => propertyById.get(String(id)))
        .filter(Boolean)
        .slice(0, 5);
      return {
        messageId: row.id,
        brandId: row.brand_id,
        from: { name: row.from_name, email: row.from_address },
        subject: row.subject,
        summary: row.ai_summary,
        intent: row.ai_intent,
        urgency: row.ai_urgency,
        suggestedAction: row.ai_suggested_action,
        receivedAt: row.received_at || row.created_at,
        ageMinutes: ageMinutes(row.received_at || row.created_at),
        priorityScore: priorityScore(row),
        draft: draft ? {
          id: draft.id,
          subject: draft.subject,
          bodyText: draft.body_text,
          confidence: draft.ai_confidence,
          status: draft.status,
        } : null,
        suggestedProperties: matchedProperties.map((property: any) => ({
          id: property.id,
          ref: property.ref,
          title: property.title_no || property.title_en || property.title_es,
          price: property.price,
          location: property.location,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          primaryImage: property.primary_image,
        })),
      };
    })
    .sort((a: any, b: any) => b.priorityScore - a.priorityScore || Number(a.ageMinutes || 0) - Number(b.ageMinutes || 0))
    .slice(0, 12);

  const classifications = contacts.reduce<Record<string, number>>((acc, row: any) => {
    const key = String(row.last_reply_classification || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    windowHours: 24,
    summary: {
      sent: outboundR.count ?? (outboundR.data ?? []).length,
      inboundReplies: inbound.length,
      actionableUnanswered: actionable.length,
      purchasedLost: classifications.purchased || 0,
      unsubscribed: classifications.unsubscribe || 0,
      suppressedContacts: contacts.filter((row: any) => row.email_suppressed || row.do_not_contact).length,
    },
    classifications,
    importantReplies: actionable,
    note: "Prioriter aktive kundesvar først. AI-utkast og boligforslag er forslag og skal vurderes mot kundens faktiske behov før sending.",
  });
}
