import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { asRecord, describeFreddyReview, sortFreddyReviews } from "@/lib/nexus/review-console";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function strings(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit) : [];
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reviewHref(kind: string, rowId: string, contactId: string, brandId: string, buyerProfileId: string) {
  if (kind === "final_send") return `/nexus-os/presentation-review?workItemId=${encodeURIComponent(rowId)}`;
  if (kind === "shortlist") return `/nexus-os/shortlist-review?workItemId=${encodeURIComponent(rowId)}`;
  if (kind === "buyer_criteria") {
    const params = new URLSearchParams({ reviewId: rowId });
    if (brandId) params.set("brand", brandId);
    if (buyerProfileId) params.set("buyerProfileId", buyerProfileId);
    if (contactId) params.set("contactId", contactId);
    return `/nexus-os/buyer-criteria-review?${params.toString()}`;
  }
  if (kind === "buyer_intake") return "/nexus-os/buyer-intake/reviews";
  return contactId ? `/customers/${encodeURIComponent(contactId)}` : "/nexus-os/inbox";
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const limit = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get("limit") || 50)));
  const work = await supabase
    .from("work_items")
    .select("id,title,status,priority,brand_id,source_type,next_action,metadata,created_at,updated_at")
    .in("status", OPEN_STATUSES)
    .order("updated_at", { ascending: true })
    .limit(500);
  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });

  const described = sortFreddyReviews((work.data || []).flatMap((row) => {
    const descriptor = describeFreddyReview({
      id: String(row.id),
      sourceType: row.source_type,
      title: row.title,
      priority: row.priority,
      metadata: row.metadata,
      updatedAt: row.updated_at,
    });
    return descriptor ? [{ row, descriptor, priority: descriptor.priority, updatedAt: descriptor.updatedAt }] : [];
  })).slice(0, limit);

  const metadataFor = (entry: typeof described[number]) => asRecord(entry.row.metadata);
  const contactIds = [...new Set(described.map((entry) => String(metadataFor(entry).contact_id || "")).filter(Boolean))];
  const explicitProfileIds = [...new Set(described.map((entry) => String(metadataFor(entry).buyer_profile_id || "")).filter(Boolean))];
  const shortlistIds = [...new Set(described.map((entry) => String(metadataFor(entry).shortlist_id || "")).filter(Boolean))];
  const presentationIds = [...new Set(described.map((entry) => String(metadataFor(entry).presentation_id || "")).filter(Boolean))];
  const draftIds = [...new Set(described.map((entry) => String(metadataFor(entry).presentation_message_draft_id || "")).filter(Boolean))];

  const [contacts, explicitProfiles, contactProfiles, shortlistItems, presentations, drafts] = await Promise.all([
    contactIds.length ? supabase.from("contacts").select("id,name,email,pipeline_status,property_interest,pipeline_value").in("id", contactIds) : Promise.resolve({ data: [], error: null }),
    explicitProfileIds.length ? supabase.from("buyer_profiles").select("id,contact_id,brand,status,version,purchase_readiness,budget_amount,budget_currency,summary,updated_at").in("id", explicitProfileIds) : Promise.resolve({ data: [], error: null }),
    contactIds.length ? supabase.from("buyer_profiles").select("id,contact_id,brand,status,version,purchase_readiness,budget_amount,budget_currency,summary,updated_at").in("contact_id", contactIds).eq("status", "approved").order("version", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    shortlistIds.length ? supabase.from("lead_property_shortlist_items").select("id,shortlist_id,brand,property_id,property_reference,property_title,property_location,property_price,rank,score,data_quality_score,reasons,concerns,questions_to_verify,quality_review_status,quality_review_note,property_public_url").in("shortlist_id", shortlistIds).order("rank", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    presentationIds.length ? supabase.from("lead_customer_presentations").select("id,status,title,presentation_json,updated_at").in("id", presentationIds) : Promise.resolve({ data: [], error: null }),
    draftIds.length ? supabase.from("lead_customer_message_drafts").select("id,status,subject,body_text,language,approved_by,approved_at,sent_at,cancelled_at,updated_at").in("id", draftIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const loadError = contacts.error || explicitProfiles.error || contactProfiles.error || shortlistItems.error || presentations.error || drafts.error;
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

  const contactMap = new Map((contacts.data || []).map((row) => [String(row.id), row]));
  const profiles = [...(explicitProfiles.data || []), ...(contactProfiles.data || [])];
  const profileMap = new Map<string, typeof profiles[number]>();
  for (const profile of profiles) {
    profileMap.set(String(profile.id), profile);
    const key = `${profile.contact_id || ""}::${profile.brand || ""}`;
    if (!profileMap.has(key)) profileMap.set(key, profile);
  }
  const profileIds = [...new Set(profiles.map((profile) => String(profile.id)).filter(Boolean))];
  const criteria = profileIds.length
    ? await supabase.from("buyer_profile_criteria").select("buyer_profile_id,criterion_type,key,other_key,value,source_text,confidence,customer_confirmed").in("buyer_profile_id", profileIds).eq("active", true)
    : { data: [], error: null };
  if (criteria.error) return NextResponse.json({ error: criteria.error.message }, { status: 500 });

  const criteriaMap = new Map<string, Array<Record<string, unknown>>>();
  for (const criterion of criteria.data || []) {
    const profileId = String(criterion.buyer_profile_id || "");
    const list = criteriaMap.get(profileId) || [];
    list.push(criterion as Record<string, unknown>);
    criteriaMap.set(profileId, list);
  }
  const shortlistMap = new Map<string, Array<Record<string, unknown>>>();
  for (const shortlistItem of shortlistItems.data || []) {
    const shortlistId = String(shortlistItem.shortlist_id || "");
    const list = shortlistMap.get(shortlistId) || [];
    list.push(shortlistItem as Record<string, unknown>);
    shortlistMap.set(shortlistId, list);
  }
  const presentationMap = new Map((presentations.data || []).map((row) => [String(row.id), row]));
  const draftMap = new Map((drafts.data || []).map((row) => [String(row.id), row]));

  const items = sortFreddyReviews(described.map(({ row, descriptor }) => {
    const metadata = asRecord(row.metadata);
    const contactId = String(metadata.contact_id || "");
    const brandId = String(row.brand_id || "");
    const explicitProfileId = String(metadata.buyer_profile_id || "");
    const profile = profileMap.get(explicitProfileId) || profileMap.get(`${contactId}::${brandId}`) || null;
    const profileId = String(profile?.id || explicitProfileId || "");
    const contact = contactMap.get(contactId) || null;
    const shortlistId = String(metadata.shortlist_id || "");
    const candidates = (shortlistMap.get(shortlistId) || []).filter((candidate) => !brandId || String(candidate.brand || "") === brandId);
    const presentation = presentationMap.get(String(metadata.presentation_id || "")) || null;
    const draft = draftMap.get(String(metadata.presentation_message_draft_id || "")) || null;
    const blockers = strings(metadata.send_preflight_blockers, 20);
    const warnings = strings(metadata.send_preflight_warnings, 20);
    const criteriaRows = criteriaMap.get(profileId) || [];
    const policy = descriptor.kind === "final_send"
      ? { actionType: "property_recommendation_send_preapproved", policyClass: "AUTO_SAFE", status: String(metadata.send_preflight_status || "AWAITING_APPROVAL"), ready: metadata.send_preflight_ready === true, blockers, warnings, requiresFreshPreflight: true }
      : descriptor.kind === "no_match"
        ? { actionType: "criteria_clarification_email", policyClass: "AUTO_SAFE", status: "HUMAN_REVIEW", ready: false, blockers: ["Kunden kan bare kontaktes via den smale avklaringsflyten med fersk suppression- og senderkontroll."], warnings: [], requiresFreshPreflight: true }
        : { actionType: "internal_review", policyClass: "HUMAN_REQUIRED", status: "DECISION_REQUIRED", ready: false, blockers: [], warnings: [], requiresFreshPreflight: false };

    return {
      ...descriptor,
      brandId,
      nextAction: String(row.next_action || descriptor.recommendation),
      reviewHref: reviewHref(descriptor.kind, String(row.id), contactId, brandId, profileId),
      customer: contact ? { id: contactId, name: contact.name || null, email: contact.email || null, pipelineStatus: contact.pipeline_status || null, propertyInterest: contact.property_interest || null, pipelineValue: numberOrNull(contact.pipeline_value) } : { id: contactId || null, name: null, email: null, pipelineStatus: null, propertyInterest: null, pipelineValue: null },
      buyerProfile: profile ? { id: String(profile.id), status: profile.status, version: Number(profile.version || 1), purchaseReadiness: profile.purchase_readiness || null, budgetAmount: numberOrNull(profile.budget_amount), budgetCurrency: profile.budget_currency || "EUR", summary: profile.summary || null, criteria: criteriaRows.slice(0, 20).map((criterion) => ({ type: criterion.criterion_type, key: criterion.other_key || criterion.key, value: criterion.value, sourceText: criterion.source_text || null, confidence: numberOrNull(criterion.confidence), customerConfirmed: criterion.customer_confirmed === true })) } : null,
      match: { analyzed: Number(metadata.property_match_analyzed || 0), status: String(metadata.property_match_status || (candidates.length ? "SHORTLIST_REVIEW" : "NOT_AVAILABLE")), bestScore: candidates.length ? Math.max(...candidates.map((candidate) => Number(candidate.score || 0))) : null },
      shortlist: candidates.map((candidate) => ({ id: String(candidate.id), propertyId: String(candidate.property_id || ""), reference: candidate.property_reference || null, title: candidate.property_title || null, location: candidate.property_location || null, price: numberOrNull(candidate.property_price), rank: Number(candidate.rank || 0), score: Number(candidate.score || 0), dataQualityScore: Number(candidate.data_quality_score || 0), reasons: strings(candidate.reasons), concerns: strings(candidate.concerns), questionsToVerify: strings(candidate.questions_to_verify), reviewStatus: candidate.quality_review_status || "needs_review", reviewNote: candidate.quality_review_note || null, publicUrl: candidate.property_public_url || null })),
      presentation: presentation ? { id: String(presentation.id), status: presentation.status, title: presentation.title, content: presentation.presentation_json } : null,
      draft: draft ? { id: String(draft.id), status: draft.status, subject: draft.subject, bodyText: draft.body_text, language: draft.language, approvedBy: draft.approved_by, approvedAt: draft.approved_at, sentAt: draft.sent_at, cancelledAt: draft.cancelled_at } : null,
      policy,
      replyPreview: String(metadata.human_interpretation_reply_preview || "").trim().slice(0, 500) || null,
      noMatchCriteria: strings(metadata.no_match_current_criteria),
    };
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: items.length,
      highPriority: items.filter((item) => item.priority === "HIGH").length,
      finalSend: items.filter((item) => item.kind === "final_send").length,
      blocked: items.filter((item) => item.policy.blockers.length > 0).length,
    },
    items,
    safety: { adminOnly: true, directProviderSend: false, approvalRunsPreflight: true, auditRequired: true },
  });
}
