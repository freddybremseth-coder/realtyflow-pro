import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validatePersonaBackfillApproval } from "@/lib/persona-backfill";
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

const RoutingPersonaSchema = z.enum([
  "retiree",
  "family",
  "investor",
  "holiday_home",
  "permanent_resident",
  "nature_seeker",
  "coastal_social",
]);

const RequestSchema = z.object({
  contactId: z.string().uuid(),
  persona: RoutingPersonaSchema,
  brand: LeadIntelligenceRealEstateBrandSchema,
}).strict();

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asInteractions(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];
}

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";
  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "persona-backfill-approve");

    const parsed = RequestSchema.safeParse(await readJsonBody(request, 16 * 1024));
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid Persona backfill approval", 400, {
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
        pipeline_status: string | null;
        pipeline_value: number | null;
        source: string | null;
        brand_id: string | null;
        brand: string | null;
        interactions: unknown;
      }>(
        `select id::text, name, email, phone, notes, property_interest, pipeline_status, pipeline_value,
                source, brand_id, brand, interactions
           from public.contacts
          where id = $1::uuid
          for update`,
        [parsed.data.contactId],
      );
      const contact = contactResult.rows[0];
      if (!contact) throw new LeadIntelligenceError("INVALID_REQUEST", "CRM contact not found", 404);

      const brandParse = LeadIntelligenceRealEstateBrandSchema.safeParse(text(contact.brand_id || contact.brand, 80));
      if (!brandParse.success) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Contact brand is not eligible for Buyer Profile Persona routing", 409);
      }
      const brand = brandParse.data;
      if (brand !== parsed.data.brand) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Contact brand changed or does not match the reviewed Persona candidate", 409);
      }

      const validation = validatePersonaBackfillApproval({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        notes: contact.notes,
        property_interest: contact.property_interest,
        pipeline_status: contact.pipeline_status,
        pipeline_value: contact.pipeline_value,
        source: contact.source,
        interactions: asInteractions(contact.interactions),
      }, parsed.data.persona, 80);

      if (!validation.ok || !validation.persona) {
        throw new LeadIntelligenceError("INVALID_REQUEST", validation.reason, 409, {
          candidate: {
            persona: validation.candidate.persona,
            confidence: validation.candidate.confidence,
            reason: validation.candidate.reason,
          },
        });
      }

      const existingProfiles = await client.query<{
        id: string;
        version: number;
        status: string;
      }>(
        `select id::text, version, status
           from public.buyer_profiles
          where contact_id = $1::uuid and status = 'approved'
          order by version desc
          limit 1`,
        [contact.id],
      );
      const existingProfile = existingProfiles.rows[0] || null;

      if (existingProfile) {
        const personaResult = await client.query<{ value: unknown }>(
          `select value
             from public.buyer_profile_criteria
            where buyer_profile_id = $1::uuid
              and key = 'other'
              and other_key = 'routing_persona'
              and approval_status = 'approved'
              and active = true
            limit 1`,
          [existingProfile.id],
        );
        const existingPersona = typeof personaResult.rows[0]?.value === "string"
          ? personaResult.rows[0].value
          : null;

        if (existingPersona === validation.persona) {
          return {
            buyerProfileId: existingProfile.id,
            version: existingProfile.version,
            persona: validation.persona,
            confidence: validation.candidate.confidence,
            duplicate: true,
            existingProfile: true,
          };
        }
        throw new LeadIntelligenceError(
          "INVALID_REQUEST",
          existingPersona
            ? `Approved Buyer Profile already has routing-persona ${existingPersona}. Use Buyer Profile revision to change it.`
            : "An approved Buyer Profile already exists. Add Persona through Buyer Intake review/revision so existing approved criteria are preserved.",
          409,
        );
      }

      const repository = createLeadIntelligenceRepository(client, context);
      const approvedAt = new Date().toISOString();
      const idempotencyKey = stableLeadIntelligenceIdempotencyKey("persona-backfill-v1", {
        contactId: contact.id,
        brand,
        persona: validation.persona,
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

      const evidenceText = validation.candidate.evidence
        .map((row) => `${row.field}: ${row.signal} — ${row.excerpt}`)
        .join(" | ")
        .slice(0, 1800);
      const budget = Number(contact.pipeline_value || 0);
      const profile = await repository.createBuyerProfile({
        brand,
        contactId: contact.id,
        intakeId: intake.id,
        version: 1,
        status: "approved",
        purchaseReadiness: "unknown",
        budgetAmount: Number.isFinite(budget) && budget > 0 ? budget : null,
        budgetCurrency: "EUR",
        budgetIncludesCosts: null,
        budgetApproximate: true,
        locationFlexible: false,
        summary: `Persona backfill for ${contact.name || contact.email || "CRM lead"}. Godkjent routing-persona: ${validation.persona}. Basert på eksisterende CRM-evidens; øvrige Buyer Profile-felt er ikke bekreftet.`,
        createdBy: context.email,
        approvedBy: context.email,
        approvedAt,
        criteria: [{
          criterionType: "hard_requirement",
          key: "other",
          otherKey: "routing_persona",
          operator: "eq",
          value: validation.persona,
          weight: null,
          severity: null,
          appliesToPropertyTypes: [],
          source: "manual",
          sourceText: `Godkjent Persona Backfill. AI confidence ${validation.candidate.confidence}%. Evidence: ${evidenceText || "ikke oppgitt"}`,
          confidence: validation.candidate.confidence / 100,
          customerConfirmed: false,
          approvalStatus: "approved",
          approvedBy: context.email,
          approvedAt,
          active: true,
        }],
      });

      return {
        buyerProfileId: profile.id,
        version: 1,
        persona: validation.persona,
        confidence: validation.candidate.confidence,
        duplicate: Boolean(profile.duplicate),
        intakeId: intake.id,
        existingProfile: false,
      };
    });

    return NextResponse.json({
      ok: true,
      result,
      sideEffects: {
        emailSent: false,
        crmUpdated: false,
        nurtureStateChanged: false,
        liveNurtureEnabled: false,
      },
    }, {
      status: result.duplicate ? 200 : 201,
      headers: leadIntelligenceHeaders(correlationId),
    });
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}
