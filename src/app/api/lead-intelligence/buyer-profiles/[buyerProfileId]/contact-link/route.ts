import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { isLeadIntelligenceConnectExistingEnabled } from "@/services/lead-intelligence/feature-flags";
import { BuyerProfileActionInputSchema } from "@/services/lead-intelligence/persistence";
import { LeadIntelligenceReviewError } from "@/services/lead-intelligence/review";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  verifySelectedContactCandidateWithDb,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ParamsSchema = z.object({
  buyerProfileId: z.string().uuid(),
});

const ContactLinkRequestSchema = BuyerProfileActionInputSchema.extend({
  contactId: z.string().uuid(),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ buyerProfileId: string }> },
) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    if (!isLeadIntelligenceConnectExistingEnabled()) {
      throw new LeadIntelligenceReviewError(
        "CONTACT_LINKING_DISABLED",
        "Connecting an existing contact is disabled until the dedicated contact-linking gate is enabled",
        403,
      );
    }
    assertLeadIntelligenceActionRateLimit(context.email, "profile-contact-link");

    const routeParams = ParamsSchema.parse(await params);
    const body = await readJsonBody(request, 8 * 1024);
    const parsed = ContactLinkRequestSchema.safeParse({
      ...body,
      buyerProfileId: routeParams.buyerProfileId,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile contact link request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, async (client) => {
      const repository = createLeadIntelligenceRepository(client, context);
      const profile = await repository.getBuyerProfileContactContext(parsed.data);
      if (!profile.contact) {
        throw new LeadIntelligenceError(
          "INVALID_REQUEST",
          "Buyer profile does not have reviewed contact data to compare",
          400,
        );
      }
      const verifiedCandidate = await verifySelectedContactCandidateWithDb(client, {
        brand: parsed.data.brand,
        contactId: parsed.data.contactId,
        contact: profile.contact,
      });
      const link = await repository.linkBuyerProfileContact(parsed.data);
      return {
        buyerProfileId: link.id,
        contactId: link.contactId,
        duplicate: link.duplicate,
        linkedContact: {
          contactId: verifiedCandidate.contactId,
          name: verifiedCandidate.name,
          maskedPhone: verifiedCandidate.maskedPhone,
          maskedEmail: verifiedCandidate.maskedEmail,
        },
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
          buyerProfileUpdated: true,
          leadsCreated: false,
          emailSent: false,
          propertyMatchingStarted: false,
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
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile contact link request", 400, {
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
