import { NextRequest, NextResponse } from "next/server";
import {
  LeadIntelligenceContactCandidatesRequestSchema,
} from "@/services/lead-intelligence/review";
import {
  assertLeadIntelligenceActionRateLimit,
  findContactCandidatePreviews,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
} from "@/services/lead-intelligence/server-runtime";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "contact-candidates");
    const body = await readJsonBody(request, 16 * 1024);
    const parsed = LeadIntelligenceContactCandidatesRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid contact candidate request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const candidates = await findContactCandidatePreviews(parsed.data);
    return NextResponse.json(
      {
        ok: true,
        correlationId,
        candidates,
        requiresManualSelection:
          candidates.length !== 1 || candidates[0]?.matchType === "name_similarity",
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
