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

  const work = await supabase
    .from("work_items")
    .select("id,title,priority,brand_id,next_action,metadata,updated_at")
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .eq("metadata->>no_match_review_required", "true")
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
    const criteria = Array.isArray(metadata.no_match_current_criteria)
      ? metadata.no_match_current_criteria.map(String).filter(Boolean).slice(0, 8)
      : [];
    return {
      id: String(row.id),
      priority: String(row.priority || "HIGH").toUpperCase(),
      customerName: contactMap.get(contactId) || null,
      contactId: contactId || null,
      buyerProfileId: String(metadata.buyer_profile_id || "") || null,
      analyzed: Number(metadata.property_match_analyzed || 0),
      criteria,
      reason: String(metadata.no_match_followup_reason || "NO_MATCHES_WITH_SPECIFIC_PROFILE"),
      nextAction: String(row.next_action || "Vurder om kunden bør spørres om fleksibilitet før kriteriene endres."),
      reviewHref: contactId ? `/customers?contactId=${encodeURIComponent(contactId)}` : "/lead-intelligence",
      updatedAt: row.updated_at,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: { total: items.length },
    items,
    safety: { criteriaMutated: false, customerMessageSent: false },
  });
}
