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

function maxIso(values: Array<string | null | undefined>) {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map((date) => date.getTime()))).toISOString();
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const contactId = String(request.nextUrl.searchParams.get("contactId") || "").trim();
  if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [contactResult, revenueResult, nurtureResult, profileResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("id,name,email,brand_id,brand,pipeline_status,nurture_status,property_interest,created_at,last_contact,last_ai_followup")
      .eq("id", contactId)
      .maybeSingle(),
    supabase
      .from("revenue_events")
      .select("occurred_at,event_type")
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("lead_nurture_events")
      .select("sent_at,status")
      .eq("contact_id", contactId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(20),
    supabase
      .from("buyer_profiles")
      .select("id,status,version,approved_at")
      .eq("contact_id", contactId)
      .eq("status", "approved")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  if (!contactResult.data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const warnings: string[] = [];
  if (revenueResult.error) warnings.push(`Revenue events unavailable: ${revenueResult.error.message}`);
  if (nurtureResult.error) warnings.push(`Nurture events unavailable: ${nurtureResult.error.message}`);
  if (profileResult.error) warnings.push(`Buyer Profile unavailable: ${profileResult.error.message}`);

  let criteria: BuyerLifestyleCriterionLike[] = [];
  if (profileResult.data?.id) {
    const criteriaResult = await supabase
      .from("buyer_profile_criteria")
      .select("key,other_key,criterion_type,value,weight,source,source_text,confidence,customer_confirmed,approval_status,active")
      .eq("buyer_profile_id", profileResult.data.id)
      .eq("active", true);
    if (criteriaResult.error) warnings.push(`Buyer criteria unavailable: ${criteriaResult.error.message}`);
    else criteria = (criteriaResult.data || []) as BuyerLifestyleCriterionLike[];
  }

  const contact = contactResult.data;
  const latestRevenueEventAt = maxIso((revenueResult.data || []).map((row) => row.occurred_at));
  const latestNurtureSentAt = maxIso((nurtureResult.data || []).map((row) => row.sent_at));

  const candidate: DormantLeadContact = {
    id: String(contact.id),
    name: contact.name,
    email: contact.email,
    brandId: contact.brand_id || contact.brand,
    pipelineStatus: contact.pipeline_status,
    nurtureStatus: contact.nurture_status,
    propertyInterest: contact.property_interest,
    createdAt: contact.created_at,
    lastContact: contact.last_contact,
    lastAiFollowup: contact.last_ai_followup,
    latestRevenueEventAt,
    latestNurtureSentAt,
  };

  const assessment = assessDormantLead(candidate, criteria);
  const draft = composeDormantLeadReactivationDraft(candidate, criteria, assessment);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    contact: {
      id: candidate.id,
      name: candidate.name,
      brandId: candidate.brandId,
      pipelineStatus: candidate.pipelineStatus,
      propertyInterest: candidate.propertyInterest,
    },
    buyerProfile: profileResult.data
      ? { id: profileResult.data.id, version: profileResult.data.version, approvedAt: profileResult.data.approved_at }
      : null,
    assessment,
    draft,
    warnings,
    safety: {
      readOnly: true,
      externalActionExecuted: false,
      contactUpdated: false,
      nurtureEnrollmentChanged: false,
      inferredSignalsAssertedAsFacts: false,
    },
  });
}
