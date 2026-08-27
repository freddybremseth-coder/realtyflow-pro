import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  assessDormantLead,
  composeDormantLeadReactivationDraft,
  type DormantLeadContact,
} from "@/lib/nexus-dormant-lead-reactivation";
import type { BuyerLifestyleCriterionLike } from "@/lib/nexus-buyer-lifestyle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function maxIso(current: string | null | undefined, candidate: string | null | undefined) {
  if (!candidate) return current || null;
  if (!current) return candidate;
  const a = new Date(current).getTime();
  const b = new Date(candidate).getTime();
  if (Number.isNaN(b)) return current;
  if (Number.isNaN(a)) return candidate;
  return b > a ? candidate : current;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const limit = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 100)));
  const brand = String(request.nextUrl.searchParams.get("brand") || "").trim();

  let contactsQuery = supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,nurture_status,property_interest,created_at,last_contact,last_ai_followup")
    .in("pipeline_status", ["NEW", "CONTACT", "QUALIFIED"])
    .not("email", "is", null)
    .limit(1000);
  if (brand) contactsQuery = contactsQuery.or(`brand_id.eq.${brand},brand.eq.${brand}`);

  const contactsResult = await contactsQuery;
  if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });
  const contacts = contactsResult.data || [];
  const contactIds = contacts.map((row) => String(row.id));

  if (!contactIds.length) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: { scanned: 0, eligible: 0, hot: 0, warm: 0, cold: 0 },
      items: [],
      safety: { readOnly: true, externalActionExecuted: false },
    });
  }

  const [profilesResult, revenueResult, nurtureResult] = await Promise.all([
    supabase
      .from("buyer_profiles")
      .select("id,contact_id,status,version")
      .in("contact_id", contactIds)
      .eq("status", "approved")
      .order("version", { ascending: false }),
    supabase
      .from("revenue_events")
      .select("contact_id,occurred_at,event_type")
      .in("contact_id", contactIds)
      .order("occurred_at", { ascending: false })
      .limit(5000),
    supabase
      .from("lead_nurture_events")
      .select("contact_id,sent_at,status")
      .in("contact_id", contactIds)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(5000),
  ]);

  const warnings: string[] = [];
  if (profilesResult.error) warnings.push(`Buyer profiles unavailable: ${profilesResult.error.message}`);
  if (revenueResult.error) warnings.push(`Revenue events unavailable: ${revenueResult.error.message}`);
  if (nurtureResult.error) warnings.push(`Nurture events unavailable: ${nurtureResult.error.message}`);

  const profileByContact = new Map<string, { id: string; version: number }>();
  for (const profile of profilesResult.data || []) {
    const contactId = String(profile.contact_id || "");
    if (!contactId || profileByContact.has(contactId)) continue;
    profileByContact.set(contactId, { id: String(profile.id), version: Number(profile.version || 0) });
  }

  const profileIds = [...profileByContact.values()].map((profile) => profile.id);
  let criteriaRows: Array<BuyerLifestyleCriterionLike & { buyer_profile_id?: string | null }> = [];
  if (profileIds.length) {
    const criteriaResult = await supabase
      .from("buyer_profile_criteria")
      .select("buyer_profile_id,key,other_key,criterion_type,value,weight,source,source_text,confidence,customer_confirmed,approval_status,active")
      .in("buyer_profile_id", profileIds)
      .eq("active", true);
    if (criteriaResult.error) warnings.push(`Buyer criteria unavailable: ${criteriaResult.error.message}`);
    else criteriaRows = (criteriaResult.data || []) as Array<BuyerLifestyleCriterionLike & { buyer_profile_id?: string | null }>;
  }

  const criteriaByProfile = new Map<string, BuyerLifestyleCriterionLike[]>();
  for (const row of criteriaRows) {
    const profileId = String(row.buyer_profile_id || "");
    if (!profileId) continue;
    const list = criteriaByProfile.get(profileId) || [];
    list.push(row);
    criteriaByProfile.set(profileId, list);
  }

  const revenueByContact = new Map<string, string>();
  for (const event of revenueResult.data || []) {
    const contactId = String(event.contact_id || "");
    if (!contactId) continue;
    revenueByContact.set(contactId, maxIso(revenueByContact.get(contactId), event.occurred_at) || "");
  }
  const nurtureByContact = new Map<string, string>();
  for (const event of nurtureResult.data || []) {
    const contactId = String(event.contact_id || "");
    if (!contactId) continue;
    nurtureByContact.set(contactId, maxIso(nurtureByContact.get(contactId), event.sent_at) || "");
  }

  const items = contacts
    .map((contact) => {
      const contactId = String(contact.id);
      const profile = profileByContact.get(contactId) || null;
      const criteria = profile ? criteriaByProfile.get(profile.id) || [] : [];
      const candidate: DormantLeadContact = {
        id: contactId,
        name: contact.name,
        email: contact.email,
        brandId: contact.brand_id || contact.brand,
        pipelineStatus: contact.pipeline_status,
        nurtureStatus: contact.nurture_status,
        propertyInterest: contact.property_interest,
        createdAt: contact.created_at,
        lastContact: contact.last_contact,
        lastAiFollowup: contact.last_ai_followup,
        latestRevenueEventAt: revenueByContact.get(contactId) || null,
        latestNurtureSentAt: nurtureByContact.get(contactId) || null,
      };
      const assessment = assessDormantLead(candidate, criteria);
      const draft = composeDormantLeadReactivationDraft(candidate, criteria, assessment);
      return {
        contact: {
          id: contactId,
          name: contact.name,
          email: contact.email,
          brandId: candidate.brandId,
          pipelineStatus: candidate.pipelineStatus,
          propertyInterest: candidate.propertyInterest,
        },
        buyerProfile: profile,
        assessment,
        draft: draft ? { subject: draft.subject, body: draft.body, objective: draft.objective } : null,
      };
    })
    .filter((item) => item.assessment.eligibleForDraft && item.assessment.segment !== "do_not_reactivate")
    .sort((a, b) => b.assessment.score - a.assessment.score)
    .slice(0, limit);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      scanned: contacts.length,
      eligible: items.length,
      hot: items.filter((item) => item.assessment.segment === "hot_dormant").length,
      warm: items.filter((item) => item.assessment.segment === "warm_dormant").length,
      cold: items.filter((item) => item.assessment.segment === "cold_dormant").length,
    },
    items,
    warnings,
    safety: {
      readOnly: true,
      externalActionExecuted: false,
      nurtureEnrollmentChanged: false,
      crmUpdated: false,
      buyerProfileUpdated: false,
    },
  });
}
