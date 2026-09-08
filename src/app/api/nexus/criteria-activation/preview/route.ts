import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { buildImportedLeadIntelligence } from "@/lib/nexus-imported-lead-intelligence";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const contactId = String(request.nextUrl.searchParams.get("contactId") || "").trim();
  if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const contactR = await supabase
    .from("contacts")
    .select("id,name,email,phone,notes,property_interest,pipeline_status,pipeline_value,source,brand_id,brand")
    .eq("id", contactId)
    .maybeSingle();

  if (contactR.error) return NextResponse.json({ error: contactR.error.message }, { status: 500 });
  if (!contactR.data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const contact = contactR.data as any;
  const lead = {
    type: null,
    property_interest: contact.property_interest || null,
    notes: contact.notes || null,
    preferences: null,
  };
  const buyerIntelligence = buildImportedLeadIntelligence(lead);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    contact: {
      id: contact.id,
      name: contact.name || contact.email || "Ukjent kunde",
      email: contact.email,
      phone: contact.phone,
      brand: contact.brand_id || contact.brand || null,
      pipelineStatus: contact.pipeline_status,
      pipelineValue: Number(contact.pipeline_value || 0),
      propertyInterest: contact.property_interest,
      notes: contact.notes,
      source: contact.source,
    },
    lead,
    buyerIntelligence,
    safety: {
      readOnly: true,
      buyerProfileUpdated: false,
      crmUpdated: false,
      workItemCreated: false,
      emailSent: false,
    },
  });
}
