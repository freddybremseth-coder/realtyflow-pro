import { NextRequest, NextResponse } from "next/server";
import { LeadIntelligenceError } from "@/services/lead-intelligence/extraction";
import { isLeadIntelligencePropertyMatchingEnabled } from "@/services/lead-intelligence/feature-flags";
import {
  LeadCustomerPresentationDraftHistoryQuerySchema,
  LeadCustomerPresentationDraftRequestSchema,
  LeadCustomerPresentationDraftLookupQuerySchema,
  saveLeadCustomerPresentationDraft,
} from "@/services/lead-intelligence/presentation";
import {
  assertLeadIntelligenceActionRateLimit,
  createLeadIntelligenceRepository,
  getLeadIntelligenceRouteContext,
  leadIntelligenceHeaders,
  leadIntelligenceJsonError,
  readJsonBody,
  withLeadIntelligenceQuery,
  withLeadIntelligenceTransaction,
} from "@/services/lead-intelligence/server-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    if (!isLeadIntelligencePropertyMatchingEnabled()) {
      throw new LeadIntelligenceError(
        "PROPERTY_MATCHING_DISABLED",
        "Lead Intelligence property matching is disabled",
        403,
      );
    }

    assertLeadIntelligenceActionRateLimit(context.email, "presentation-draft");
    const brand = request.nextUrl.searchParams.get("brand") || "";
    const presentationId = request.nextUrl.searchParams.get("presentationId") || "";
    const buyerProfileId = request.nextUrl.searchParams.get("buyerProfileId") || "";
    const limit = request.nextUrl.searchParams.get("limit") || undefined;

    if (buyerProfileId && !presentationId) {
      const parsed = LeadCustomerPresentationDraftHistoryQuerySchema.safeParse({
        brand,
        buyerProfileId,
        limit,
      });
      if (!parsed.success) {
        throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid presentation draft history request", 400, {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const items = await withLeadIntelligenceQuery(parsed.data.brand, (client) =>
        createLeadIntelligenceRepository(client, context).listCustomerPresentationDraftHistory(parsed.data),
      );

      return NextResponse.json(
        {
          ok: true,
          correlationId,
          result: {
            brand: parsed.data.brand,
            buyerProfileId: parsed.data.buyerProfileId,
            limit: parsed.data.limit,
            items,
          },
        },
        {
          status: 200,
          headers: leadIntelligenceHeaders(correlationId),
        },
      );
    }

    const parsed = LeadCustomerPresentationDraftLookupQuerySchema.safeParse({
      brand,
      presentationId,
    });
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid presentation draft lookup request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceQuery(parsed.data.brand, (client) =>
      createLeadIntelligenceRepository(client, context).getCustomerPresentationDraft(parsed.data),
    );

    if (!result) {
      throw new LeadIntelligenceError("PRESENTATION_DRAFT_NOT_FOUND", "Presentation draft was not found", 404);
    }

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
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

export async function POST(request: NextRequest) {
  let correlationId = request.headers.get("x-correlation-id") || "unknown";

  try {
    const context = await getLeadIntelligenceRouteContext(request);
    correlationId = context.correlationId;
    if (!isLeadIntelligencePropertyMatchingEnabled()) {
      throw new LeadIntelligenceError(
        "PROPERTY_MATCHING_DISABLED",
        "Lead Intelligence property matching is disabled",
        403,
      );
    }

    assertLeadIntelligenceActionRateLimit(context.email, "presentation-draft");
    const body = await readJsonBody(request, 16 * 1024);
    const parsed = LeadCustomerPresentationDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid presentation draft request", 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await withLeadIntelligenceTransaction(parsed.data.brand, (client) =>
      saveLeadCustomerPresentationDraft({
        request: parsed.data,
        correlationId,
        createdBy: context.email,
        repository: createLeadIntelligenceRepository(client, context),
      }),
    );

    return NextResponse.json(
      {
        ok: true,
        correlationId,
        result,
      },
      {
        status: result.duplicate ? 200 : 201,
        headers: leadIntelligenceHeaders(correlationId),
      },
    );
  } catch (error) {
    return leadIntelligenceJsonError(error, correlationId);
  }
}
