import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildBuyerProfileEvidencePreview } from "@/lib/nexus/buyer-profile-evidence";
import { decideBuyerProfileEvidenceDraft } from "@/lib/nexus/buyer-profile-evidence-draft";
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
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  contactId: z.string().uuid(),
  brand: LeadIntelligenceRealEstateBrandSchema,
}).strict();
const ACTIVE_STAGES = new Set(["QUALIFIED", "VIEWING"]);

function asInteractions(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>
    : [];
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";
  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "buyer-profile-evidence-draft");

    const parsed = RequestSchema.safeParse(await readJsonBody(request, 8 * 1024));
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid Buyer Profile evidence draft request", 400, {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, async (client) => {
      const contactResult = await client.query<{
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        notes: string | null;
        property_interest: string | null;
        next_followup: string | null;
        pipeline_status: string | null;
        pipeline_value: number | null;
        source: string | null;
        brand_id: string | null;
        brand: string | null;
        interactions: unknown;
        email_suppressed: boolean | null;
        do_not_contact: boolean | null;
      }>(
        `select id::text, name, email, phone, notes, property_interest, next_followup,
                pipeline_status, pipeline_value, source, brand_id, brand, interactions,
                email_suppressed, do_not_contact
           from public.contacts
          where id = $1::uuid
          for update`,
        [parsed.data.contactId],
      );
      const contact = contactResult.rows[0];
      if (!contact) throw new LeadIntelligenceError("INVALID_REQUEST", "CRM contact not found", 404);

      const brandParse = LeadIntelligenceRealEstateBrandSchema.safeParse(text(contact.brand_id || contact.brand, 80).toLowerCase());
      if (!brandParse.success) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Contact brand is not eligible for Buyer Profile evidence draft", 409);
      }
      const brand = brandParse.data;
      if (brand !== parsed.data.brand) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Contact brand changed or does not match the evidence-draft request", 409);
      }

      const stage = text(contact.pipeline_status, 40).toUpperCase();
      if (!ACTIVE_STAGES.has(stage)) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Contact is no longer in a Buyer Profile activation stage", 409);
      }
      if (contact.do_not_contact || contact.email_suppressed) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Suppressed contact is not eligible for Buyer Profile activation work", 409);
      }

      const existingProfiles = await client.query<{ id: string; version: number; status: string }>(
        `select id::text, version, status
           from public.buyer_profiles
          where contact_id = $1::uuid
            and status in ('approved', 'draft')
          order by case when status = 'approved' then 0 else 1 end, version desc, created_at desc
          limit 1`,
        [contact.id],
      );
      const existing = existingProfiles.rows[0] || null;
      if (existing?.status === "approved") {
        throw new LeadIntelligenceError("INVALID_REQUEST", "An approved Buyer Profile already exists; use revision instead", 409);
      }
      if (existing?.status === "draft") {
        return {
          buyerProfileId: existing.id,
          version: existing.version,
          status: "draft" as const,
          duplicate: true,
          existingDraft: true,
          criteriaCount: null,
          brand,
        };
      }

      const preview = buildBuyerProfileEvidencePreview({
        email: contact.email,
        phone: contact.phone,
        pipeline_value: contact.pipeline_value,
        property_interest: contact.property_interest,
        next_followup: contact.next_followup,
        notes: contact.notes,
        interactions: asInteractions(contact.interactions),
      });
      const decision = decideBuyerProfileEvidenceDraft({
        candidates: preview.candidates,
        conflictCount: preview.conflicts.length,
      });
      if (!decision.eligible) {
        throw new LeadIntelligenceError("INVALID_REQUEST", decision.reason, 409, {
          evidenceCandidates: preview.candidates.length,
          evidenceConflicts: preview.conflicts,
        });
      }

      const repository = createLeadIntelligenceRepository(client, context);
      const idempotencyKey = stableLeadIntelligenceIdempotencyKey("buyer-profile-evidence-draft-v1", {
        contactId: contact.id,
        brand,
        criteria: decision.criteria.map((criterion) => ({
          key: criterion.key,
          otherKey: criterion.otherKey,
          operator: criterion.operator,
          value: criterion.value,
          confidence: criterion.confidence,
        })),
      });
      const intake = await repository.createIntake({
        brand,
        source: "other",
        rawTextRestricted: null,
        rawTextRetentionUntil: null,
        language: null,
        status: "analyzed",
        createdBy: context.email,
        correlationId,
        idempotencyKey,
      });

      const profile = await repository.createBuyerProfile({
        brand,
        contactId: contact.id,
        intakeId: intake.id,
        version: 1,
        status: "draft",
        purchaseReadiness: "unknown",
        budgetAmount: null,
        budgetCurrency: "EUR",
        budgetIncludesCosts: null,
        budgetApproximate: false,
        locationFlexible: false,
        summary: `Draft Buyer Profile evidence for ${contact.name || contact.email || "CRM lead"}. ${decision.reason} Pending item-level review; no matching or customer action is authorized by this draft.`,
        createdBy: context.email,
        approvedBy: null,
        approvedAt: null,
        criteria: decision.criteria,
      });

      return {
        buyerProfileId: profile.id,
        version: 1,
        status: "draft" as const,
        duplicate: Boolean(profile.duplicate),
        existingDraft: false,
        criteriaCount: profile.criterionCount,
        brand,
      };
    });

    return NextResponse.json({
      ok: true,
      result,
      safety: {
        profileStatus: "draft",
        criteriaApprovalStatus: "pending",
        buyerProfileApproved: false,
        matchingTriggered: false,
        shortlistCreated: false,
        crmUpdated: false,
        pipelineUpdated: false,
        emailSent: false,
        nurtureChanged: false,
        externalActionExecuted: false,
      },
    }, {
      status: result.duplicate ? 200 : 201,
      headers: leadIntelligenceHeaders(correlationId),
    });
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}
