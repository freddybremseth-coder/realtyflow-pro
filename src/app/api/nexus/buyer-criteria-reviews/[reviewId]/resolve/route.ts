import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ParamsSchema = z.object({ reviewId: z.string().uuid() });
const BodySchema = z.object({ buyerProfileId: z.string().uuid() }).strict();
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const parsedParams = ParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid review id" }, { status: 400 });

  const parsedBody = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "Invalid buyer profile id" }, { status: 400 });

  const review = await supabase
    .from("work_items")
    .select("id,status,brand_id,source_type,source_id,assigned_agent,next_action,metadata")
    .eq("id", parsedParams.data.reviewId)
    .eq("source_type", "ai_agent")
    .eq("assigned_agent", "nexus_buyer_intelligence")
    .in("status", OPEN_STATUSES)
    .maybeSingle();
  if (review.error) return NextResponse.json({ error: review.error.message }, { status: 500 });
  if (!review.data) return NextResponse.json({ error: "Open buyer criteria review not found" }, { status: 404 });

  const reviewMetadata = record(review.data.metadata);
  if (reviewMetadata.kind !== "buyer_profile_email_review" || reviewMetadata.requires_human_interpretation !== true) {
    return NextResponse.json({ error: "Review is not awaiting human interpretation" }, { status: 409 });
  }

  const contactId = String(reviewMetadata.contact_id || "");
  const sourceWorkItemId = String(reviewMetadata.source_work_item_id || "");
  const brandId = String(review.data.brand_id || "");
  if (!contactId || !sourceWorkItemId || !brandId) {
    return NextResponse.json({ error: "Review is missing CRM linkage" }, { status: 409 });
  }

  const profile = await supabase
    .from("buyer_profiles")
    .select("id,contact_id,brand,status,version")
    .eq("id", parsedBody.data.buyerProfileId)
    .maybeSingle();
  if (profile.error) return NextResponse.json({ error: profile.error.message }, { status: 500 });
  if (!profile.data) return NextResponse.json({ error: "Buyer Profile not found" }, { status: 404 });

  if (String(profile.data.contact_id || "") !== contactId || String(profile.data.brand || "") !== brandId) {
    return NextResponse.json({ error: "Buyer Profile does not belong to this customer and brand" }, { status: 409 });
  }
  if (String(profile.data.status || "").toLowerCase() !== "approved") {
    return NextResponse.json({ error: "Buyer Profile must be approved before resolving review" }, { status: 409 });
  }

  const sourceWork = await supabase
    .from("work_items")
    .select("id,status,source_type,metadata,next_action")
    .eq("id", sourceWorkItemId)
    .eq("source_type", "crm")
    .maybeSingle();
  if (sourceWork.error) return NextResponse.json({ error: sourceWork.error.message }, { status: 500 });
  if (!sourceWork.data) return NextResponse.json({ error: "Source CRM work item not found" }, { status: 409 });

  const now = new Date().toISOString();
  const sourceMetadata = record(sourceWork.data.metadata);
  const nextSourceMetadata: Record<string, unknown> = {
    ...sourceMetadata,
    buyer_profile_id: String(profile.data.id),
    buyer_profile_status: "APPROVED",
    buyer_profile_sync_status: "human_interpretation_resolved",
    buyer_profile_review_required: false,
    buyer_profile_revision_required: false,
    buyer_profile_human_resolved_at: now,
    buyer_profile_human_resolved_by: "Freddy via Nexus Buyer Criteria",
    buyer_profile_revision_version: profile.data.version,
  };

  // Force the property matching worker to use the newly approved profile version.
  delete nextSourceMetadata.property_match_prepared_at;
  delete nextSourceMetadata.property_match_prepared_by;
  delete nextSourceMetadata.property_match_status;
  delete nextSourceMetadata.property_match_analyzed;
  delete nextSourceMetadata.property_match_count;
  delete nextSourceMetadata.property_match_candidates;

  const sourceUpdate = await supabase
    .from("work_items")
    .update({
      metadata: nextSourceMetadata,
      next_action: "Søkekriteriene er tolket og lagret som godkjent Buyer Profile. Nexus kjører automatisk ny boligmatching på neste matching-runde.",
      updated_at: now,
    })
    .eq("id", sourceWorkItemId);
  if (sourceUpdate.error) return NextResponse.json({ error: sourceUpdate.error.message }, { status: 500 });

  const nextReviewMetadata = {
    ...reviewMetadata,
    requires_human_interpretation: false,
    human_interpretation_resolved_at: now,
    human_interpretation_resolved_by: "Freddy via Nexus Buyer Criteria",
    human_interpretation_buyer_profile_id: String(profile.data.id),
    human_interpretation_buyer_profile_version: profile.data.version,
    confirmation_outcome: "human_interpretation_resolved",
  };
  const reviewUpdate = await supabase
    .from("work_items")
    .update({
      status: "DONE",
      metadata: nextReviewMetadata,
      next_action: "Tolkning fullført. Nexus fortsetter automatisk med boligmatching.",
      updated_at: now,
    })
    .eq("id", parsedParams.data.reviewId);
  if (reviewUpdate.error) return NextResponse.json({ error: reviewUpdate.error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    reviewId: parsedParams.data.reviewId,
    contactId,
    buyerProfileId: String(profile.data.id),
    buyerProfileVersion: profile.data.version,
    matchingWillRun: true,
    matchingCadence: "next nexus-property-match-prep cycle",
  });
}
