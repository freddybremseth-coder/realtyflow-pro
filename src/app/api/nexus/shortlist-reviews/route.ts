import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const REVIEW_STATUSES = new Set(["client_ready", "needs_review", "rejected", "ask_agent", "verify_price_availability"]);

type ShortlistReviewDecision = {
  itemId: string;
  status: string;
  note: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const workItemId = String(request.nextUrl.searchParams.get("workItemId") || "").trim();
  const limit = Math.max(1, Math.min(50, Number(request.nextUrl.searchParams.get("limit") || 25)));
  let query = supabase
    .from("work_items")
    .select("id,title,status,priority,brand_id,next_action,metadata,created_at,updated_at")
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .eq("metadata->>shortlist_review_required", "true");
  if (workItemId) query = query.eq("id", workItemId);
  const work = await query.order("updated_at", { ascending: false }).limit(limit);
  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });

  const rows = work.data || [];
  const contactIds = [...new Set(rows.map((row) => String(record(row.metadata).contact_id || "")).filter(Boolean))];
  const shortlistIds = [...new Set(rows.map((row) => String(record(row.metadata).shortlist_id || "")).filter(Boolean))];
  const contactMap = new Map<string, { name: string | null; email: string | null }>();
  const itemMap = new Map<string, Array<Record<string, unknown>>>();

  if (contactIds.length) {
    const contacts = await supabase.from("contacts").select("id,name,email").in("id", contactIds);
    if (contacts.error) return NextResponse.json({ error: contacts.error.message }, { status: 500 });
    for (const contact of contacts.data || []) {
      contactMap.set(String(contact.id), { name: contact.name || null, email: contact.email || null });
    }
  }

  if (shortlistIds.length) {
    const shortlistItems = await supabase
      .from("lead_property_shortlist_items")
      .select("id,shortlist_id,brand,property_id,property_reference,property_title,property_location,property_price,property_bedrooms,property_bathrooms,property_primary_image_url,property_public_url,rank,decision,system_eligibility,score,data_quality_score,reasons,concerns,questions_to_verify,quality_review_status,quality_review_note")
      .in("shortlist_id", shortlistIds)
      .order("rank", { ascending: true });
    if (shortlistItems.error) return NextResponse.json({ error: shortlistItems.error.message }, { status: 500 });
    for (const item of shortlistItems.data || []) {
      const shortlistId = String(item.shortlist_id || "");
      const list = itemMap.get(shortlistId) || [];
      list.push(item as Record<string, unknown>);
      itemMap.set(shortlistId, list);
    }
  }

  const items = rows.map((row) => {
    const metadata = record(row.metadata);
    const contactId = String(metadata.contact_id || "");
    const shortlistId = String(metadata.shortlist_id || "");
    const contact = contactMap.get(contactId) || null;
    const candidates = (itemMap.get(shortlistId) || []).filter((item) => String(item.brand || "") === String(row.brand_id || ""));
    return {
      id: String(row.id),
      title: String(row.title || "Shortlist trenger review"),
      priority: String(row.priority || "HIGH").toUpperCase(),
      brandId: String(row.brand_id || ""),
      contactId,
      customerName: contact?.name || null,
      customerEmail: contact?.email || null,
      buyerProfileId: String(metadata.buyer_profile_id || "") || null,
      shortlistId,
      nextAction: String(row.next_action || "Kontroller kandidatene og marker hvilke boliger som er klare for kunden."),
      updatedAt: row.updated_at,
      reviewHref: `/nexus-os/shortlist-review?workItemId=${encodeURIComponent(String(row.id))}`,
      candidates: candidates.map((item) => ({
        id: String(item.id),
        propertyId: String(item.property_id || ""),
        reference: item.property_reference || null,
        title: item.property_title || null,
        location: item.property_location || null,
        price: item.property_price === null ? null : Number(item.property_price),
        bedrooms: item.property_bedrooms === null ? null : Number(item.property_bedrooms),
        bathrooms: item.property_bathrooms === null ? null : Number(item.property_bathrooms),
        imageUrl: item.property_primary_image_url || null,
        publicUrl: item.property_public_url || null,
        rank: Number(item.rank || 0),
        eligibility: item.system_eligibility || null,
        score: Number(item.score || 0),
        dataQualityScore: Number(item.data_quality_score || 0),
        reasons: Array.isArray(item.reasons) ? item.reasons : [],
        concerns: Array.isArray(item.concerns) ? item.concerns : [],
        questionsToVerify: Array.isArray(item.questions_to_verify) ? item.questions_to_verify : [],
        qualityReviewStatus: item.quality_review_status || "needs_review",
        qualityReviewNote: item.quality_review_note || null,
      })),
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: { total: items.length, candidates: items.reduce((sum, item) => sum + item.candidates.length, 0) },
    items,
    safety: { customerMessageSent: false, presentationPublished: false },
  });
}

export async function POST(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return NextResponse.json({ error: "Admin session required" }, { status: 401 });
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const workItemId = typeof body?.workItemId === "string" ? body.workItemId.trim() : "";
  const reviews: unknown[] = Array.isArray(body?.reviews) ? body.reviews : [];
  if (!workItemId || reviews.length === 0 || reviews.length > 10) {
    return NextResponse.json({ error: "Invalid shortlist review request" }, { status: 400 });
  }

  const work = await supabase
    .from("work_items")
    .select("id,brand_id,status,metadata")
    .eq("id", workItemId)
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .maybeSingle();
  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });
  if (!work.data) return NextResponse.json({ error: "Review work item not found" }, { status: 404 });

  const metadata = record(work.data.metadata);
  if (metadata.shortlist_review_required !== true && String(metadata.shortlist_review_required) !== "true") {
    return NextResponse.json({ error: "Shortlist is not awaiting human review" }, { status: 409 });
  }
  const shortlistId = String(metadata.shortlist_id || "");
  const brandId = String(work.data.brand_id || "");
  if (!shortlistId || !brandId) return NextResponse.json({ error: "Shortlist review context is incomplete" }, { status: 409 });

  const existing = await supabase
    .from("lead_property_shortlist_items")
    .select("id")
    .eq("shortlist_id", shortlistId)
    .eq("brand", brandId);
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  const allowedIds = new Set((existing.data || []).map((item) => String(item.id)));

  const normalized: ShortlistReviewDecision[] = reviews.map((review: unknown): ShortlistReviewDecision => {
    const value = record(review);
    return {
      itemId: String(value.itemId || ""),
      status: String(value.status || ""),
      note: typeof value.note === "string" ? value.note.trim().slice(0, 1000) : null,
    };
  });
  const submittedIds = new Set(normalized.map((review: ShortlistReviewDecision) => review.itemId));
  if (
    normalized.some((review: ShortlistReviewDecision) => !allowedIds.has(review.itemId) || !REVIEW_STATUSES.has(review.status)) ||
    submittedIds.size !== normalized.length ||
    submittedIds.size !== allowedIds.size
  ) {
    return NextResponse.json({ error: "All shortlist candidates must receive one valid review decision" }, { status: 400 });
  }

  const checkedAt = new Date().toISOString();
  for (const review of normalized) {
    const update = await supabase
      .from("lead_property_shortlist_items")
      .update({
        quality_review_status: review.status,
        quality_review_note: review.note,
        quality_review_checked_at: checkedAt,
        quality_review_checked_by: context.email,
      })
      .eq("id", review.itemId)
      .eq("shortlist_id", shortlistId)
      .eq("brand", brandId);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  }

  const refreshed = await supabase
    .from("lead_property_shortlist_items")
    .select("id,quality_review_status")
    .eq("shortlist_id", shortlistId)
    .eq("brand", brandId);
  if (refreshed.error) return NextResponse.json({ error: refreshed.error.message }, { status: 500 });
  const clientReadyCount = (refreshed.data || []).filter((item) => item.quality_review_status === "client_ready").length;
  const unresolvedCount = (refreshed.data || []).filter((item) => item.quality_review_status === "needs_review").length;
  const reviewComplete = unresolvedCount === 0;
  const presentationWillPrepareAutomatically = reviewComplete && clientReadyCount > 0;

  const nextMetadata = {
    ...metadata,
    shortlist_human_review_at: checkedAt,
    shortlist_human_review_by: context.email,
    shortlist_human_review_complete: reviewComplete,
    shortlist_client_ready_count: clientReadyCount,
    shortlist_unresolved_count: unresolvedCount,
    shortlist_review_required: !reviewComplete,
  };
  const nextAction = !reviewComplete
    ? `Shortlist-review er lagret, men ${unresolvedCount} kandidat${unresolvedCount === 1 ? "" : "er"} står fortsatt som må vurderes. Fullfør review før Nexus går videre.`
    : clientReadyCount > 0
      ? `Du har markert ${clientReadyCount} bolig${clientReadyCount === 1 ? "" : "er"} klar for kunde. Nexus lager presentasjon og e-postutkast automatisk.`
      : "Shortlist-review er komplett, men ingen bolig er markert klar for kunde. Nexus sender ingenting; vurder nye kandidater eller nytt søk.";
  const workUpdate = await supabase
    .from("work_items")
    .update({ metadata: nextMetadata, next_action: nextAction, updated_at: checkedAt })
    .eq("id", workItemId);
  if (workUpdate.error) return NextResponse.json({ error: workUpdate.error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    workItemId,
    shortlistId,
    clientReadyCount,
    unresolvedCount,
    reviewComplete,
    presentationWillPrepareAutomatically,
    safety: { customerMessageSent: false, presentationPublished: false },
  });
}
