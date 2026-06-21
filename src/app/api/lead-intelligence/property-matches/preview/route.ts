import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCorrelationId } from "@/lib/observability";
import { verifyAdminSession } from "@/lib/admin-auth";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import {
  isLeadIntelligenceEnabled,
  isLeadIntelligencePersistenceEnabled,
  isLeadIntelligencePropertyMatchingEnabled,
} from "@/services/lead-intelligence/feature-flags";
import { LeadIntelligencePersistenceError } from "@/services/lead-intelligence/persistence";
import {
  LeadPropertyMatchPreviewRequestSchema,
  loadApprovedLeadMatchProfileWithDb,
  loadPropertiesByIdsFromSupabase,
  previewLeadPropertyMatchesForProfile,
} from "@/services/lead-intelligence/property-match-preview";
import {
  assertLeadIntelligenceActionRateLimit,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceQuery,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);

  try {
    const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
    if (!session?.email) {
      throw new LeadIntelligenceError("AUTH_REQUIRED", "Authentication required", 401);
    }

    const email = session.email.toLowerCase();
    if (!isLeadIntelligenceEnabled()) {
      throw new LeadIntelligenceError(
        "LEAD_INTELLIGENCE_DISABLED",
        "Lead Intelligence is disabled",
        403,
      );
    }
    if (!isLeadIntelligencePropertyMatchingEnabled()) {
      throw new LeadIntelligenceError(
        "PROPERTY_MATCHING_DISABLED",
        "Lead Intelligence property matching is disabled",
        403,
      );
    }
    if (!isLeadIntelligencePersistenceEnabled()) {
      throw new LeadIntelligencePersistenceError(
        "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED",
        "Lead Intelligence persistence is disabled",
        403,
      );
    }

    assertLeadIntelligenceActionRateLimit(email, "property-match-preview");
    const body = await readJsonBody(request, 24 * 1024);
    const parsed = LeadPropertyMatchPreviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid property match preview request", 400, {
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

    const result = await previewLeadPropertyMatchesForProfile(
      parsed.data,
      profile,
      loadPropertiesByIdsFromSupabase,
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
      },
      {
        status: 200,
        headers: leadIntelligenceHeaders(correlationId),
      },
    );
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}
