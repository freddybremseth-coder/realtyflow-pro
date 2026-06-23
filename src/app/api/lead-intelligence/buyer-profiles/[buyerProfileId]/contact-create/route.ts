import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { isLeadIntelligenceCreateContactEnabled } from "@/services/lead-intelligence/feature-flags";
import { BuyerProfileActionInputSchema, LeadIntelligencePersistenceError } from "@/services/lead-intelligence/persistence";
import { LeadIntelligenceReviewError } from "@/services/lead-intelligence/review";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  findContactCandidatePreviewsWithDb,
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
    if (!isLeadIntelligenceCreateContactEnabled()) {
      throw new LeadIntelligenceReviewError(
        "CONTACT_CREATION_DISABLED",
        "Creating a CRM contact from Lead Intelligence is disabled until the dedicated gate is enabled",
        403,
      );
    }
    assertLeadIntelligenceActionRateLimit(context.email, "profile-contact-create");

    const routeParams = ParamsSchema.parse(await params);
    const body = await readJsonBody(request, 8 * 1024);
    const parsed = BuyerProfileActionInputSchema.safeParse({
      ...body,
      buyerProfileId: routeParams.buyerProfileId,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile contact create request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, async (client) => {
      const repository = createLeadIntelligenceRepository(client, context);
      const profile = await repository.getBuyerProfileContactContext(parsed.data);
      if (profile.linkedContact) {
        return {
          buyerProfileId: profile.buyerProfileId,
          contactId: profile.linkedContact.contactId,
          linkedContact: profile.linkedContact,
          duplicate: true,
        };
      }
      if (!profile.contact?.name) {
        throw new LeadIntelligenceError(
          "INVALID_REQUEST",
          "Reviewed contact name is required before creating a CRM contact",
          400,
        );
      }

      const candidates = await findContactCandidatePreviewsWithDb(client, {
        brand: parsed.data.brand,
        contact: profile.contact,
      });
      if (candidates.some((candidate) => candidate.matchType === "exact_phone" || candidate.matchType === "exact_email")) {
        throw new LeadIntelligencePersistenceError(
          "CONTACT_CANDIDATE_EXISTS",
          "An exact existing contact candidate must be reviewed before creating a new contact",
          409,
        );
      }

      const created = await repository.createContactForBuyerProfile({
        ...parsed.data,
        contactId: randomUUID(),
        contact: profile.contact,
        createdBy: context.email,
      });

      return {
        buyerProfileId: created.buyerProfileId,
        contactId: created.contactId,
        linkedContact: {
          contactId: created.contactId,
          name: created.name,
          maskedPhone: created.maskedPhone,
          maskedEmail: created.maskedEmail,
        },
        duplicate: false,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
        sideEffects: {
          contactsCreated: !result.duplicate,
          contactsUpdated: false,
          buyerProfileUpdated: !result.duplicate,
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
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile contact create request", 400, {
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
