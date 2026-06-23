import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { BuyerProfileActionInputSchema } from "@/services/lead-intelligence/persistence";
import { redactLeadContactCandidatePreviews } from "@/services/lead-intelligence/review";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  findContactCandidatePreviewsWithDb,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceQuery,
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
    assertLeadIntelligenceActionRateLimit(context.email, "profile-contact-candidates");

    const routeParams = ParamsSchema.parse(await params);
    const body = await readJsonBody(request, 8 * 1024);
    const parsed = BuyerProfileActionInputSchema.safeParse({
      ...body,
      buyerProfileId: routeParams.buyerProfileId,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile contact candidate request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceQuery(parsed.data.brand, async (client) => {
      const repository = createLeadIntelligenceRepository(client, context);
      const profile = await repository.getBuyerProfileContactContext(parsed.data);
      if (!profile.contact) {
        throw new LeadIntelligenceError(
          "INVALID_REQUEST",
          "Buyer profile does not have reviewed contact data to compare",
          400,
        );
      }
      const candidates = await findContactCandidatePreviewsWithDb(client, {
        brand: parsed.data.brand,
        contact: profile.contact,
      });
      return {
        buyerProfileId: profile.buyerProfileId,
        linkedContact: profile.linkedContact,
        candidates: redactLeadContactCandidatePreviews(candidates),
        requiresManualSelection:
          candidates.length !== 1 || candidates[0]?.matchType === "name_similarity",
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
    if (error instanceof z.ZodError) {
      return leadIntelligenceJsonError(
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile contact candidate request", 400, {
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
