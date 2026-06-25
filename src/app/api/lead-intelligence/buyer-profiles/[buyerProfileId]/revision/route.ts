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

const criterionKeys = [
  "bedrooms",
  "bathrooms",
  "property_type",
  "location",
  "total_budget",
  "purchase_price",
  "estimated_total_cost",
  "floor_position",
  "has_lift",
  "terrace_area_m2",
  "terrace_access",
  "view_quality",
  "orientation",
  "parking",
  "pool",
  "new_build_or_resale",
  "availability_status",
  "availability_verified_at",
  "adjacent_plot_status",
  "future_building_risk",
  "view_privacy_loss_risk",
  "view_obstruction_risk",
  "legal_notes",
  "living_area_m2",
  "plot_area_m2",
  "distance_to_beach",
  "stairs",
  "other",
  "unknown",
] as const;

const propertyTypes = [
  "end_townhouse",
  "townhouse",
  "apartment",
  "penthouse",
  "villa",
  "duplex",
  "bungalow",
  "finca",
  "country_house",
  "plot",
  "commercial",
  "other",
  "unknown",
] as const;

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

const CriterionRevisionInputSchema = z
  .object({
    criterionType: z.enum(["hard_requirement", "preference", "exclusion", "missing_information"]),
    key: z.enum(criterionKeys),
    otherKey: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable().optional(),
    operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "exists", "unknown"]),
    value: z.unknown().default(null),
    weight: z.coerce.number().min(0).max(1).nullable().optional(),
    severity: z.enum(["reject", "major_penalty", "minor_penalty"]).nullable().optional(),
    appliesToPropertyTypes: z.array(z.enum(propertyTypes)).max(20).default([]),
    sourceText: z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.mediumText).nullable().optional(),
    customerConfirmed: z.boolean().default(true),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.key === "other" && !value.otherKey) {
      ctx.addIssue({ code: "custom", path: ["otherKey"], message: "otherKey is required when key is other" });
    }
    if (value.key !== "other" && value.otherKey) {
      ctx.addIssue({ code: "custom", path: ["otherKey"], message: "otherKey is only allowed when key is other" });
    }
    if (value.criterionType === "preference" && value.weight === null) {
      ctx.addIssue({ code: "custom", path: ["weight"], message: "weight is required for preferences" });
    }
    if (value.criterionType !== "preference" && value.weight !== null && value.weight !== undefined) {
      ctx.addIssue({ code: "custom", path: ["weight"], message: "weight is only allowed for preferences" });
    }
    if (value.criterionType === "exclusion" && !value.severity) {
      ctx.addIssue({ code: "custom", path: ["severity"], message: "severity is required for exclusions" });
    }
    if (value.criterionType !== "exclusion" && value.severity) {
      ctx.addIssue({ code: "custom", path: ["severity"], message: "severity is only allowed for exclusions" });
    }
    const serializedValue = JSON.stringify(value.value ?? null);
    if (!serializedValue || serializedValue.length > 3_000) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "criterion value is too large" });
    }
  });

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
    criteria: z.array(CriterionRevisionInputSchema).max(30).optional(),
  })
  .strict();

type BuyerProfileRevisionRequest = z.infer<typeof BuyerProfileRevisionRequestSchema>;
type CriterionRevisionInput = z.infer<typeof CriterionRevisionInputSchema>;

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

type CriterionRow = {
  id: string;
  criterion_type: string;
  key: string;
  other_key: string | null;
  operator: string;
  value: unknown;
  weight: number | null;
  severity: string | null;
  applies_to_property_types: string[];
  source_text: string | null;
  customer_confirmed: boolean;
  active: boolean;
};

function jsonValue(value: unknown) {
  return JSON.stringify(value ?? null);
}

function criterionSourceText(criterion: CriterionRevisionInput) {
  return criterion.sourceText || `${criterion.key} ${criterion.operator} ${JSON.stringify(criterion.value ?? null)}`;
}

async function insertReplacementCriteria(input: {
  client: QueryClientLike;
  buyerProfileId: string;
  criteria: CriterionRevisionInput[];
  approvedBy: string;
  approvedAt: string;
}) {
  let count = 0;
  for (const criterion of input.criteria) {
    if (!criterion.active) continue;
    const weight = criterion.criterionType === "preference" ? criterion.weight ?? 0.5 : null;
    const severity = criterion.criterionType === "exclusion" ? criterion.severity || "major_penalty" : null;
    await input.client.query(
      `
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
        ) values (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7,
          $8,
          $9::text[],
          'manual',
          $10,
          1,
          $11,
          'approved',
          $12,
          $13::timestamptz,
          true
        )
      `,
      [
        input.buyerProfileId,
        criterion.criterionType,
        criterion.key,
        criterion.key === "other" ? criterion.otherKey : null,
        criterion.operator,
        jsonValue(criterion.value),
        weight,
        severity,
        criterion.appliesToPropertyTypes,
        criterionSourceText(criterion),
        criterion.customerConfirmed,
        input.approvedBy,
        input.approvedAt,
      ],
    );
    count += 1;
  }
  return count;
}

async function loadBuyerProfileRevisionDetails(input: {
  client: QueryClientLike;
  buyerProfileId: string;
  brand: string;
}) {
  const profileResult = await input.client.query<ExistingProfileRow>(
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
    `,
    [input.buyerProfileId, input.brand],
  );
  const profile = profileResult.rows[0];
  if (!profile) {
    throw new LeadIntelligenceError("BUYER_PROFILE_NOT_FOUND", "Buyer profile was not found", 404);
  }

  const criteriaResult = await input.client.query<CriterionRow>(
    `
      select
        id::text,
        criterion_type,
        key,
        other_key,
        operator,
        value,
        weight,
        severity,
        applies_to_property_types,
        source_text,
        customer_confirmed,
        active
      from public.buyer_profile_criteria
      where buyer_profile_id = $1::uuid
        and active is true
      order by criterion_type, key, created_at
    `,
    [input.buyerProfileId],
  );

  return {
    profile: {
      buyerProfileId: profile.id,
      brand: profile.brand,
      intakeId: profile.intake_id,
      version: profile.version,
      status: profile.status,
    },
    criteria: criteriaResult.rows.map((criterion) => ({
      id: criterion.id,
      criterionType: criterion.criterion_type,
      key: criterion.key,
      otherKey: criterion.other_key,
      operator: criterion.operator,
      value: criterion.value,
      weight: criterion.weight,
      severity: criterion.severity,
      appliesToPropertyTypes: criterion.applies_to_property_types,
      sourceText: criterion.source_text,
      customerConfirmed: criterion.customer_confirmed,
      active: criterion.active,
    })),
  };
}

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
    throw new LeadIntelligenceError("INVALID_REQUEST", "Archived buyer profiles cannot be revised", 409);
  }
  if (existing.status === "superseded") {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Superseded buyer profiles cannot be revised again", 409);
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
    throw new LeadIntelligenceError("INTERNAL_ERROR", "Buyer profile revision could not be created", 500);
  }

  const criteriaCount = input.data.criteria
    ? await insertReplacementCriteria({
        client: input.client,
        buyerProfileId: newProfile.id,
        criteria: input.data.criteria,
        approvedBy: input.approvedBy,
        approvedAt,
      })
    : (
        await input.client.query<{ criterion_count: number }>(
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
        )
      ).rows[0]?.criterion_count || 0;

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
      "INVALID_REQUEST",
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
    criteriaCopied: criteriaCount,
    criteriaReplaced: Boolean(input.data.criteria),
    revisionNote: input.data.revisionNote || null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buyerProfileId: string }> },
) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "profile-revision-details");

    const routeParams = ParamsSchema.parse(await params);
    const brand = LeadIntelligenceRealEstateBrandSchema.parse(request.nextUrl.searchParams.get("brand"));
    const result = await withLeadIntelligenceTransaction(brand, (client) =>
      loadBuyerProfileRevisionDetails({
        client,
        buyerProfileId: routeParams.buyerProfileId,
        brand,
      }),
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
        sideEffects: {
          contactsCreated: false,
          contactsUpdated: false,
          leadsCreated: false,
          emailSent: false,
          propertyMatchingStarted: false,
          presentationCreated: false,
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
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile revision details request", 400, {
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
    const body = await readJsonBody(request, 32 * 1024);
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
