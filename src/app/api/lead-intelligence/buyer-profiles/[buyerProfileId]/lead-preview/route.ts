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

function buildBlockers(profile: Awaited<ReturnType<ReturnType<typeof createLeadIntelligenceRepository>["getBuyerProfileContactContext"]>>) {
  const blockers: Array<{ code: string; message: string }> = [];

  if (profile.profileStatus !== "approved") {
    blockers.push({
      code: "PROFILE_NOT_APPROVED",
      message: "Buyer profile must be approved before a lead can be created.",
    });
  }

  if (!profile.linkedContact) {
    blockers.push({
      code: "CONTACT_NOT_LINKED",
      message: "Connect an existing CRM contact or create a reviewed contact before lead creation.",
    });
  }

  if (profile.linkedContact && !profile.linkedContact.name && !profile.linkedContact.maskedPhone && !profile.linkedContact.maskedEmail) {
    blockers.push({
      code: "CONTACT_DETAILS_MISSING",
      message: "The linked contact is missing display details needed for a safe lead preview.",
    });
  }

  return blockers;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ buyerProfileId: string }> },
) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    assertLeadIntelligenceActionRateLimit(context.email, "profile-lead-preview");

    const routeParams = ParamsSchema.parse(await params);
    const body = await readJsonBody(request, 8 * 1024);
    const parsed = BuyerProfileActionInputSchema.safeParse({
      ...body,
      buyerProfileId: routeParams.buyerProfileId,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile lead preview request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, async (client) => {
      const repository = createLeadIntelligenceRepository(client, context);
      const profile = await repository.getBuyerProfileContactContext(parsed.data);
      const blockers = buildBlockers(profile);

      return {
        buyerProfileId: profile.buyerProfileId,
        brand: profile.brand,
        profileStatus: profile.profileStatus,
        readyForLeadCreation: blockers.length === 0,
        blockers,
        preview: {
          source: "lead_intelligence",
          status: "draft",
          contactId: profile.linkedContact?.contactId || null,
          contact: profile.linkedContact,
          buyerProfileId: profile.buyerProfileId,
          summary: profile.contact?.name
            ? `Lead preview for ${profile.contact.name}`
            : "Lead preview from approved buyer profile",
          notes: [
            "Preview only: no row is inserted into public.leads.",
            "Freddy must explicitly approve a later create action before any lead write is allowed.",
          ],
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
          buyerProfileUpdated: false,
          leadsCreated: false,
          emailSent: false,
          tasksCreated: false,
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
    if (error instanceof z.ZodError) {
      return leadIntelligenceJsonError(
        new LeadIntelligenceError("INVALID_REQUEST", "Invalid buyer profile lead preview request", 400, {
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
