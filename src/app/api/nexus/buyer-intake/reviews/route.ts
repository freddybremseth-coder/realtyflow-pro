import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const limit = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get("limit") || 50)));
  const workItemsResult = await supabase
    .from("work_items")
    .select("id,title,status,priority,brand_id,source_type,source_id,assigned_agent,metadata,created_at,updated_at")
    .eq("source_type", "ai_agent")
    .eq("assigned_agent", "nexus_buyer_intelligence")
    .in("status", ["todo", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (workItemsResult.error) return NextResponse.json({ error: workItemsResult.error.message }, { status: 500 });

  const intakeRows = (workItemsResult.data || [])
    .filter((row) => record(row.metadata).kind === "buyer_intake_review")
    .slice(0, limit);
  const contactIds = [...new Set(intakeRows.map((row) => String(record(row.metadata).contact_id || "")).filter(Boolean))];

  const contactMap = new Map<string, any>();
  if (contactIds.length) {
    const contactsResult = await supabase
      .from("contacts")
      .select("id,name,email,brand_id,brand,pipeline_status,property_interest,pipeline_value")
      .in("id", contactIds);
    if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });
    for (const contact of contactsResult.data || []) contactMap.set(String(contact.id), contact);
  }

  const items = intakeRows.map((row) => {
    const metadata = record(row.metadata);
    const intelligence = record(metadata.buyer_intelligence);
    const contactId = String(metadata.contact_id || "");
    const contact = contactMap.get(contactId) || null;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      brandId: row.brand_id || contact?.brand_id || contact?.brand || null,
      extractionConfidence: metadata.extraction_confidence || null,
      formType: metadata.form_type || null,
      contact: contact ? {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        pipelineStatus: contact.pipeline_status,
        propertyInterest: contact.property_interest,
        pipelineValue: contact.pipeline_value,
      } : { id: contactId },
      counts: {
        personas: Array.isArray(intelligence.personaCandidates) ? intelligence.personaCandidates.length : 0,
        lifestyle: Array.isArray(intelligence.lifestyleCandidates) ? intelligence.lifestyleCandidates.length : 0,
      },
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: items.length,
      highPriority: items.filter((item) => item.priority === "high").length,
      withLifestyleEvidence: items.filter((item) => item.counts.lifestyle > 0).length,
    },
    items,
    safety: { readOnly: true, buyerProfileUpdated: false, crmUpdated: false, emailSent: false },
  });
}
