import { NextRequest, NextResponse } from "next/server";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { isLeadIntelligencePropertyMatchingEnabled } from "@/services/lead-intelligence/feature-flags";
import {
  LeadCustomerPresentationDraftHistoryQuerySchema,
  LeadCustomerPresentationDraftRequestSchema,
  LeadCustomerPresentationDraftLookupQuerySchema,
  saveLeadCustomerPresentationDraft,
} from "@/services/lead-intelligence/presentation";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceQuery,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type QueryClientLike = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

type ReviewQueueContext = {
  contactId: string;
  customerName: string | null;
  customerEmail: string;
  shortlistItemCount: number;
  clientReadyCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function validateManualPresentationReviewContext(input: {
  client: QueryClientLike;
  brand: string;
  buyerProfileId: string;
  shortlistId: string;
}): Promise<ReviewQueueContext> {
  const profileResult = await input.client.query<{
    id: string;
    status: string;
    contact_id: string | null;
    customer_name: string | null;
    customer_email: string | null;
  }>(
    `select bp.id::text,
            bp.status,
            bp.contact_id::text,
            contact.name as customer_name,
            contact.email as customer_email
       from public.buyer_profiles bp
       left join public.contacts contact on contact.id = bp.contact_id
      where bp.id = $1::uuid
        and bp.brand = $2
      limit 1`,
    [input.buyerProfileId, input.brand],
  );
  const profile = profileResult.rows[0];
  if (!profile || String(profile.status).toLowerCase() !== "approved" || !profile.contact_id) {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Buyer Profile must be approved and linked to a CRM customer before final review", 409);
  }
  const customerEmail = String(profile.customer_email || "").trim();
  if (!customerEmail) {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Customer email is required before a presentation can enter final review", 409);
  }

  const shortlistResult = await input.client.query<{ id: string; buyer_profile_id: string; status: string }>(
    `select id::text, buyer_profile_id::text, status
       from public.lead_property_shortlists
      where id = $1::uuid
        and brand = $2
      limit 1`,
    [input.shortlistId, input.brand],
  );
  const shortlist = shortlistResult.rows[0];
  if (!shortlist || shortlist.buyer_profile_id !== input.buyerProfileId) {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Shortlist does not belong to the approved Buyer Profile", 409);
  }
  if (!["draft", "approved"].includes(String(shortlist.status).toLowerCase())) {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Shortlist is not eligible for final presentation review", 409);
  }

  const itemResult = await input.client.query<{ quality_review_status: string | null }>(
    `select quality_review_status
       from public.lead_property_shortlist_items
      where shortlist_id = $1::uuid
        and brand = $2
      order by rank asc, created_at asc`,
    [input.shortlistId, input.brand],
  );
  const reviewStates = itemResult.rows.map((item) => String(item.quality_review_status || "needs_review"));
  const clientReadyCount = reviewStates.filter((status) => status === "client_ready").length;
  if (!reviewStates.length || reviewStates.some((status) => status === "needs_review") || clientReadyCount < 1) {
    throw new LeadIntelligenceError(
      "INVALID_REQUEST",
      "Every shortlist candidate must have a final review decision and at least one must be client-ready",
      409,
    );
  }

  return {
    contactId: profile.contact_id,
    customerName: profile.customer_name,
    customerEmail,
    shortlistItemCount: reviewStates.length,
    clientReadyCount,
  };
}

async function ensureManualPresentationReviewWorkItem(input: {
  client: QueryClientLike;
  actor: string;
  brand: string;
  buyerProfileId: string;
  shortlistId: string;
  presentationId: string;
  messageDraftId: string;
  presentationItemCount: number;
  queueContext: ReviewQueueContext;
}) {
  const sourceId = `presentation-review:${input.presentationId}`.slice(0, 180);
  await input.client.query("select pg_advisory_xact_lock(hashtext($1))", [sourceId]);

  const existingResult = await input.client.query<{
    id: string;
    status: string;
    metadata: unknown;
  }>(
    `select id::text, status, metadata
       from public.work_items
      where source_type = 'crm'
        and (source_id = $1 or metadata->>'presentation_id' = $2)
      order by updated_at desc
      limit 1
      for update`,
    [sourceId, input.presentationId],
  );
  const existing = existingResult.rows[0];
  if (existing) {
    const metadata = asRecord(existing.metadata);
    if (
      String(metadata.presentation_id || "") !== input.presentationId
      || String(metadata.presentation_message_draft_id || "") !== input.messageDraftId
      || String(metadata.shortlist_id || "") !== input.shortlistId
      || String(metadata.buyer_profile_id || "") !== input.buyerProfileId
    ) {
      throw new LeadIntelligenceError("REVIEW_CONFLICT", "An existing final-review work item points to different presentation dependencies", 409);
    }
    return {
      workItemId: existing.id,
      status: existing.status,
      alreadyQueued: true,
      reviewHref: `/nexus-os/presentation-review?workItemId=${encodeURIComponent(existing.id)}`,
      approvalCenterHref: "/approvals",
    };
  }

  const now = new Date().toISOString();
  const metadata = {
    event_type: "crm_presentation_review_handoff",
    contact_id: input.queueContext.contactId,
    buyer_profile_id: input.buyerProfileId,
    buyer_profile_status: "APPROVED",
    shortlist_id: input.shortlistId,
    shortlist_prepared_at: now,
    shortlist_human_review_complete: true,
    shortlist_human_reviewed_at: now,
    shortlist_human_reviewed_by: input.actor,
    shortlist_client_ready_count: input.queueContext.clientReadyCount,
    presentation_prepared_at: now,
    presentation_prepared_by: input.actor,
    presentation_prepare_status: "DRAFT_READY_FOR_REVIEW",
    presentation_id: input.presentationId,
    presentation_message_draft_id: input.messageDraftId,
    presentation_item_count: input.presentationItemCount,
    presentation_review_required: true,
    presentation_final_review_status: "PENDING",
    presentation_send_preflight_required: false,
    presentation_customer_send_allowed: false,
    property_recommendation_auto_send_authorized: false,
    send_preflight_ready: false,
  };
  const customerLabel = input.queueContext.customerName || input.queueContext.customerEmail || "kunde";
  const created = await input.client.query<{ id: string; status: string }>(
    `insert into public.work_items (
       title, description, status, priority, due_date, brand_id, source_type, source_id,
       assigned_agent, next_action, ai_score, metadata, created_at, updated_at
     ) values (
       $1, $2, 'REVIEW', 'HIGH', $3::date, $4, 'crm', $5,
       'sales', $6, 92, $7::jsonb, $8::timestamptz, $8::timestamptz
     )
     returning id::text, status`,
    [
      `Sluttkontroll boligforslag – ${customerLabel}`.slice(0, 240),
      "Presentasjon og e-postutkast er laget fra en manuelt kvalitetssikret shortlist og venter på eksplisitt sluttkontroll. Ingen kundeutsending er utført.",
      now.slice(0, 10),
      input.brand,
      sourceId,
      "Kontroller presentasjon og e-postutkast i Approval Center. En eventuell godkjenning autoriserer utsending først etter en ny send-preflight.",
      JSON.stringify(metadata),
      now,
    ],
  );
  const row = created.rows[0];
  if (!row) {
    throw new LeadIntelligenceError("PERSISTENCE_WRITE_FAILED", "Could not create final-review work item", 500);
  }

  return {
    workItemId: row.id,
    status: row.status,
    alreadyQueued: false,
    reviewHref: `/nexus-os/presentation-review?workItemId=${encodeURIComponent(row.id)}`,
    approvalCenterHref: "/approvals",
  };
}

export async function GET(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    if (!isLeadIntelligencePropertyMatchingEnabled()) {
      throw new LeadIntelligenceError(
        "PROPERTY_MATCHING_DISABLED",
        "Lead Intelligence property matching is disabled",
        403,
      );
    }

    assertLeadIntelligenceActionRateLimit(context.email, "presentation-draft");
    const brand = request.nextUrl.searchParams.get("brand") || "";
    const presentationId = request.nextUrl.searchParams.get("presentationId") || "";
    const buyerProfileId = request.nextUrl.searchParams.get("buyerProfileId") || "";
    const limit = request.nextUrl.searchParams.get("limit") || undefined;

    if (buyerProfileId && !presentationId) {
      const parsed = LeadCustomerPresentationDraftHistoryQuerySchema.safeParse({
        brand,
        buyerProfileId,
        limit,
      });
      if (!parsed.success) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid presentation draft history request", 400, {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const items = await withLeadIntelligenceQuery(parsed.data.brand, (client) =>
        createLeadIntelligenceRepository(client, context).listCustomerPresentationDraftHistory(parsed.data),
      );

      return NextResponse.json(
        {
          ok: true,
          correlationId,
          result: {
            brand: parsed.data.brand,
            buyerProfileId: parsed.data.buyerProfileId,
            limit: parsed.data.limit,
            items,
          },
        },
        {
          status: 200,
          headers: leadIntelligenceHeaders(correlationId),
        },
      );
    }

    const parsed = LeadCustomerPresentationDraftLookupQuerySchema.safeParse({
      brand,
      presentationId,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid presentation draft lookup request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceQuery(parsed.data.brand, (client) =>
      createLeadIntelligenceRepository(client, context).getCustomerPresentationDraft(parsed.data),
    );

    if (!result) {
      throw new LeadIntelligenceError("PRESENTATION_DRAFT_NOT_FOUND", "Presentation draft was not found", 404);
    }

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
      },
      {
        status: 200,
        headers: leadIntelligenceHeaders(correlationId),
      },
    );
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    if (!isLeadIntelligencePropertyMatchingEnabled()) {
      throw new LeadIntelligenceError(
        "PROPERTY_MATCHING_DISABLED",
        "Lead Intelligence property matching is disabled",
        403,
      );
    }

    assertLeadIntelligenceActionRateLimit(context.email, "presentation-draft");
    const body = await readJsonBody(request, 16 * 1024);
    const parsed = LeadCustomerPresentationDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid presentation draft request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const transactionResult = await withLeadIntelligenceTransaction(parsed.data.brand, async (client) => {
      const queueContext = await validateManualPresentationReviewContext({
        client,
        brand: parsed.data.brand,
        buyerProfileId: parsed.data.buyerProfileId,
        shortlistId: parsed.data.shortlistId,
      });
      const draft = await saveLeadCustomerPresentationDraft({
        request: parsed.data,
        correlationId,
        createdBy: context.email,
        repository: createLeadIntelligenceRepository(client, context),
      });
      const review = await ensureManualPresentationReviewWorkItem({
        client,
        actor: context.email,
        brand: parsed.data.brand,
        buyerProfileId: parsed.data.buyerProfileId,
        shortlistId: parsed.data.shortlistId,
        presentationId: draft.presentationId,
        messageDraftId: draft.messageDraftId,
        presentationItemCount: draft.itemCount,
        queueContext,
      });
      return { draft, review };
    });
    const result = {
      ...transactionResult.draft,
      review: transactionResult.review,
    };

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
        safety: {
          customerMessageSent: false,
          presentationPublished: false,
          reviewQueued: true,
          explicitApprovalRequired: true,
          automaticSendAuthorized: false,
        },
      },
      {
        status: result.duplicate ? 200 : 201,
        headers: leadIntelligenceHeaders(correlationId),
      },
    );
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}