import { NextRequest, NextResponse } from "next/server";
import { LeadIntelligenceWorklistQuerySchema } from "@/services/lead-intelligence/persistence";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  withLeadIntelligenceQuery,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "worklist");

    const parsed = LeadIntelligenceWorklistQuerySchema.safeParse({
      brand: request.nextUrl.searchParams.get("brand") || "",
      limit: request.nextUrl.searchParams.get("limit") || undefined,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid Lead Intelligence worklist request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const items = await withLeadIntelligenceQuery(parsed.data.brand, async (client) =>
      createLeadIntelligenceRepository(client, context).listWorklist(parsed.data),
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result: {
          brand: parsed.data.brand,
          limit: parsed.data.limit,
          items,
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
