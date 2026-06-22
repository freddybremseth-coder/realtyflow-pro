import { NextRequest, NextResponse } from "next/server";
import {
  LeadIntelligenceCrmContextRequestSchema,
  loadLeadIntelligenceCrmContext,
} from "@/services/lead-intelligence/crm-context";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { redactLeadContactCandidatePreviews } from "@/services/lead-intelligence/review";
import {
  assertLeadIntelligenceActionRateLimit,
  findContactCandidatePreviewsWithDb,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceQuery,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "crm-context");

    const body = await readJsonBody(request, 16 * 1024);
    const parsed = LeadIntelligenceCrmContextRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid Lead Intelligence CRM context request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceQuery(parsed.data.brand, async (db) => {
      const candidates = await findContactCandidatePreviewsWithDb(db, {
        brand: parsed.data.brand,
        contact: parsed.data.contact,
      });
      const contextItems = await loadLeadIntelligenceCrmContext({
        db,
        candidates,
        contactIds: parsed.data.contactIds,
      });
      return {
        candidates: redactLeadContactCandidatePreviews(candidates),
        context: contextItems,
      };
    });

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
