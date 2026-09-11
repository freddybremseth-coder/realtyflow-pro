import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const limit = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get("limit") || 50)));
  const reviewId = String(request.nextUrl.searchParams.get("reviewId") || "").trim();
  let query = supabase
    .from("work_items")
    .select("id,title,status,priority,brand_id,next_action,metadata,created_at,updated_at")
    .eq("source_type", "ai_agent")
    .eq("assigned_agent", "nexus_buyer_intelligence")
    .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
    .eq("metadata->>kind", "buyer_profile_email_review")
    .eq("metadata->>requires_human_interpretation", "true");
  if (reviewId) query = query.eq("id", reviewId);
  const work = await query.order("updated_at", { ascending: false }).limit(limit);

  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });

  const rows = work.data || [];
  const contactIds = [...new Set(rows.map((row) => String(record(row.metadata).contact_id || "")).filter(Boolean))];
  const contactMap = new Map<string, { id: string; name: string | null; email: string | null }>();
  const profileMap = new Map<string, { id: string; version: number; brand: string }>();

  if (contactIds.length) {
    const [contacts, profiles] = await Promise.all([
      supabase.from("contacts").select("id,name,email").in("id", contactIds),
      supabase
        .from("buyer_profiles")
        .select("id,contact_id,brand,status,version,updated_at")
        .in("contact_id", contactIds)
        .eq("status", "approved")
        .order("version", { ascending: false }),
    ]);
    if (contacts.error) return NextResponse.json({ error: contacts.error.message }, { status: 500 });
    if (profiles.error) return NextResponse.json({ error: profiles.error.message }, { status: 500 });

    for (const contact of contacts.data || []) {
      contactMap.set(String(contact.id), {
        id: String(contact.id),
        name: contact.name || null,
        email: contact.email || null,
      });
    }
    for (const profile of profiles.data || []) {
      const contactId = String(profile.contact_id || "");
      if (!contactId || profileMap.has(contactId)) continue;
      profileMap.set(contactId, {
        id: String(profile.id),
        version: Number(profile.version || 1),
        brand: String(profile.brand || ""),
      });
    }
  }

  const items = rows.map((row) => {
    const metadata = record(row.metadata);
    const contactId = String(metadata.contact_id || "");
    const contact = contactMap.get(contactId) || null;
    const profile = profileMap.get(contactId) || null;
    const brandId = String(row.brand_id || profile?.brand || "");
    const reviewParams = new URLSearchParams();
    reviewParams.set("reviewId", String(row.id));
    if (brandId) reviewParams.set("brand", brandId);
    if (profile?.id) reviewParams.set("buyerProfileId", profile.id);
    if (contactId) reviewParams.set("contactId", contactId);

    return {
      id: String(row.id),
      title: String(row.title || "Tvetydig kundesvar trenger tolkning"),
      priority: String(row.priority || "HIGH").toUpperCase(),
      status: String(row.status || "TO_DO").toUpperCase(),
      brandId: brandId || null,
      contactId,
      customerName: contact?.name || null,
      customerEmail: contact?.email || null,
      buyerProfileId: profile?.id || null,
      buyerProfileVersion: profile?.version || null,
      replyPreview: String(metadata.human_interpretation_reply_preview || "").trim().slice(0, 500),
      interpretationReason: String(metadata.human_interpretation_reason || "ambiguous_confirmation_reply"),
      nextAction: String(row.next_action || "Tolk kundens svar og legg inn korrekte søkekriterier før matching fortsetter."),
      responseEmailMessageId: String(metadata.confirmation_response_email_message_id || "") || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewHref: profile?.id
        ? `/nexus-os/buyer-criteria-review?${reviewParams.toString()}`
        : contactId
          ? `/customers/${encodeURIComponent(contactId)}`
          : "/nexus-os/inbox",
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: { total: items.length, highPriority: items.filter((item) => item.priority === "HIGH").length },
    items,
    safety: { readOnly: true, buyerProfileUpdated: false, matchingTriggered: false, emailSent: false },
  });
}
