import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BoundedJsonSchema, LEAD_INTELLIGENCE_LIMITS } from "@/services/lead-intelligence/contracts";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { buildLeadCustomerPresentationPreview } from "@/services/lead-intelligence/presentation-preview";
import {
  assertLeadIntelligenceActionRateLimit,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceQuery,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ParamsSchema = z.object({
  messageDraftId: z.string().uuid(),
});

const ApprovalInputSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    explicitApproval: z.literal(true),
    verificationWaiver: z.boolean().default(false),
  })
  .strict();

type QueryClientLike = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type DraftRow = {
  message_draft_id: string;
  brand: string;
  presentation_id: string;
  buyer_profile_id: string;
  shortlist_id: string;
  draft_status: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  sent_at: string | Date | null;
  cancelled_at: string | Date | null;
  presentation_status: string;
  presentation_json: unknown;
};

type ApprovedRow = {
  message_draft_id: string;
  status: string;
  approved_by: string;
  approved_at: string | Date;
};

function normalizeDate(value: string | Date | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function unique(values: string[], limit = 12) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function buildApprovalPreflight(row: DraftRow, verificationWaiver: boolean) {
  const preview = buildLeadCustomerPresentationPreview(BoundedJsonSchema.parse(row.presentation_json));
  const missingCustomerLinks = preview.properties
    .filter((property) => !property.publicUrl)
    .map((property) => property.reference || property.title || "Ukjent bolig");
  const verificationItems = unique([
    ...preview.verification,
    ...preview.properties.flatMap((property) => property.questionsToVerify),
    ...preview.properties.flatMap((property) => property.concerns),
  ], 12);

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (row.draft_status !== "draft") {
    blockers.push(`Message draft must be draft before approval. Current status: ${row.draft_status}.`);
  }
  if (row.sent_at || row.cancelled_at) {
    blockers.push("Message draft is already terminal and cannot be approved.");
  }
  if (row.presentation_status === "archived") {
    blockers.push("Archived presentations cannot be approved for customer communication.");
  }
  if (preview.properties.length === 0) {
    blockers.push("Presentation must contain at least one property before message approval.");
  }
  if (missingCustomerLinks.length > 0) {
    blockers.push("All customer-facing property links must be present before message approval.");
  }
  if (verificationItems.length > 0 && !verificationWaiver) {
    blockers.push("Open verification items must be resolved or explicitly waived before approval.");
  }
  if (!row.subject.trim() || !row.body_text.trim()) {
    blockers.push("Message subject and body text are required before approval.");
  }
  if (row.body_text.length > LEAD_INTELLIGENCE_LIMITS.bodyText) {
    blockers.push("Message body exceeds the Lead Intelligence body text limit.");
  }

  if (verificationItems.length > 0 && verificationWaiver) {
    warnings.push("Verification items were explicitly waived for approval, but the message is still not sent.");
  }

  return {
    blockers,
    warnings,
    missingCustomerLinks,
    verificationItems,
    propertyCount: preview.properties.length,
  };
}

async function approveMessageDraft(input: {
  client: QueryClientLike;
  brand: string;
  messageDraftId: string;
  approvedBy: string;
  verificationWaiver: boolean;
}) {
  const { rows } = await input.client.query<DraftRow>(
    `
      select
        draft.id::text as message_draft_id,
        draft.brand,
        draft.presentation_id::text as presentation_id,
        draft.buyer_profile_id::text as buyer_profile_id,
        draft.shortlist_id::text as shortlist_id,
        draft.status as draft_status,
        draft.subject,
        draft.body_text,
        draft.body_html,
        draft.approved_by,
        draft.approved_at,
        draft.sent_at,
        draft.cancelled_at,
        presentation.status as presentation_status,
        presentation.presentation_json
      from public.lead_customer_message_drafts draft
      join public.lead_customer_presentations presentation
        on presentation.id = draft.presentation_id
       and presentation.brand = draft.brand
      where draft.brand = $1
        and draft.id = $2::uuid
      limit 1
    `,
    [input.brand, input.messageDraftId],
  );

  const row = rows[0];
  if (!row) {
    throw new LeadIntelligenceError("MESSAGE_DRAFT_NOT_FOUND", "Message draft was not found", 404);
  }

  if (row.draft_status === "approved") {
    return {
      messageDraftId: row.message_draft_id,
      brand: row.brand,
      presentationId: row.presentation_id,
      buyerProfileId: row.buyer_profile_id,
      shortlistId: row.shortlist_id,
      status: "approved" as const,
      duplicate: true,
      approvedBy: row.approved_by,
      approvedAt: normalizeDate(row.approved_at),
      preflight: buildApprovalPreflight(row, true),
    };
  }

  const preflight = buildApprovalPreflight(row, input.verificationWaiver);
  if (preflight.blockers.length > 0) {
    throw new LeadIntelligenceError("MESSAGE_APPROVAL_BLOCKED", "Message draft approval is blocked", 409, {
      blockers: preflight.blockers,
      missingCustomerLinks: preflight.missingCustomerLinks,
      verificationItems: preflight.verificationItems,
    });
  }

  const approvedAt = new Date().toISOString();
  const updateResult = await input.client.query<ApprovedRow>(
    `
      update public.lead_customer_message_drafts
      set
        status = 'approved',
        approved_by = $3,
        approved_at = $4::timestamptz
      where brand = $1
        and id = $2::uuid
        and status = 'draft'
        and approved_by is null
        and approved_at is null
        and sent_at is null
        and cancelled_at is null
      returning id::text as message_draft_id, status, approved_by, approved_at
    `,
    [input.brand, input.messageDraftId, input.approvedBy, approvedAt],
  );

  const approved = updateResult.rows[0];
  if (!approved) {
    throw new LeadIntelligenceError("MESSAGE_APPROVAL_CONFLICT", "Message draft changed before approval", 409);
  }

  return {
    messageDraftId: approved.message_draft_id,
    brand: row.brand,
    presentationId: row.presentation_id,
    buyerProfileId: row.buyer_profile_id,
    shortlistId: row.shortlist_id,
    status: "approved" as const,
    duplicate: false,
    approvedBy: approved.approved_by,
    approvedAt: normalizeDate(approved.approved_at),
    preflight,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageDraftId: string }> },
) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "message-approval");

    const routeParams = ParamsSchema.parse(await params);
    const input = ApprovalInputSchema.parse(await readJsonBody(request, 4096));

    const result = await withLeadIntelligenceQuery(input.brand, (client) =>
      approveMessageDraft({
        client,
        brand: input.brand,
        messageDraftId: routeParams.messageDraftId,
        approvedBy: context.email,
        verificationWaiver: input.verificationWaiver,
      }),
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
        sideEffects: {
          messageDraftApproved: true,
          emailSent: false,
          leadsCreated: false,
          contactsCreated: false,
          propertyMatchingStarted: false,
          presentationPublished: false,
          tasksCreated: false,
        },
      },
      {
        status: 200,
        headers: leadIntelligenceHeaders(correlationId),
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return leadIntelligenceJsonError(
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid message approval request", 400, {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        }),
        correlationId,
      );
    }

    return leadIntelligenceJsonError(error, correlationId);
  }
}
