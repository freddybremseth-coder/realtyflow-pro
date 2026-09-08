import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decideBuyerProfileDraftPromotion, type ReviewedDraftCriterion } from "@/lib/nexus/buyer-profile-draft-promotion";
import {
  assertLeadIntelligenceActionRateLimit,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  buyerProfileId: z.string().uuid(),
  brand: LeadIntelligenceRealEstateBrandSchema,
  decisions: z.array(z.object({
    criterionId: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
  }).strict()).min(1).max(30),
}).strict();

const ACTIVE_STAGES = new Set(["QUALIFIED", "VIEWING"]);

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";
  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "buyer-profile-evidence-draft-review");

    const parsed = RequestSchema.safeParse(await readJsonBody(request, 32 * 1024));
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid Buyer Profile draft review request", 400, {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, async (client) => {
      const profileResult = await client.query<{
        id: string;
        contact_id: string | null;
        brand: string;
        status: string;
      }>(
        `select id::text, contact_id::text, brand, status
           from public.buyer_profiles
          where id = $1::uuid
            and brand = $2
          for update`,
        [parsed.data.buyerProfileId, parsed.data.brand],
      );
      const profile = profileResult.rows[0];
      if (!profile) throw new LeadIntelligenceError("BUYER_PROFILE_NOT_FOUND", "Buyer Profile draft was not found", 404);
      if (profile.status !== "draft") {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Only draft Buyer Profiles can use evidence review promotion", 409);
      }
      if (!profile.contact_id) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Buyer Profile draft is not linked to a CRM contact", 409);
      }

      const contactResult = await client.query<{
        id: string;
        email: string | null;
        phone: string | null;
        pipeline_value: number | null;
        property_interest: string | null;
        next_followup: string | null;
        pipeline_status: string | null;
        brand_id: string | null;
        brand: string | null;
        email_suppressed: boolean | null;
        do_not_contact: boolean | null;
      }>(
        `select id::text, email, phone, pipeline_value, property_interest, next_followup,
                pipeline_status, brand_id, brand, email_suppressed, do_not_contact
           from public.contacts
          where id = $1::uuid
          for update`,
        [profile.contact_id],
      );
      const contact = contactResult.rows[0];
      if (!contact) throw new LeadIntelligenceError("INVALID_REQUEST", "Linked CRM contact was not found", 409);

      const contactBrand = text(contact.brand_id || contact.brand, 80).toLowerCase();
      if (contactBrand !== parsed.data.brand) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Contact brand changed or no longer matches the Buyer Profile draft", 409);
      }
      const stage = text(contact.pipeline_status, 40).toUpperCase();
      if (!ACTIVE_STAGES.has(stage)) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Contact is no longer in a Buyer Profile activation stage", 409);
      }
      if (contact.do_not_contact || contact.email_suppressed) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Suppressed contact is not eligible for Buyer Profile promotion", 409);
      }

      const decisionIds = [...new Set(parsed.data.decisions.map((item) => item.criterionId))];
      if (decisionIds.length !== parsed.data.decisions.length) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Duplicate criterion decisions are not allowed", 400);
      }

      const criteriaResult = await client.query<{
        id: string;
        key: string;
        other_key: string | null;
        approval_status: "pending" | "approved" | "rejected" | "edited";
        active: boolean;
      }>(
        `select id::text, key, other_key, approval_status, active
           from public.buyer_profile_criteria
          where buyer_profile_id = $1::uuid
          for update`,
        [profile.id],
      );
      const byId = new Map(criteriaResult.rows.map((criterion) => [criterion.id, criterion]));
      for (const item of parsed.data.decisions) {
        const criterion = byId.get(item.criterionId);
        if (!criterion) {
          throw new LeadIntelligenceError("INVALID_REQUEST", "A reviewed criterion does not belong to this Buyer Profile draft", 409);
        }
        if (!criterion.active && item.action === "approve") {
          throw new LeadIntelligenceError("INVALID_REQUEST", "Inactive criteria cannot be approved", 409);
        }
        if (!new Set(["pending", "edited"]).has(criterion.approval_status)) {
          throw new LeadIntelligenceError("INVALID_REQUEST", "Only pending or edited criteria can be reviewed through this route", 409);
        }

        if (item.action === "approve") {
          await client.query(
            `update public.buyer_profile_criteria
                set approval_status = 'approved', approved_by = $2, approved_at = now(), active = true
              where id = $1::uuid
                and buyer_profile_id = $3::uuid`,
            [item.criterionId, context.email, profile.id],
          );
        } else {
          await client.query(
            `update public.buyer_profile_criteria
                set approval_status = 'rejected', approved_by = null, approved_at = null, active = false
              where id = $1::uuid
                and buyer_profile_id = $2::uuid`,
            [item.criterionId, profile.id],
          );
        }
      }

      const reviewedResult = await client.query<ReviewedDraftCriterion>(
        `select key, other_key, approval_status, active
           from public.buyer_profile_criteria
          where buyer_profile_id = $1::uuid`,
        [profile.id],
      );
      const promotion = decideBuyerProfileDraftPromotion({
        contact: {
          email: contact.email,
          phone: contact.phone,
          pipeline_value: contact.pipeline_value,
          property_interest: contact.property_interest,
          next_followup: contact.next_followup,
        },
        criteria: reviewedResult.rows,
      });

      let promoted = false;
      if (promotion.canPromote) {
        const promotedResult = await client.query<{ id: string }>(
          `update public.buyer_profiles
              set status = 'approved', approved_by = $2, approved_at = now()
            where id = $1::uuid
              and status = 'draft'
            returning id::text`,
          [profile.id, context.email],
        );
        promoted = promotedResult.rows.length === 1;
        if (!promoted) {
          throw new LeadIntelligenceError("REVIEW_CONFLICT", "Buyer Profile draft changed before promotion", 409);
        }
      }

      return {
        buyerProfileId: profile.id,
        status: promoted ? "approved" as const : "draft" as const,
        promoted,
        reviewedCount: parsed.data.decisions.length,
        completeness: promotion.completeness,
        promotionReason: promotion.reason,
      };
    });

    return NextResponse.json({
      ok: true,
      result,
      safety: {
        itemLevelReviewRequired: true,
        matchingTriggered: false,
        shortlistCreated: false,
        propertyDeliveryTriggered: false,
        crmUpdated: false,
        pipelineUpdated: false,
        emailSent: false,
        nurtureChanged: false,
        externalActionExecuted: false,
      },
    }, {
      status: 200,
      headers: leadIntelligenceHeaders(correlationId),
    });
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}
