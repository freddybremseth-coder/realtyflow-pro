import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";
import { LEAD_INTELLIGENCE_LIMITS } from "@/services/lead-intelligence/contracts";
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

const ParamsSchema = z.object({
  buyerProfileId: z.string().uuid(),
});

const NullableBudgetAmountSchema = z.union([
  z.coerce.number().nonnegative().max(100_000_000),
  z.null(),
]).optional();
const NullableTextSchema = z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.longText).nullable().optional();
const NullableShortTextSchema = z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable().optional();
const PurchaseReadinessSchema = z.enum(["cold", "warm", "hot", "ready_to_buy", "unknown"]);
const CurrencySchema = z
  .string()
  .trim()
  .min(3)
  .max(3)
  .transform((value) => value.toUpperCase())
  .nullable()
  .optional();

const BuyerProfileRevisionRequestSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    summary: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.longText),
    purchaseReadiness: PurchaseReadinessSchema.default("unknown"),
    budgetAmount: NullableBudgetAmountSchema,
    budgetCurrency: CurrencySchema,
    budgetIncludesCosts: z.boolean().nullable().optional(),
    budgetApproximate: z.boolean().default(false),
    locationFlexible: z.boolean().default(false),
    revisionNote: NullableTextSchema,
    editedBy: NullableShortTextSchema,
  })
  .strict();

type BuyerProfileRevisionRequest = z.infer<typeof BuyerProfileRevisionRequestSchema>;

type QueryClientLike = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type ExistingProfileRow = {
  id: string;
  brand: string;
  contact_id: string | null;
  intake_id: string;
  version: number;
  status: string;
};

type NewProfileRow = {
  id: string;
  version: number;
};

async function createBuyerProfileRevision(input: {
  client: QueryClientLike;
  buyerProfileId: string;
  data: BuyerProfileRevisionRequest;
  approvedBy: string;
}) {
  const existingResult = await input.client.query<ExistingProfileRow>(
    `
      select
        id::text,
        brand,
        contact_id::text,
        intake_id::text,
        version,
        status
      from public.buyer_profiles
      where id = $1::uuid
        and brand = $2
      for update
    `,
    [input.buyerProfileId, input.data.brand],
  );

  const existing = existingResult.rows[0];
  if (!existing) {
    throw new LeadIntelligenceError("BUYER_PROFILE_NOT_FOUND", "Buyer profile was not found", 404);
  }
  if (existing.status === "archived") {
    throw new LeadIntelligenceError("REVIEW_CONFLICT", "Archived buyer profiles cannot be revised", 409);
  }
  if (existing.status === "superseded") {
    throw new LeadIntelligenceError("REVIEW_CONFLICT", "Superseded buyer profiles cannot be revised again", 409);
  }

  const nextVersionResult = await input.client.query<{ next_version: number }>(
    `
      select coalesce(max(version), 0)::int + 1 as next_version
      from public.buyer_profiles
      where brand = $1
        and intake_id = $2::uuid
    `,
    [input.data.brand, existing.intake_id],
  );
  const nextVersion = nextVersionResult.rows[0]?.next_version || existing.version + 1;
  const approvedAt = new Date().toISOString();

  const createdProfile = await input.client.query<NewProfileRow>(
    `
      insert into public.buyer_profiles (
        brand,
        contact_id,
        intake_id,
        version,
        status,
        purchase_readiness,
        budget_amount,
        budget_currency,
        budget_includes_costs,
        budget_approximate,
        location_flexible,
        summary,
        created_by,
        approved_by,
        approved_at
      )
      values (
        $1,
        $2::uuid,
        $3::uuid,
        $4,
        'approved',
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $12,
        $13::timestamptz
      )
      returning id::text, version
    `,
    [
      input.data.brand,
      existing.contact_id,
      existing.intake_id,
      nextVersion,
      input.data.purchaseReadiness,
      input.data.budgetAmount ?? null,
      input.data.budgetCurrency ?? "EUR",
      input.data.budgetIncludesCosts ?? null,
      input.data.budgetApproximate,
      input.data.locationFlexible,
      input.data.summary,
      input.data.editedBy || input.approvedBy,
      approvedAt,
    ],
  );

  const newProfile = createdProfile.rows[0];
  if (!newProfile) {
    throw new LeadIntelligenceError("DATABASE_ERROR", "Buyer profile revision could not be created", 500);
  }

  const copiedCriteria = await input.client.query<{ criterion_count: number }>(
    `
      with copied as (
        insert into public.buyer_profile_criteria (
          buyer_profile_id,
          criterion_type,
          key,
          other_key,
          operator,
          value,
          weight,
          severity,
          applies_to_property_types,
          source,
          source_text,
          confidence,
          customer_confirmed,
          approval_status,
          approved_by,
          approved_at,
          active
        )
        select
          $1::uuid,
          criterion_type,
          key,
          other_key,
          operator,
          value,
          weight,
          severity,
          applies_to_property_types,
          source,
          source_text,
          confidence,
          customer_confirmed,
          approval_status,
          approved_by,
          approved_at,
          active
        from public.buyer_profile_criteria
        where buyer_profile_id = $2::uuid
          and active is true
        returning id
      )
      select count(*)::int as criterion_count from copied
    `,
    [newProfile.id, existing.id],
  );

  const superseded = await input.client.query<{ id: string }>(
    `
      update public.buyer_profiles
      set status = 'superseded'
      where id = $1::uuid
        and brand = $2
        and status in ('draft', 'approved')
      returning id::text
    `,
    [existing.id, input.data.brand],
  );

  if (superseded.rows.length !== 1) {
    throw new LeadIntelligenceError(
      "REVIEW_CONFLICT",
      "Previous buyer profile could not be marked as superseded after creating the revision",
      409,
    );
  }

  return {
    previousBuyerProfileId: existing.id,
    buyerProfileId: newProfile.id,
    intakeId: existing.intake_id,
    previousVersion: existing.version,
    version: newProfile.version,
    previousStatus: "superseded" as const,
    status: "approved" as const,
    criteriaCopied: copiedCriteria.rows[0]?.criterion_count || 0,
    revisionNote: input.data.revisionNote || null,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ buyerProfileId: string }> },
) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "profile-revision");

    const routeParams = ParamsSchema.parse(await params);
    const body = await readJsonBody(request, 16 * 1024);
    const parsed = BuyerProfileRevisionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile revision request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, (client) =>
      createBuyerProfileRevision({
        client,
        buyerProfileId: routeParams.buyerProfileId,
        data: parsed.data,
        approvedBy: context.email,
      }),
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
        sideEffects: {
          buyerProfileCreated: true,
          previousProfileSuperseded: true,
          oldShortlistsUpdated: false,
          oldPresentationsUpdated: false,
          contactsCreated: false,
          contactsUpdated: false,
          leadsCreated: false,
          emailSent: false,
          propertyMatchingStarted: false,
          presentationCreated: false,
        },
      },
      {
        status: 201,
        headers: leadIntelligenceHeaders(correlationId),
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return leadIntelligenceJsonError(
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile revision request", 400, {
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
