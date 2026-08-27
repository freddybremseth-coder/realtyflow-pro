import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  mergeBuyerIntakeCriteria,
  type BuyerIntakeLifestyleCandidate,
  type ExistingBuyerProfileCriterionRow,
} from "@/lib/nexus-buyer-intake-approval";

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

  const workItemId = String(request.nextUrl.searchParams.get("workItemId") || "").trim();
  if (!workItemId) return NextResponse.json({ error: "workItemId required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const workItemResult = await supabase
    .from("work_items")
    .select("id,title,status,priority,brand_id,source_type,source_id,metadata,created_at")
    .eq("id", workItemId)
    .maybeSingle();
  if (workItemResult.error) return NextResponse.json({ error: workItemResult.error.message }, { status: 500 });
  if (!workItemResult.data) return NextResponse.json({ error: "Buyer Intake work item not found" }, { status: 404 });

  const workItem = workItemResult.data;
  const metadata = record(workItem.metadata);
  if (metadata.kind !== "buyer_intake_review") {
    return NextResponse.json({ error: "Work item is not a Buyer Intake review" }, { status: 409 });
  }

  const contactId = String(metadata.contact_id || "").trim();
  if (!contactId) return NextResponse.json({ error: "Buyer Intake review is missing contact_id" }, { status: 409 });

  const contactResult = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,property_interest,pipeline_value")
    .eq("id", contactId)
    .maybeSingle();
  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  if (!contactResult.data) return NextResponse.json({ error: "Linked contact not found" }, { status: 404 });
  const contact = contactResult.data;
  const brand = String(contact.brand_id || contact.brand || workItem.brand_id || "").trim();

  const profileResult = await supabase
    .from("buyer_profiles")
    .select("id,contact_id,intake_id,version,status,purchase_readiness,budget_amount,budget_currency,budget_includes_costs,budget_approximate,location_flexible,summary,approved_at")
    .eq("contact_id", contactId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500 });

  const activeProfile = profileResult.data || null;
  let existingCriteria: ExistingBuyerProfileCriterionRow[] = [];
  if (activeProfile?.id) {
    const criteriaResult = await supabase
      .from("buyer_profile_criteria")
      .select("criterion_type,key,other_key,operator,value,weight,severity,applies_to_property_types,source_text,customer_confirmed,active")
      .eq("buyer_profile_id", activeProfile.id)
      .eq("active", true);
    if (criteriaResult.error) return NextResponse.json({ error: criteriaResult.error.message }, { status: 500 });
    existingCriteria = (criteriaResult.data || []) as ExistingBuyerProfileCriterionRow[];
  }

  const intelligence = record(metadata.buyer_intelligence);
  const lifestyleCandidates = Array.isArray(intelligence.lifestyleCandidates)
    ? intelligence.lifestyleCandidates as BuyerIntakeLifestyleCandidate[]
    : [];
  const merged = mergeBuyerIntakeCriteria({ existingCriteria, lifestyleCandidates });

  const revisionDraft = activeProfile ? {
    brand,
    summary: String(activeProfile.summary || `Buyer Profile for ${contact.name || contact.email || "contact"}`),
    purchaseReadiness: activeProfile.purchase_readiness || "unknown",
    budgetAmount: activeProfile.budget_amount ?? null,
    budgetCurrency: activeProfile.budget_currency || "EUR",
    budgetIncludesCosts: activeProfile.budget_includes_costs ?? null,
    budgetApproximate: Boolean(activeProfile.budget_approximate),
    locationFlexible: Boolean(activeProfile.location_flexible),
    revisionNote: `Buyer Intake ${workItem.id}: reviewed explicit lifestyle evidence from imported form/document.`,
    criteria: merged.mergedCriteria,
  } : null;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    action: activeProfile ? "revise_existing_profile" : "create_initial_profile",
    workItem: {
      id: workItem.id,
      title: workItem.title,
      status: workItem.status,
      priority: workItem.priority,
      createdAt: workItem.created_at,
      extractionConfidence: metadata.extraction_confidence || null,
      formType: metadata.form_type || null,
    },
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      brand,
      pipelineStatus: contact.pipeline_status,
      propertyInterest: contact.property_interest,
      pipelineValue: contact.pipeline_value,
    },
    activeProfile,
    personas: Array.isArray(intelligence.personaCandidates) ? intelligence.personaCandidates : [],
    lifestyleCandidates,
    proposedLifestyleCriteria: merged.suggestedLifestyleCriteria,
    existingCriteria: merged.existingCriteria,
    mergedCriteria: merged.mergedCriteria,
    revisionDraft,
    nextStep: activeProfile
      ? `POST /api/lead-intelligence/buyer-profiles/${activeProfile.id}/revision after explicit item-level review`
      : "Use the existing Lead Intelligence review gate to create the first approved Buyer Profile after explicit item-level review.",
    safety: {
      readOnly: true,
      buyerProfileUpdated: false,
      workItemUpdated: false,
      crmUpdated: false,
      emailSent: false,
      personaPersistedAsCriterion: false,
      explicitApprovalRequired: true,
    },
  });
}
