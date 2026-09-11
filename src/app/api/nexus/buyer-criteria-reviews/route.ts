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
  const work = await supabase
    .from("work_items")
    .select("id,title,status,priority,brand_id,next_action,metadata,created_at,updated_at")
    .eq("source_type", "ai_agent")
    .eq("assigned_agent", "nexus_buyer_intelligence")
    .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
    .eq("metadata->>kind", "buyer_profile_email_review")
    .eq("metadata->>requires_human_interpretation", "true")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });

  const rows = work.data || [];
  const contactIds = [...new Set(rows.map((row) => String(record(row.metadata).contact_id || "")).filter(Boolean))];
  const contactMap = new Map<string, { id: string; name: string | null; email: string | null }>();

  if (contactIds.length) {
    const contacts = await supabase
      .from("contacts")
      .select("id,name,email")
      .in("id", contactIds);
    if (contacts.error) return NextResponse.json({ error: contacts.error.message }, { status: 500 });
    for (const contact of contacts.data || []) {
      contactMap.set(String(contact.id), {
        id: String(contact.id),
        name: contact.name || null,
        email: contact.email || null,
      });
    }
  }

  const items = rows.map((row) => {
    const metadata = record(row.metadata);
    const contactId = String(metadata.contact_id || "");
    const contact = contactMap.get(contactId) || null;
    return {
      id: String(row.id),
      title: String(row.title || "Tvetydig kundesvar trenger tolkning"),
      priority: String(row.priority || "HIGH").toUpperCase(),
      status: String(row.status || "TO_DO").toUpperCase(),
      brandId: row.brand_id || null,
      contactId,
      customerName: contact?.name || null,
      customerEmail: contact?.email || null,
      replyPreview: String(metadata.ambiguous_reply_preview || "").trim().slice(0, 500),
      nextAction: String(row.next_action || "Tolk kundens svar og legg inn korrekte søkekriterier før matching fortsetter."),
      responseEmailMessageId: String(metadata.confirmation_response_email_message_id || "") || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewHref: contactId ? `/customers/${encodeURIComponent(contactId)}` : "/nexus-os/inbox",
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: { total: items.length, highPriority: items.filter((item) => item.priority === "HIGH").length },
    items,
    safety: { readOnly: true, buyerProfileUpdated: false, matchingTriggered: false, emailSent: false },
  });
}
