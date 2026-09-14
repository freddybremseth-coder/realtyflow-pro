import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { combineBuyerJourneyHealth, evaluateBuyerProfileHealth, evaluateMatchQuality } from "@/lib/nexus/buyer-profile-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIVE_STAGES = ["QUALIFIED", "VIEWING"];
const REALTY_BRANDS = ["zeneco", "soleada", "pinosoecolife"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function rowsBy<T extends Record<string, any>>(rows: T[], key: keyof T) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = String(row[key] || "");
    if (!id) continue;
    map.set(id, [...(map.get(id) || []), row]);
  }
  return map;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const contactsR = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,pipeline_value,property_interest,updated_at")
    .in("pipeline_status", ACTIVE_STAGES)
    .or("do_not_contact.is.null,do_not_contact.eq.false")
    .order("pipeline_value", { ascending: false })
    .limit(3000);
  if (contactsR.error) return NextResponse.json({ error: contactsR.error.message }, { status: 500 });

  const contacts = (contactsR.data || []).filter((row: any) => REALTY_BRANDS.includes(String(row.brand_id || row.brand || "").toLowerCase()));
  const contactIds = contacts.map((row: any) => String(row.id));
  const profilesR = contactIds.length
    ? await supabase.from("buyer_profiles")
        .select("id,contact_id,brand,version,status,purchase_readiness,budget_amount,budget_currency,summary,approved_at,updated_at")
        .in("contact_id", contactIds).eq("status", "approved").order("version", { ascending: false }).limit(5000)
    : { data: [], error: null } as any;
  if (profilesR.error) return NextResponse.json({ error: profilesR.error.message }, { status: 500 });

  const latestProfiles = new Map<string, any>();
  for (const profile of profilesR.data || []) {
    const contactId = String(profile.contact_id || "");
    if (!latestProfiles.has(contactId)) latestProfiles.set(contactId, profile);
  }
  const profiles = [...latestProfiles.values()];
  const profileIds = profiles.map((row) => String(row.id));

  const [criteriaR, shortlistsR] = await Promise.all([
    profileIds.length
      ? supabase.from("buyer_profile_criteria")
          .select("buyer_profile_id,key,other_key,value,confidence,customer_confirmed,approval_status,active,source,source_text")
          .in("buyer_profile_id", profileIds).eq("active", true)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("lead_property_shortlists")
          .select("id,buyer_profile_id,brand,status,created_at,updated_at")
          .in("buyer_profile_id", profileIds).neq("status", "archived").order("updated_at", { ascending: false }).limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const relationError = criteriaR.error || shortlistsR.error;
  if (relationError) return NextResponse.json({ error: relationError.message }, { status: 500 });

  const latestShortlist = new Map<string, any>();
  for (const shortlist of shortlistsR.data || []) {
    const profileId = String(shortlist.buyer_profile_id || "");
    if (!latestShortlist.has(profileId)) latestShortlist.set(profileId, shortlist);
  }
  const shortlistIds = [...latestShortlist.values()].map((row) => String(row.id));
  const shortlistItemsR = shortlistIds.length
    ? await supabase.from("lead_property_shortlist_items")
        .select("id,shortlist_id,property_id,property_reference,property_title,property_location,score,data_quality_score,system_eligibility,quality_review_status,concerns,questions_to_verify,rank")
        .in("shortlist_id", shortlistIds).order("rank", { ascending: true })
    : { data: [], error: null } as any;
  if (shortlistItemsR.error) return NextResponse.json({ error: shortlistItemsR.error.message }, { status: 500 });

  const criteriaByProfile = rowsBy(criteriaR.data || [], "buyer_profile_id");
  const itemsByShortlist = rowsBy(shortlistItemsR.data || [], "shortlist_id");
  const now = new Date();
  const items = contacts.flatMap((contact: any) => {
    const profile = latestProfiles.get(String(contact.id));
    if (!profile) return [];
    const shortlist = latestShortlist.get(String(profile.id)) || null;
    const shortlistItems = shortlist ? itemsByShortlist.get(String(shortlist.id)) || [] : [];
    const profileHealth = evaluateBuyerProfileHealth({
      status: profile.status,
      budgetAmount: profile.budget_amount === null ? null : Number(profile.budget_amount),
      purchaseReadiness: profile.purchase_readiness,
      updatedAt: profile.updated_at,
    }, (criteriaByProfile.get(String(profile.id)) || []).map((row: any) => ({
      key: row.key,
      otherKey: row.other_key,
      value: row.value,
      confidence: row.confidence === null ? null : Number(row.confidence),
      customerConfirmed: row.customer_confirmed,
      approvalStatus: row.approval_status,
      active: row.active,
    })), now);
    const matchHealth = evaluateMatchQuality(shortlistItems.map((row: any) => ({
      score: Number(row.score || 0),
      dataQualityScore: Number(row.data_quality_score || 0),
      systemEligibility: row.system_eligibility,
      reviewStatus: row.quality_review_status,
      concerns: row.concerns,
      questionsToVerify: row.questions_to_verify,
    })));
    const status = combineBuyerJourneyHealth(profileHealth, matchHealth);
    return [{
      status,
      priority: status === "BLOCKED" ? "HIGH" : status === "NEEDS_ATTENTION" ? "MEDIUM" : "LOW",
      customer: {
        id: String(contact.id), name: contact.name || contact.email || "Ukjent kunde", email: contact.email || null,
        brand: contact.brand_id || contact.brand || null, pipelineStatus: contact.pipeline_status,
        pipelineValue: Number(contact.pipeline_value || 0), propertyInterest: contact.property_interest || null,
      },
      profile: {
        id: String(profile.id), version: Number(profile.version || 1), purchaseReadiness: profile.purchase_readiness,
        budgetAmount: profile.budget_amount === null ? null : Number(profile.budget_amount),
        budgetCurrency: profile.budget_currency || "EUR", summary: profile.summary || null, updatedAt: profile.updated_at,
      },
      profileHealth,
      matchHealth,
      shortlist: shortlist ? { id: String(shortlist.id), status: shortlist.status, updatedAt: shortlist.updated_at } : null,
      candidates: shortlistItems.slice(0, 5).map((row: any) => ({
        id: String(row.id), reference: row.property_reference || null, title: row.property_title || null,
        location: row.property_location || null, score: Number(row.score || 0),
        dataQualityScore: Number(row.data_quality_score || 0), reviewStatus: row.quality_review_status || "needs_review",
      })),
      profileHref: `/nexus-os/stage-readiness/profile-activation?contactId=${encodeURIComponent(String(contact.id))}`,
      customerHref: `/customers?contactId=${encodeURIComponent(String(contact.id))}`,
      reviewHref: "/nexus-os/review-console",
    }];
  }).sort((a, b) => {
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    return rank[a.priority as keyof typeof rank] - rank[b.priority as keyof typeof rank]
      || Math.min(a.profileHealth.score, a.matchHealth.score) - Math.min(b.profileHealth.score, b.matchHealth.score)
      || b.customer.pipelineValue - a.customer.pipelineValue;
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    summary: {
      activeCustomers: contacts.length,
      approvedProfiles: profiles.length,
      missingApprovedProfile: contacts.length - profiles.length,
      blocked: items.filter((item) => item.status === "BLOCKED").length,
      needsAttention: items.filter((item) => item.status === "NEEDS_ATTENTION").length,
      healthy: items.filter((item) => item.status === "HEALTHY").length,
      clientReadyCandidates: items.reduce((sum, item) => sum + item.matchHealth.clientReady, 0),
    },
    items,
    safety: { adminOnly: true, readOnly: true, profileWritten: false, matchExecuted: false, customerMessageSent: false },
  });
}
