import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import {
  assertLeadIntelligenceActionRateLimit,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ParamsSchema = z.object({ messageDraftId: z.string().uuid() });
const BodySchema = z.object({ brand: LeadIntelligenceRealEstateBrandSchema, explicitApproval: z.literal(true) }).strict();

type QueryClientLike = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(query: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

type ApprovedRow = {
  message_draft_id: string;
  brand: string;
  presentation_id: string;
  buyer_profile_id: string;
  shortlist_id: string;
  status: string;
  approved_by: string;
  approved_at: string | Date;
};

function normalizeDate(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function approveDraft(input: {
  client: QueryClientLike;
  brand: string;
  messageDraftId: string;
  approvedBy: string;
  approvedAt: string;
}) {
  const { rows } = await input.client.query<ApprovedRow>(
    `
      update public.lead_customer_message_drafts draft
         set status = 'approved', approved_by = $3, approved_at = $4::timestamptz
       where draft.brand = $1
         and draft.id = $2::uuid
         and draft.status = 'draft'
         and draft.approved_by is null
         and draft.approved_at is null
         and draft.sent_at is null
         and draft.cancelled_at is null
         and exists (
           select 1
           from public.lead_customer_presentations presentation
           where presentation.brand = draft.brand
             and presentation.id = draft.presentation_id
             and presentation.buyer_profile_id = draft.buyer_profile_id
             and presentation.shortlist_id = draft.shortlist_id
             and presentation.status = 'draft'
         )
       returning
         draft.id::text as message_draft_id,
         draft.brand,
         draft.presentation_id::text as presentation_id,
         draft.buyer_profile_id::text as buyer_profile_id,
         draft.shortlist_id::text as shortlist_id,
         draft.status,
         draft.approved_by,
         draft.approved_at
    `,
    [input.brand, input.messageDraftId, input.approvedBy, input.approvedAt],
  );

  const row = rows[0];
  if (!row) {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Message draft could not be approved", 409);
  }

  return {
    brand: row.brand,
    presentationId: row.presentation_id,
    buyerProfileId: row.buyer_profile_id,
    shortlistId: row.shortlist_id,
    messageDraftId: row.message_draft_id,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: normalizeDate(row.approved_at),
    sideEffects: {
      messageDraftApproved: true,
      externalCommunication: false,
      leadsCreated: false,
      contactsChanged: false,
      tasksCreated: false,
    },
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ messageDraftId: string }> }) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "message-draft-approval");

    const routeParams = ParamsSchema.parse(await params);
    const body = await readJsonBody(request, 4 * 1024);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid message draft approval request", 400, {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, (client) =>
      approveDraft({
        client,
        brand: parsed.data.brand,
        messageDraftId: routeParams.messageDraftId,
        approvedBy: context.email,
        approvedAt: new Date().toISOString(),
      }),
    );

    return NextResponse.json({ ok: true, correlationId, result }, { status: 200, headers: leadIntelligenceHeaders(correlationId) });
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}
