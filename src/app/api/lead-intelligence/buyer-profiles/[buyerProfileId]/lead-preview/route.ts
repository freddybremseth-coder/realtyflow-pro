import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadIntelligenceRealEstateBrandSchema } from "@/services/lead-intelligence/brand-allowlist";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import {
  assertLeadIntelligenceActionRateLimit,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  withLeadIntelligenceQuery,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ParamsSchema = z.object({
  buyerProfileId: z.string().uuid(),
});

const LeadPreviewQuerySchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
  })
  .strict();

type QueryClientLike = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type LeadPreviewRow = {
  buyer_profile_id: string;
  brand: string;
  contact_id: string | null;
  profile_status: string;
  purchase_readiness: string;
  budget_amount: string | number | null;
  budget_currency: string | null;
  budget_includes_costs: boolean | null;
  budget_approximate: boolean;
  location_flexible: boolean;
  summary: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  linked_contact_name: string | null;
  linked_contact_phone: string | null;
  linked_contact_email: string | null;
};

function maskEmail(value: string | null) {
  if (!value) return null;
  const [local, domain] = value.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
}

function normalizeDate(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function leadTitle(row: LeadPreviewRow) {
  const contact = row.linked_contact_name?.trim();
  if (contact) return `Lead Intelligence: ${contact}`;
  if (row.summary) return `Lead Intelligence: ${row.summary.slice(0, 80)}`;
  return "Lead Intelligence buyer profile";
}

async function buildLeadCreationPreview(input: {
  client: QueryClientLike;
  brand: string;
  buyerProfileId: string;
}) {
  const { rows } = await input.client.query<LeadPreviewRow>(
    `
      select
        profile.id::text as buyer_profile_id,
        profile.brand,
        profile.contact_id::text as contact_id,
        profile.status as profile_status,
        profile.purchase_readiness,
        profile.budget_amount,
        profile.budget_currency,
        profile.budget_includes_costs,
        profile.budget_approximate,
        profile.location_flexible,
        profile.summary,
        profile.created_at,
        profile.updated_at,
        linked_contact.name as linked_contact_name,
        linked_contact.phone as linked_contact_phone,
        linked_contact.email as linked_contact_email
      from public.buyer_profiles profile
      left join lateral (
        select name, phone, email
        from public.lead_intelligence_contact_lookup contact
        where profile.contact_id is not null
          and contact.id = profile.contact_id
        limit 1
      ) linked_contact on true
      where profile.id = $2::uuid
        and profile.brand = $1
        and profile.status <> 'archived'
      limit 1
    `,
    [input.brand, input.buyerProfileId],
  );

  const row = rows[0];
  if (!row) {
    throw new LeadIntelligenceError("BUYER_PROFILE_NOT_FOUND", "Buyer profile was not found", 404);
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (row.profile_status !== "approved") {
    blockers.push("Buyer profile must be approved before a lead can be created.");
  }
  if (!row.contact_id) {
    blockers.push("Buyer profile must be linked to a CRM contact before creating a lead.");
  }
  if (row.contact_id && !row.linked_contact_name && !row.linked_contact_phone && !row.linked_contact_email) {
    blockers.push("Linked contact must still be visible through the same-brand contact lookup before creating a lead.");
  }
  if (!row.summary) {
    warnings.push("Buyer profile summary is empty. Review the lead description before creating a real lead.");
  }
  if (row.budget_amount === null) {
    warnings.push("Budget is missing. Review budget before creating a real lead.");
  }

  return {
    brand: row.brand,
    buyerProfileId: row.buyer_profile_id,
    status: "preview_only" as const,
    canCreateLeadLater: blockers.length === 0,
    blockers,
    warnings,
    proposedLead: {
      title: leadTitle(row),
      brand: row.brand,
      source: "lead_intelligence",
      status: "NEW",
      customerType: "buyer",
      contactId: row.contact_id,
      linkedContact: row.contact_id
        ? {
            contactId: row.contact_id,
            name: row.linked_contact_name,
            maskedPhone: maskPhone(row.linked_contact_phone),
            maskedEmail: maskEmail(row.linked_contact_email),
          }
        : null,
      purchaseReadiness: row.purchase_readiness,
      budget: {
        amount: row.budget_amount === null ? null : Number(row.budget_amount),
        currency: row.budget_currency || "EUR",
        includesCosts: row.budget_includes_costs,
        approximate: row.budget_approximate,
      },
      locationFlexible: row.location_flexible,
      summary: row.summary,
      origin: {
        buyerProfileId: row.buyer_profile_id,
        createdFrom: "lead_intelligence_buyer_profile",
        profileCreatedAt: normalizeDate(row.created_at),
        profileUpdatedAt: normalizeDate(row.updated_at),
      },
    },
    nextRequiredApproval: "A separate create-lead gate must be approved before this preview can write to public.leads.",
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
    assertLeadIntelligenceActionRateLimit(context.email, "lead-preview");

    const routeParams = ParamsSchema.parse(await params);
    const parsed = LeadPreviewQuerySchema.safeParse({
      brand: request.nextUrl.searchParams.get("brand") || "",
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid lead preview request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceQuery(parsed.data.brand, (client) =>
      buildLeadCreationPreview({
        client,
        brand: parsed.data.brand,
        buyerProfileId: routeParams.buyerProfileId,
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
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid lead preview request", 400, {
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
