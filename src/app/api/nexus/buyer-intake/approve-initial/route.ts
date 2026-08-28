import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stableLeadIntelligenceIdempotencyKey } from "@/services/lead-intelligence/review";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { BoundedJsonSchema, LEAD_INTELLIGENCE_LIMITS } from "@/services/lead-intelligence/contracts";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const criterionKeys = [
  "bedrooms", "bathrooms", "property_type", "location", "total_budget", "purchase_price",
  "estimated_total_cost", "floor_position", "has_lift", "terrace_area_m2", "terrace_access",
  "view_quality", "orientation", "parking", "pool", "new_build_or_resale", "availability_status",
  "availability_verified_at", "adjacent_plot_status", "future_building_risk", "view_privacy_loss_risk",
  "view_obstruction_risk", "legal_notes", "living_area_m2", "plot_area_m2", "distance_to_beach",
  "stairs", "other", "unknown",
] as const;

const propertyTypes = [
  "end_townhouse", "townhouse", "apartment", "penthouse", "villa", "duplex", "bungalow", "finca",
  "country_house", "plot", "commercial", "other", "unknown",
] as const;

const CriterionSchema = z.object({
  criterionType: z.enum(["hard_requirement", "preference", "exclusion", "missing_information"]),
  key: z.enum(criterionKeys),
  otherKey: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.shortText).nullable().optional(),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "exists", "unknown"]),
  value: BoundedJsonSchema.default(null),
  weight: z.number().min(0).max(1).nullable().optional(),
  severity: z.enum(["reject", "major_penalty", "minor_penalty"]).nullable().optional(),
  appliesToPropertyTypes: z.array(z.enum(propertyTypes)).max(20).default([]),
  sourceText: z.string().trim().max(LEAD_INTELLIGENCE_LIMITS.mediumText).nullable().optional(),
  customerConfirmed: z.boolean().default(false),
  active: z.boolean().default(true),
}).strict().superRefine((criterion, ctx) => {
  if (criterion.key === "other" && !criterion.otherKey) {
    ctx.addIssue({ code: "custom", path: ["otherKey"], message: "otherKey is required when key is other" });
  }
  if (criterion.key !== "other" && criterion.otherKey) {
    ctx.addIssue({ code: "custom", path: ["otherKey"], message: "otherKey is only allowed when key is other" });
  }
});

const RequestSchema = z.object({
  workItemId: z.string().uuid(),
  brand: LeadIntelligenceRealEstateBrandSchema,
  criteria: z.array(CriterionSchema).min(1).max(30),
}).strict();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";
  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "buyer-intake-approve-initial");
    const parsed = RequestSchema.safeParse(await readJsonBody(request, 64 * 1024));
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid Buyer Intake initial approval", 400, {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, async (client) => {
      const workItemResult = await client.query<{
        id: string;
        brand_id: string | null;
        metadata: unknown;
      }>(
        `select id::text, brand_id, metadata from public.work_items where id = $1::uuid for update`,
        [parsed.data.workItemId],
      );
      const workItem = workItemResult.rows[0];
      if (!workItem) throw new LeadIntelligenceError("INVALID_REQUEST", "Buyer Intake work item not found", 404);

      const metadata = asRecord(workItem.metadata);
      if (metadata.kind !== "buyer_intake_review") {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Work item is not a Buyer Intake review", 409);
      }
      const contactId = text(metadata.contact_id, 120);
      if (!contactId) throw new LeadIntelligenceError("INVALID_REQUEST", "Buyer Intake review is missing contact_id", 409);

      const contactResult = await client.query<{
        id: string;
        name: string | null;
        email: string | null;
        brand_id: string | null;
        brand: string | null;
        pipeline_value: number | null;
        property_interest: string | null;
      }>(
        `select id::text, name, email, brand_id, brand, pipeline_value, property_interest from public.contacts where id = $1::uuid limit 1`,
        [contactId],
      );
      const contact = contactResult.rows[0];
      if (!contact) throw new LeadIntelligenceError("INVALID_REQUEST", "Linked contact not found", 404);
      const brand = text(contact.brand_id || contact.brand || workItem.brand_id, 80);
      if (brand !== parsed.data.brand) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Buyer Intake brand changed or does not match the reviewed contact", 409);
      }

      const existingProfile = await client.query<{ id: string }>(
        `select id::text from public.buyer_profiles where contact_id = $1::uuid and status = 'approved' order by version desc limit 1`,
        [contactId],
      );
      if (existingProfile.rows[0]) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "An approved Buyer Profile already exists; use revision instead", 409);
      }

      const repository = createLeadIntelligenceRepository(client, context);
      const approvedAt = new Date().toISOString();
      const idempotencyKey = stableLeadIntelligenceIdempotencyKey("buyer-intake-initial-v1", {
        workItemId: parsed.data.workItemId,
        contactId,
        brand,
      });
      const intake = await repository.createIntake({
        brand,
        source: "other",
        rawTextRestricted: null,
        rawTextRetentionUntil: null,
        language: null,
        status: "approved",
        createdBy: context.email,
        correlationId,
        idempotencyKey,
      });

      const importedLead = asRecord(metadata.imported_lead);
      const summaryParts = [
        `Buyer Profile for ${contact.name || contact.email || "CRM lead"}`,
        text(importedLead.type, 120),
        contact.property_interest ? `Interesse: ${contact.property_interest}` : "",
        text(importedLead.notes, 600),
      ].filter(Boolean);
      const budget = Number(contact.pipeline_value || 0);

      const criteria = parsed.data.criteria.map((criterion) => ({
        criterionType: criterion.criterionType,
        key: criterion.key,
        otherKey: criterion.key === "other" ? criterion.otherKey || null : null,
        operator: criterion.operator,
        value: criterion.value,
        weight: criterion.criterionType === "preference" ? criterion.weight ?? 0.5 : null,
        severity: criterion.criterionType === "exclusion" ? criterion.severity || "major_penalty" : null,
        appliesToPropertyTypes: criterion.appliesToPropertyTypes,
        source: "manual" as const,
        sourceText: criterion.sourceText || null,
        confidence: null,
        customerConfirmed: criterion.customerConfirmed,
        approvalStatus: "approved" as const,
        approvedBy: context.email,
        approvedAt,
        active: criterion.active,
      }));

      const profile = await repository.createBuyerProfile({
        brand,
        contactId,
        intakeId: intake.id,
        version: 1,
        status: "approved",
        purchaseReadiness: "unknown",
        budgetAmount: Number.isFinite(budget) && budget > 0 ? budget : null,
        budgetCurrency: "EUR",
        budgetIncludesCosts: null,
        budgetApproximate: true,
        locationFlexible: false,
        summary: summaryParts.join(" · ").slice(0, LEAD_INTELLIGENCE_LIMITS.longText),
        createdBy: context.email,
        approvedBy: context.email,
        approvedAt,
        criteria,
      });

      return { buyerProfileId: profile.id, version: 1, duplicate: Boolean(profile.duplicate), intakeId: intake.id, brand };
    });

    return NextResponse.json({ ok: true, result, sideEffects: { emailSent: false, crmUpdated: false } }, {
      status: 201,
      headers: leadIntelligenceHeaders(correlationId),
    });
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}
