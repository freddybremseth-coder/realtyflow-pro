import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { decideBuyerProfileAutoActivation } from "@/lib/nexus/buyer-profile-auto-activation";
import { prioritizePersonaBackfill } from "@/lib/persona-backfill";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIVE_STAGES = ["QUALIFIED", "VIEWING"];
const DIRECT_APPROVAL_CONFIDENCE = 80;

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const contactsR = await supabase
    .from("contacts")
    .select("id,name,email,phone,notes,property_interest,pipeline_status,pipeline_value,source,brand_id,brand,interactions,updated_at,email_suppressed,do_not_contact")
    .in("pipeline_status", ACTIVE_STAGES)
    .eq("do_not_contact", false)
    .eq("email_suppressed", false)
    .order("updated_at", { ascending: false })
    .limit(3000);

  if (contactsR.error) return NextResponse.json({ error: contactsR.error.message }, { status: 500 });

  const eligibleContacts = (contactsR.data || []).filter((contact: any) =>
    LeadIntelligenceRealEstateBrandSchema.safeParse(String(contact.brand_id || contact.brand || "").trim().toLowerCase()).success,
  );
  const contactIds = eligibleContacts.map((contact: any) => String(contact.id));

  const profilesR = contactIds.length
    ? await supabase
        .from("buyer_profiles")
        .select("contact_id,status")
        .in("contact_id", contactIds)
        .eq("status", "approved")
        .limit(5000)
    : { data: [], error: null } as any;

  if (profilesR.error) return NextResponse.json({ error: profilesR.error.message }, { status: 500 });
  const withApprovedProfile = new Set((profilesR.data || []).map((row: any) => String(row.contact_id || "")));
  const missingProfileContacts = eligibleContacts.filter((contact: any) => !withApprovedProfile.has(String(contact.id)));

  const ranked = prioritizePersonaBackfill(missingProfileContacts).map(({ contact, candidate }) => {
    const bucket = candidate.persona && candidate.confidence >= DIRECT_APPROVAL_CONFIDENCE
      ? "READY_TO_APPROVE"
      : candidate.persona
        ? "REVIEW_REQUIRED"
        : "DISCOVERY_REQUIRED";
    const autonomy = decideBuyerProfileAutoActivation(candidate);

    return {
      contact: {
        id: contact.id,
        name: contact.name || contact.email || "Ukjent kunde",
        email: contact.email,
        phone: contact.phone,
        brand: contact.brand_id || contact.brand,
        pipelineStatus: contact.pipeline_status,
        pipelineValue: Number(contact.pipeline_value || 0),
        propertyInterest: contact.property_interest,
      },
      candidate,
      bucket,
      autonomy: {
        tier: autonomy.safety.tier,
        allowed: autonomy.safety.allowed,
        canAutoActivate: autonomy.canAutoActivate,
        requiredDataComplete: autonomy.requiredDataComplete,
        confidence: autonomy.confidence,
        reason: autonomy.reason,
        requiresAudit: autonomy.safety.requiresAudit,
      },
      activationHref: `/nexus-os/stage-readiness/profile-activation?contactId=${encodeURIComponent(String(contact.id))}`,
      customer360Href: `/customers?contactId=${encodeURIComponent(String(contact.id))}`,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    directApprovalConfidence: DIRECT_APPROVAL_CONFIDENCE,
    autoActivationConfidence: 95,
    summary: {
      scanned: eligibleContacts.length,
      missingProfile: missingProfileContacts.length,
      autoEligible: ranked.filter((row) => row.autonomy.canAutoActivate).length,
      readyToApprove: ranked.filter((row) => row.bucket === "READY_TO_APPROVE").length,
      reviewRequired: ranked.filter((row) => row.bucket === "REVIEW_REQUIRED").length,
      discoveryRequired: ranked.filter((row) => row.bucket === "DISCOVERY_REQUIRED").length,
    },
    items: ranked,
    safety: {
      readOnly: true,
      autoEligibilityEvaluated: true,
      autoActivationExecuted: false,
      buyerProfileWritten: false,
      crmUpdated: false,
      pipelineUpdated: false,
      emailSent: false,
      nurtureChanged: false,
    },
  });
}
