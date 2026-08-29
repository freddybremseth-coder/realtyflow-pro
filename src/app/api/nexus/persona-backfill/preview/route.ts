import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { prioritizePersonaBackfill } from "@/lib/persona-backfill";

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

  const limit = Math.max(1, Math.min(250, Number(request.nextUrl.searchParams.get("limit") || 100)));
  const minConfidence = Math.max(0, Math.min(100, Number(request.nextUrl.searchParams.get("minConfidence") || 0)));

  const contactsResult = await supabase
    .from("contacts")
    .select("id,name,email,phone,notes,property_interest,preferred_location,pipeline_status,pipeline_value,source,brand_id,brand,interactions")
    .not("pipeline_status", "in", '("WON","LOST")')
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });
  const contacts = contactsResult.data || [];
  const contactIds = contacts.map((contact) => String(contact.id));

  const approvedPersonaContactIds = new Set<string>();
  if (contactIds.length) {
    const profilesResult = await supabase
      .from("buyer_profiles")
      .select("id,contact_id,status,version")
      .in("contact_id", contactIds)
      .eq("status", "approved")
      .order("version", { ascending: false });

    if (profilesResult.error) return NextResponse.json({ error: profilesResult.error.message }, { status: 500 });
    const profileIds = (profilesResult.data || []).map((profile) => String(profile.id));
    const contactByProfile = new Map((profilesResult.data || []).map((profile) => [String(profile.id), String(profile.contact_id)]));

    if (profileIds.length) {
      const criteriaResult = await supabase
        .from("buyer_profile_criteria")
        .select("buyer_profile_id,key,other_key,approval_status,active")
        .in("buyer_profile_id", profileIds)
        .eq("key", "other")
        .eq("other_key", "routing_persona")
        .eq("approval_status", "approved")
        .eq("active", true);

      if (criteriaResult.error) return NextResponse.json({ error: criteriaResult.error.message }, { status: 500 });
      for (const criterion of criteriaResult.data || []) {
        const contactId = contactByProfile.get(String(criterion.buyer_profile_id));
        if (contactId) approvedPersonaContactIds.add(contactId);
      }
    }
  }

  const availableContacts = contacts.filter((contact) => !approvedPersonaContactIds.has(String(contact.id)));
  const ranked = prioritizePersonaBackfill(availableContacts)
    .filter(({ candidate }) => candidate.confidence >= minConfidence)
    .slice(0, limit)
    .map(({ contact, candidate }) => ({
      contact: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        pipelineStatus: contact.pipeline_status,
        pipelineValue: contact.pipeline_value,
        propertyInterest: contact.property_interest,
        preferredLocation: contact.preferred_location,
        source: contact.source,
        brandId: contact.brand_id || contact.brand || null,
      },
      candidate,
    }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      scanned: contacts.length,
      alreadyApproved: approvedPersonaContactIds.size,
      remaining: availableContacts.length,
      proposed: ranked.filter((item) => Boolean(item.candidate.persona)).length,
      needsDiscovery: ranked.filter((item) => !item.candidate.persona).length,
      highConfidence: ranked.filter((item) => item.candidate.persona && item.candidate.confidence >= 80).length,
    },
    items: ranked,
    safety: {
      readOnly: true,
      buyerProfileUpdated: false,
      routingPersonaApproved: false,
      crmUpdated: false,
      nurtureChanged: false,
      emailSent: false,
      humanReviewRequired: true,
    },
  });
}
