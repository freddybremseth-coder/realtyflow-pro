import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { rankPropertyBuyerMatches } from "@/lib/property-360";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function norm(value: unknown) {
  return String(value || "").trim();
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = supabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const params = request.nextUrl.searchParams;
  const propertyId = norm(params.get("propertyId"));
  const propertyReference = norm(params.get("reference"));
  const propertyTitle = norm(params.get("title"));

  if (!propertyId && !propertyReference && !propertyTitle) {
    return NextResponse.json({ error: "propertyId, reference or title is required" }, { status: 400 });
  }

  let itemQuery = supabase
    .from("lead_property_shortlist_items")
    .select("id,shortlist_id,brand,property_id,property_reference,property_title,property_location,property_price,rank,decision,system_eligibility,score,data_quality_score,reasons,concerns,questions_to_verify,created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  if (propertyId) itemQuery = itemQuery.eq("property_id", propertyId);
  else if (propertyReference) itemQuery = itemQuery.eq("property_reference", propertyReference);
  else itemQuery = itemQuery.eq("property_title", propertyTitle);

  const { data: items, error: itemsError } = await itemQuery;
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  const shortlistIds = [...new Set((items || []).map((item: any) => item.shortlist_id).filter(Boolean))];
  if (shortlistIds.length === 0) {
    return NextResponse.json({
      property: { id: propertyId || null, reference: propertyReference || null, title: propertyTitle || null },
      matches: [],
      evidenceCount: 0,
      message: "Ingen lagrede Lead Intelligence-matcher for denne boligen ennå.",
    });
  }

  const { data: shortlists, error: shortlistsError } = await supabase
    .from("lead_property_shortlists")
    .select("id,buyer_profile_id,status,title,brand,created_at")
    .in("id", shortlistIds);
  if (shortlistsError) return NextResponse.json({ error: shortlistsError.message }, { status: 500 });

  const profileIds = [...new Set((shortlists || []).map((row: any) => row.buyer_profile_id).filter(Boolean))];
  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabase.from("buyer_profiles").select("id,contact_id,status,purchase_readiness,summary,brand").in("id", profileIds)
    : { data: [], error: null } as any;
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  const contactIds = [...new Set((profiles || []).map((row: any) => row.contact_id).filter(Boolean))];
  const { data: contacts, error: contactsError } = contactIds.length
    ? await supabase.from("contacts").select("id,name,email,pipeline_status,pipeline_value").in("id", contactIds)
    : { data: [], error: null } as any;
  if (contactsError) return NextResponse.json({ error: contactsError.message }, { status: 500 });

  const shortlistById = new Map((shortlists || []).map((row: any) => [row.id, row]));
  const profileById = new Map((profiles || []).map((row: any) => [row.id, row]));
  const contactById = new Map((contacts || []).map((row: any) => [row.id, row]));

  const rows = (items || []).flatMap((item: any) => {
    const shortlist: any = shortlistById.get(item.shortlist_id);
    if (!shortlist) return [];
    const profile: any = profileById.get(shortlist.buyer_profile_id);
    if (!profile) return [];
    const contact: any = profile.contact_id ? contactById.get(profile.contact_id) : null;
    return [{
      shortlistId: shortlist.id,
      buyerProfileId: profile.id,
      contactId: profile.contact_id || null,
      contactName: contact?.name || null,
      contactEmail: contact?.email || null,
      pipelineStatus: contact?.pipeline_status || null,
      pipelineValue: contact?.pipeline_value || null,
      profileStatus: profile.status || null,
      purchaseReadiness: profile.purchase_readiness || null,
      profileSummary: profile.summary || null,
      shortlistStatus: shortlist.status || null,
      shortlistTitle: shortlist.title || null,
      item,
    }];
  });

  return NextResponse.json({
    property: {
      id: propertyId || items?.[0]?.property_id || null,
      reference: propertyReference || items?.[0]?.property_reference || null,
      title: propertyTitle || items?.[0]?.property_title || null,
      location: items?.[0]?.property_location || null,
      price: items?.[0]?.property_price || null,
    },
    matches: rankPropertyBuyerMatches(rows).slice(0, 25),
    evidenceCount: rows.length,
    generatedAt: new Date().toISOString(),
  });
}
