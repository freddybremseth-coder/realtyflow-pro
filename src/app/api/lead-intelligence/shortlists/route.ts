import { NextRequest, NextResponse } from "next/server";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { isLeadIntelligencePropertyMatchingEnabled } from "@/services/lead-intelligence/feature-flags";
import {
  LeadPropertyMatchPreviewRequestSchema,
  loadApprovedLeadMatchProfileWithDb,
  loadPropertiesByReferencesFromSupabase,
  previewLeadPropertyMatchesForProfile,
} from "@/services/lead-intelligence/property-match-preview";
import {
  LeadPropertyShortlistSaveRequestSchema,
  saveLeadPropertyShortlistDraft,
} from "@/services/lead-intelligence/shortlist";
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

    assertLeadIntelligenceActionRateLimit(context.email, "shortlist-draft");
    const body = await readJsonBody(request, 24 * 1024);
    const parsed = LeadPropertyShortlistSaveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid shortlist draft request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const profile = await withLeadIntelligenceQuery(parsed.data.brand, (client) =>
      loadApprovedLeadMatchProfileWithDb(client, {
        brand: parsed.data.brand,
        buyerProfileId: parsed.data.buyerProfileId,
      }),
    );
    if (!profile) {
      throw new LeadIntelligenceError(
        "BUYER_PROFILE_NOT_FOUND",
        "Approved buyer profile was not found",
        404,
      );
    }

    const propertyIds = parsed.data.items.map((item) => item.propertyId);
    const previewRequest = LeadPropertyMatchPreviewRequestSchema.parse({
      brand: parsed.data.brand,
      buyerProfileId: parsed.data.buyerProfileId,
      propertyIds,
      maxResults: propertyIds.length,
    });
    const matchResult = await previewLeadPropertyMatchesForProfile(
      previewRequest,
      profile,
      (brand, propertyReferences) => loadPropertiesByReferencesFromSupabase(brand, propertyReferences),
    );

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, (client) =>
      saveLeadPropertyShortlistDraft({
        request: parsed.data,
        correlationId,
        createdBy: context.email,
        repository: createLeadIntelligenceRepository(client, context),
        matchResult,
      }),
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
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
