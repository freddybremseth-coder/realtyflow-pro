import { NextRequest, NextResponse } from "next/server";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { DeleteBuyerProfilesInputSchema } from "@/services/lead-intelligence/persistence";
import {
  assertLeadIntelligenceActionRateLimit,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
} from "@/services/lead-intelligence/server-runtime";
import {
  createSupabaseBuyerProfileDeleteStore,
  deleteBuyerProfilesThroughStore,
} from "@/services/lead-intelligence/delete-buyer-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "profile-delete");

    const body = await readJsonBody(request, 16 * 1024);
    const parsed = DeleteBuyerProfilesInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile delete request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // Hard deletion is an explicit admin action. The normal Lead Intelligence
    // runtime role intentionally has no DELETE privilege, so this one bounded
    // operation uses the server-only Supabase service role. Brand and UUIDs are
    // validated above, and database foreign-key cascades remove only dependent
    // Lead Intelligence drafts. CRM contacts are never deleted here.
    const result = await deleteBuyerProfilesThroughStore(
      createSupabaseBuyerProfileDeleteStore(),
      parsed.data,
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
        sideEffects: {
          buyerProfilesDeleted: result.deletedCount,
          cascadedLeadIntelligenceDrafts: true,
          contactsCreated: false,
          contactsUpdated: false,
          contactsDeleted: false,
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
    return leadIntelligenceJsonError(error, correlationId);
  }
}
