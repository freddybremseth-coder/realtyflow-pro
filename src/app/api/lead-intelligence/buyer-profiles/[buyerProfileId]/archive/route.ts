import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { BuyerProfileActionInputSchema } from "@/services/lead-intelligence/persistence";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ParamsSchema = z.object({
  buyerProfileId: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ buyerProfileId: string }> },
) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "profile-archive");

    const routeParams = ParamsSchema.parse(await params);
    const body = await readJsonBody(request, 8 * 1024);
    const parsed = BuyerProfileActionInputSchema.safeParse({
      ...body,
      buyerProfileId: routeParams.buyerProfileId,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile archive request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, (client) =>
      createLeadIntelligenceRepository(client, context).archiveBuyerProfile(parsed.data),
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result: {
          buyerProfileId: result.id,
          status: result.status,
          duplicate: result.duplicate,
          archived: true,
        },
        sideEffects: {
          profileArchived: true,
          contactsCreated: false,
          contactsUpdated: false,
          leadsCreated: false,
          emailSent: false,
          propertyMatchingStarted: false,
          presentationCreated: false,
        },
      },
      {
        status: result.duplicate ? 200 : 201,
        headers: leadIntelligenceHeaders(correlationId),
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return leadIntelligenceJsonError(
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile archive request", 400, {
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
