import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const work = await supabase
    .from("work_items")
    .select("id,title,priority,brand_id,next_action,description,metadata,updated_at")
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .eq("metadata->>viewing_coach_review_required", "true")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });

  const rows = work.data || [];
  const contactIds = [...new Set(rows.map((row) => String(record(row.metadata).contact_id || "")).filter(Boolean))];
  const contactMap = new Map<string, string | null>();
  if (contactIds.length) {
    const contacts = await supabase.from("contacts").select("id,name").in("id", contactIds);
    if (contacts.error) return NextResponse.json({ error: contacts.error.message }, { status: 500 });
    for (const contact of contacts.data || []) contactMap.set(String(contact.id), contact.name || null);
  }

  const items = rows.map((row) => {
    const metadata = record(row.metadata);
    const contactId = String(metadata.contact_id || "");
    const property = record(metadata.viewing_coach_property);
    return {
      id: String(row.id),
      priority: String(row.priority || "MEDIUM").toUpperCase(),
      customerName: contactMap.get(contactId) || null,
      contactId: contactId || null,
      buyerProfileId: String(metadata.buyer_profile_id || "") || null,
      buyerProfileStatus: String(metadata.buyer_profile_status || "") || null,
      sentiment: String(metadata.viewing_coach_sentiment || "neutral"),
      reasons: Array.isArray(metadata.viewing_coach_reasons) ? metadata.viewing_coach_reasons.map(String).filter(Boolean) : [],
      explicitCriteria: Array.isArray(metadata.viewing_coach_explicit_criteria) ? metadata.viewing_coach_explicit_criteria.map(String).filter(Boolean) : [],
      highIntent: metadata.viewing_coach_high_intent === true,
      shouldRematch: metadata.viewing_coach_should_rematch === true,
      note: String(metadata.viewing_coach_note || row.description || "").trim() || null,
      property: {
        id: String(property.propertyId || "") || null,
        reference: String(property.reference || "") || null,
        title: String(property.title || "") || null,
        location: String(property.location || "") || null,
      },
      nextAction: String(row.next_action || "Gjennomgå visningsfeedback og velg neste steg."),
      reviewHref: contactId ? `/customers?contactId=${encodeURIComponent(contactId)}` : "/lead-intelligence",
      updatedAt: row.updated_at,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: items.length,
      highIntent: items.filter((item) => item.highIntent).length,
      profileReviewRequired: items.filter((item) => item.explicitCriteria.length > 0).length,
      rematchPrepared: items.filter((item) => item.shouldRematch).length,
    },
    items,
    safety: {
      buyerProfileMutated: false,
      pipelineMutated: false,
      customerMessageSent: false,
      secondaryRankingOnly: true,
    },
  });
}
