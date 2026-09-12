import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { buildPropertyRecommendationTemplate } from "@/services/email/property-recommendation-template";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
  let query = supabase
    .from("work_items")
    .select("id,title,priority,brand_id,next_action,metadata,updated_at")
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .eq("metadata->>presentation_review_required", "true");
  if (workItemId) query = query.eq("id", workItemId);
  const work = await query.order("updated_at", { ascending: false }).limit(50);
  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });

  const rows = work.data || [];
  const presentationIds = [...new Set(rows.map((row) => String(record(row.metadata).presentation_id || "")).filter(Boolean))];
  const draftIds = [...new Set(rows.map((row) => String(record(row.metadata).presentation_message_draft_id || "")).filter(Boolean))];
  const contactIds = [...new Set(rows.map((row) => String(record(row.metadata).contact_id || "")).filter(Boolean))];

  const [presentations, drafts, contacts] = await Promise.all([
    presentationIds.length
      ? supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,presentation_json,created_at,updated_at").in("id", presentationIds)
      : Promise.resolve({ data: [], error: null }),
    draftIds.length
      ? supabase.from("lead_customer_message_drafts").select("id,brand,presentation_id,buyer_profile_id,shortlist_id,status,subject,body_text,body_html,language,approved_by,approved_at,created_at,updated_at").in("id", draftIds)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length
      ? supabase.from("contacts").select("id,name,email").in("id", contactIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (presentations.error || drafts.error || contacts.error) {
    return NextResponse.json({ error: presentations.error?.message || drafts.error?.message || contacts.error?.message || "Review data could not be loaded" }, { status: 500 });
  }

  const presentationMap = new Map((presentations.data || []).map((row) => [String(row.id), row]));
  const draftMap = new Map((drafts.data || []).map((row) => [String(row.id), row]));
  const contactMap = new Map((contacts.data || []).map((row) => [String(row.id), row]));

  const items = rows.map((row) => {
    const metadata = record(row.metadata);
    const presentationId = String(metadata.presentation_id || "");
    const messageDraftId = String(metadata.presentation_message_draft_id || "");
    const contactId = String(metadata.contact_id || "");
    const presentation = presentationMap.get(presentationId) || null;
    const draft = draftMap.get(messageDraftId) || null;
    const contact = contactMap.get(contactId) || null;
    const template = presentation
      ? buildPropertyRecommendationTemplate({ brandId: String(row.brand_id || ""), customerName: contact?.name || null, presentationJson: presentation.presentation_json })
      : null;
    const hasCustomerTemplate = Boolean(template && template.propertyCount > 0);
    return {
      id: String(row.id),
      priority: String(row.priority || "HIGH").toUpperCase(),
      brandId: String(row.brand_id || ""),
      customerName: contact?.name || null,
      customerEmail: contact?.email || null,
      contactId: contactId || null,
      buyerProfileId: String(metadata.buyer_profile_id || "") || null,
      shortlistId: String(metadata.shortlist_id || "") || null,
      presentationId: presentationId || null,
      messageDraftId: messageDraftId || null,
      presentation: presentation ? {
        status: presentation.status,
        title: presentation.title,
        content: presentation.presentation_json,
      } : null,
      messageDraft: draft ? {
        status: draft.status,
        subject: hasCustomerTemplate ? template!.subject : draft.subject,
        bodyText: hasCustomerTemplate ? template!.bodyText : draft.body_text,
        bodyHtml: hasCustomerTemplate ? template!.bodyHtml : draft.body_html,
        language: draft.language,
        approvedBy: draft.approved_by,
        approvedAt: draft.approved_at,
      } : null,
      customerTemplatePropertyCount: hasCustomerTemplate ? template!.propertyCount : 0,
      customerTemplateAreas: hasCustomerTemplate ? template!.areas : [],
      nextAction: String(row.next_action || "Kontroller sluttresultatet før eventuell utsending."),
      reviewHref: `/nexus-os/presentation-review?workItemId=${encodeURIComponent(String(row.id))}`,
      updatedAt: row.updated_at,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: { total: items.length },
    items,
    safety: { customerMessageSent: false, presentationPublished: false, explicitApprovalRequired: true, approvedRecommendationsAutoSendAfterFreshPreflight: true },
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
  if (!workItemId || body?.explicitApproval !== true) {
    return NextResponse.json({ error: "Explicit final-review approval is required" }, { status: 400 });
  }

  const work = await supabase
    .from("work_items")
    .select("id,brand_id,status,metadata")
    .eq("id", workItemId)
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .maybeSingle();
  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });
  if (!work.data) return NextResponse.json({ error: "Presentation review work item not found" }, { status: 404 });

  const metadata = record(work.data.metadata);
  if (metadata.presentation_review_required !== true && String(metadata.presentation_review_required) !== "true") {
    return NextResponse.json({ error: "Presentation is not awaiting final review" }, { status: 409 });
  }
  if (metadata.shortlist_human_review_complete !== true) {
    return NextResponse.json({ error: "Shortlist human review must be complete first" }, { status: 409 });
  }

  const brandId = String(work.data.brand_id || "");
  const buyerProfileId = String(metadata.buyer_profile_id || "");
  const shortlistId = String(metadata.shortlist_id || "");
  const presentationId = String(metadata.presentation_id || "");
  const messageDraftId = String(metadata.presentation_message_draft_id || "");
  if (!brandId || !buyerProfileId || !shortlistId || !presentationId || !messageDraftId) {
    return NextResponse.json({ error: "Presentation review context is incomplete" }, { status: 409 });
  }

  const [profile, shortlist, presentation, draft, shortlistItems] = await Promise.all([
    supabase.from("buyer_profiles").select("id,brand,status,contact_id").eq("id", buyerProfileId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,approved_by,approved_at").eq("id", shortlistId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,approved_by,approved_at,presentation_json").eq("id", presentationId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_customer_message_drafts").select("id,brand,presentation_id,buyer_profile_id,shortlist_id,status,subject,body_text,body_html,approved_by,approved_at,sent_at,cancelled_at").eq("id", messageDraftId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_property_shortlist_items").select("id,quality_review_status").eq("shortlist_id", shortlistId).eq("brand", brandId),
  ]);
  const firstError = profile.error || shortlist.error || presentation.error || draft.error || shortlistItems.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
  if (!profile.data || !shortlist.data || !presentation.data || !draft.data) {
    return NextResponse.json({ error: "Final-review dependencies are missing" }, { status: 409 });
  }
  if (String(profile.data.status).toLowerCase() !== "approved") {
    return NextResponse.json({ error: "Buyer Profile must be approved" }, { status: 409 });
  }
  if (String(shortlist.data.buyer_profile_id) !== buyerProfileId
    || String(presentation.data.buyer_profile_id) !== buyerProfileId
    || String(presentation.data.shortlist_id) !== shortlistId
    || String(draft.data.buyer_profile_id) !== buyerProfileId
    || String(draft.data.shortlist_id) !== shortlistId
    || String(draft.data.presentation_id) !== presentationId) {
    return NextResponse.json({ error: "Final-review dependency mismatch" }, { status: 409 });
  }
  if (draft.data.sent_at || draft.data.cancelled_at || String(draft.data.status).toLowerCase() === "cancelled" || String(draft.data.status).toLowerCase() === "sent") {
    return NextResponse.json({ error: "Message draft is no longer eligible for approval" }, { status: 409 });
  }

  const reviewStates = (shortlistItems.data || []).map((item) => String(item.quality_review_status || "needs_review"));
  if (!reviewStates.length || reviewStates.some((status) => status === "needs_review") || !reviewStates.includes("client_ready")) {
    return NextResponse.json({ error: "Every shortlist candidate must have a final review decision and at least one must be client-ready" }, { status: 409 });
  }

  const contactResult = profile.data.contact_id
    ? await supabase.from("contacts").select("id,name,email").eq("id", profile.data.contact_id).maybeSingle()
    : { data: null, error: null };
  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  if (!contactResult.data?.email) return NextResponse.json({ error: "Customer email is missing" }, { status: 409 });

  const template = buildPropertyRecommendationTemplate({
    brandId,
    customerName: contactResult.data.name,
    presentationJson: presentation.data.presentation_json,
  });
  if (template.propertyCount < 1) {
    return NextResponse.json({ error: "No customer-safe property with a verified public link is available" }, { status: 409 });
  }

  const approvedAt = new Date().toISOString();
  const actor = context.email;

  if (String(shortlist.data.status).toLowerCase() === "draft") {
    const update = await supabase.from("lead_property_shortlists")
      .update({ status: "approved", approved_by: actor, approved_at: approvedAt, archived_at: null, updated_at: approvedAt })
      .eq("id", shortlistId).eq("brand", brandId).eq("status", "draft");
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  } else if (String(shortlist.data.status).toLowerCase() !== "approved") {
    return NextResponse.json({ error: "Shortlist is not approvable" }, { status: 409 });
  }

  if (String(presentation.data.status).toLowerCase() === "draft") {
    const update = await supabase.from("lead_customer_presentations")
      .update({ status: "approved", approved_by: actor, approved_at: approvedAt, archived_at: null, updated_at: approvedAt })
      .eq("id", presentationId).eq("brand", brandId).eq("status", "draft");
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  } else if (String(presentation.data.status).toLowerCase() !== "approved") {
    return NextResponse.json({ error: "Presentation is not approvable" }, { status: 409 });
  }

  if (String(draft.data.status).toLowerCase() === "draft") {
    const update = await supabase.from("lead_customer_message_drafts")
      .update({ status: "approved", subject: template.subject, body_text: template.bodyText, body_html: template.bodyHtml, approved_by: actor, approved_at: approvedAt, sent_at: null, cancelled_at: null, updated_at: approvedAt })
      .eq("id", messageDraftId).eq("brand", brandId).eq("status", "draft");
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  } else if (String(draft.data.status).toLowerCase() === "approved") {
    if (String(draft.data.subject || "") !== template.subject || String(draft.data.body_text || "") !== template.bodyText) {
      return NextResponse.json({ error: "Approved message draft no longer matches the current customer template; manual review is required" }, { status: 409 });
    }
  } else {
    return NextResponse.json({ error: "Message draft is not approvable" }, { status: 409 });
  }

  const nextMetadata = {
    ...metadata,
    presentation_review_required: false,
    presentation_human_approved_at: approvedAt,
    presentation_human_approved_by: actor,
    presentation_send_preflight_required: true,
    presentation_customer_send_allowed: false,
    property_recommendation_auto_send_authorized: true,
    property_recommendation_auto_send_authorized_at: approvedAt,
    property_recommendation_auto_send_authorized_by: actor,
    property_recommendation_template_version: "matched-property-rich-v1",
    property_recommendation_property_count: template.propertyCount,
    property_recommendation_areas: template.areas,
    presentation_final_review_status: "APPROVED_FOR_PREFLIGHT",
  };
  const workUpdate = await supabase.from("work_items")
    .update({
      metadata: nextMetadata,
      next_action: "Sluttresultatet er godkjent. Send-preflight kjøres automatisk; når den er grønn sendes de godkjente boligforslagene til kunden automatisk.",
      updated_at: approvedAt,
    })
    .eq("id", workItemId);
  if (workUpdate.error) return NextResponse.json({ error: workUpdate.error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    workItemId,
    shortlistId,
    presentationId,
    messageDraftId,
    status: "APPROVED_FOR_PREFLIGHT",
    propertyCount: template.propertyCount,
    areas: template.areas,
    safety: { customerMessageSent: false, presentationPublished: false, automaticSendAfterFreshPreflight: true },
  });
}
