import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  LeadIntelligenceReviewSaveRequestSchema,
  saveLeadIntelligenceReview,
} from "@/services/lead-intelligence/review";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  findContactCandidatePreviewsWithDb,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  verifySelectedContactCandidateWithDb,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "review");
    const body = await readJsonBody(request, 64 * 1024);
    const parsed = LeadIntelligenceReviewSaveRequestSchema.safeParse({
      ...body,
      correlationId,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid Lead Intelligence review", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceTransaction(async (client) => {
      const serverCandidates = await findContactCandidatePreviewsWithDb(client, {
        brand: parsed.data.brand,
        contact: parsed.data.analysis.contact,
      });
      const selectedCandidate =
        parsed.data.contactDecision.action === "connect_existing"
          ? await verifySelectedContactCandidateWithDb(client, {
              brand: parsed.data.brand,
              contactId: parsed.data.contactDecision.contactId!,
              contact: parsed.data.analysis.contact,
            })
          : null;
      const verifiedCandidates =
        selectedCandidate &&
        !serverCandidates.some((candidate) => candidate.contactId === selectedCandidate.contactId)
          ? [selectedCandidate, ...serverCandidates]
          : serverCandidates;

      return saveLeadIntelligenceReview({
        request: parsed.data,
        repository: createLeadIntelligenceRepository(client, context),
        serverContactCandidates: verifiedCandidates,
        approvedBy: context.email,
      });
    });

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
        sideEffects: {
          contactsCreated: false,
          contactUpdated: false,
          emailSent: false,
          propertyMatchingStarted: false,
        },
      },
      {
        status: 201,
        headers: leadIntelligenceHeaders(correlationId),
      },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return leadIntelligenceJsonError(
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid Lead Intelligence review", 400, {
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
